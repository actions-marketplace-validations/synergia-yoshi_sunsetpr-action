import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Lang, parse, registerDynamicLanguage, type SgNode } from "@ast-grep/napi";
import type {
  ApiLifecycleEntry,
  Finding,
  LifecycleEntry,
  Location,
  MigrationRiskFinding,
  ModelFinding,
  Provider,
  RuntimeCheckFinding,
} from "./types.js";

function pythonParserPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const platformNames: Partial<Record<NodeJS.Platform, string>> = {
    darwin: "macOS",
    linux: "Linux",
    win32: "Windows",
  };
  const architectureNames: Partial<Record<NodeJS.Architecture, string>> = {
    arm64: "ARM64",
    x64: "X64",
  };
  const platformName = platformNames[process.platform];
  const architectureName = architectureNames[process.arch];
  const candidates = [
    process.env.SUNSETPR_PYTHON_PARSER,
    path.join(moduleDirectory, "python-parser", "parser.so"),
    platformName && architectureName
      ? path.resolve(
          moduleDirectory,
          "../../node_modules/@ast-grep/lang-python/prebuilds",
          `prebuild-${platformName}-${architectureName}`,
          "parser.so",
        )
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const parserPath = candidates.find((candidate) => existsSync(candidate));
  if (!parserPath) {
    throw new Error(
      `No bundled Python parser is available for ${process.platform}-${process.arch}`,
    );
  }
  return parserPath;
}

registerDynamicLanguage({
  python: {
    libraryPath: pythonParserPath(),
    extensions: ["py"],
    languageSymbol: "tree_sitter_python",
    expandoChar: "µ",
  },
});

interface SdkCall {
  provider: Provider;
  name: string;
}

const ANTHROPIC_PARAMETER_SOURCE =
  "https://platform.claude.com/docs/en/about-claude/model-deprecations";
const ANTHROPIC_TARGETS_WITHOUT_SAMPLING_PARAMETERS = new Set([
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-5",
]);
const ANTHROPIC_UNSUPPORTED_SAMPLING_PARAMETERS = new Set(["temperature", "top_p", "top_k"]);

function walk(node: SgNode, callback: (node: SgNode) => void): void {
  callback(node);
  for (const child of node.children()) {
    walk(child, callback);
  }
}

function toLocation(
  relativePath: string,
  line: number,
  column: number,
  byteStart: number,
  byteEnd: number,
): Location {
  return { path: relativePath, line: line + 1, column: column + 1, byteStart, byteEnd };
}

function findingId(kind: string, location: Location, discriminator: string): string {
  return `${kind}:${location.path}:${location.line}:${location.column}:${discriminator}`;
}

function providerEvidence(content: string, provider: Provider): boolean {
  switch (provider) {
    case "openai":
      return /(?:from\s+["'](?:@langchain\/)?openai["']|from\s+openai\b|require\(["']openai["']\)|\bOpenAI(?:Client)?\b)/.test(
        content,
      );
    case "anthropic":
      return /(?:@anthropic-ai\/sdk|from\s+anthropic\b|import\s+anthropic\b|\bAnthropic\b)/.test(
        content,
      );
    case "gemini":
      return /(?:@google\/(?:generative-ai|genai)|google\.generativeai|\bGoogleGenerativeAI\b|\bGeminiClient\b|\bgenai\b)/.test(
        content,
      );
    case "cohere":
      return /(?:cohere-ai|from\s+cohere\b|import\s+cohere\b|\bCohereClient(?:V2)?\b)/.test(
        content,
      );
    case "xai":
      return /https:\/\/api\.x\.ai(?:\/|["'])/.test(content);
  }
  return false;
}

function detectSdkCall(text: string, content: string): SdkCall | null {
  if (
    /\.(?:responses|chat\.completions)\.create\s*\(/.test(text) ||
    /\.beta\.chat\.completions\.runTools\s*\(/.test(text) ||
    /\bChatCompletion\.create\s*\(/.test(text)
  ) {
    return {
      provider: providerEvidence(content, "xai") ? "xai" : "openai",
      name: providerEvidence(content, "xai")
        ? "xAI OpenAI-compatible"
        : /\.runTools\s*\(/.test(text)
          ? "OpenAI runTools"
          : "OpenAI create",
    };
  }
  if (/\.(?:v2\.)?(?:chat|embed|rerank)\s*\(/.test(text) && providerEvidence(content, "cohere")) {
    return { provider: "cohere", name: "Cohere v2" };
  }
  if (/\.messages\.create\s*\(/.test(text) && providerEvidence(content, "anthropic")) {
    return { provider: "anthropic", name: "Anthropic Messages" };
  }
  if (
    /\.(?:models\.)?(?:generateContent|generate_content)\s*\(/.test(text) ||
    /\.getGenerativeModel\s*\(/.test(text) ||
    /(?:^|\.)GenerativeModel\s*\(/.test(text)
  ) {
    if (providerEvidence(content, "gemini")) {
      return { provider: "gemini", name: "Gemini generate content" };
    }
  }
  return null;
}

function modelArgument(call: SgNode): SgNode | null {
  let result: SgNode | null = null;
  walk(call, (node) => {
    if (result) {
      return;
    }
    const text = node.text();
    if (
      node.kind() === "pair" &&
      /^\s*(?:model|modelId|model_id|modelName|model_name)\s*:/.test(text)
    ) {
      result = node;
    } else if (
      node.kind() === "keyword_argument" &&
      /^\s*(?:model|model_id|model_name)\s*=/.test(text)
    ) {
      result = node;
    } else if (
      node.kind() === "shorthand_property_identifier" &&
      /^(?:model|modelId|model_id|modelName)$/.test(text.trim())
    ) {
      result = node;
    }
  });
  if (!result && /(?:^|\.)GenerativeModel\s*\(/.test(call.text())) {
    walk(call, (node) => {
      if (!result && stringValue(node) !== null) {
        result = node;
      }
    });
  }
  return result;
}

function stringValue(node: SgNode): string | null {
  if (node.kind() !== "string" && node.kind() !== "template_string") {
    return null;
  }
  const text = node.text();
  const match = text.match(/^(?:[rubfRUBF]*)(["'`])([\s\S]*)\1$/);
  return match?.[2] ?? null;
}

function hasLiteralModelInNode(node: SgNode): boolean {
  let found = false;
  walk(node, (descendant) => {
    const value = stringValue(descendant);
    if (value !== null) {
      found = true;
    }
  });
  return found;
}

function isDirectLiteralModelExpression(text: string): boolean {
  const trimmed = text.trim();
  const match = trimmed.match(/^(?:[rubfRUBF]*)(["'`])([\s\S]*)\1$/);
  if (!match) {
    return false;
  }
  return match[1] !== "`" || !match[2]?.includes("${");
}

function modelExpression(argument: SgNode): string {
  return argument
    .text()
    .replace(/^\s*(?:model|modelId|model_id|modelName|model_name)\s*[:=]\s*/, "")
    .trim();
}

function identifierOccurrences(content: string, identifier: string): number {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (content.match(new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, "g")) ?? [])
    .length;
}

function declarationIdentifier(node: SgNode): string | null {
  const match = node.text().match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?::[^=]+)?=/);
  return match?.[1] ?? null;
}

function directStaticSdkConstants(root: SgNode, content: string): Map<string, SdkCall> {
  const uses = new Map<string, SdkCall[]>();
  walk(root, (node) => {
    if (!["call", "call_expression"].includes(String(node.kind()))) {
      return;
    }
    const sdk = detectSdkCall(node.text(), content);
    const argument = sdk ? modelArgument(node) : null;
    const expression = argument ? modelExpression(argument) : "";
    if (!sdk || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expression)) {
      return;
    }
    const existing = uses.get(expression) ?? [];
    existing.push(sdk);
    uses.set(expression, existing);
  });

  const constants = new Map<string, SdkCall>();
  walk(root, (node) => {
    if (node.kind() !== "variable_declarator") {
      return;
    }
    const identifier = declarationIdentifier(node);
    const initializer = node.children().at(-1);
    const declaration = node
      .ancestors()
      .find((ancestor) => ancestor.kind() === "lexical_declaration");
    const sdkUses = identifier ? uses.get(identifier) : undefined;
    if (
      !identifier ||
      !declaration ||
      !/^\s*const\b/.test(declaration.text()) ||
      !initializer ||
      !isDirectLiteralModelExpression(initializer.text()) ||
      sdkUses?.length !== 1 ||
      identifierOccurrences(content, identifier) !== 2
    ) {
      return;
    }
    constants.set(identifier, sdkUses[0] as SdkCall);
  });
  return constants;
}

function modelContext(
  node: SgNode,
  content: string,
  provider: Provider,
  staticConstants: Map<string, SdkCall>,
): {
  sourceKind: "hardcoded" | "environment";
  confidence: "high" | "medium";
  sdk: string | null;
} | null {
  for (const ancestor of node.ancestors()) {
    const text = ancestor.text();
    if (
      ancestor.kind() === "pair" &&
      /^\s*(?:model|modelId|model_id|modelName|model_name)\s*:/.test(text)
    ) {
      const call = ancestor
        .ancestors()
        .find((candidate) => ["call", "call_expression"].includes(String(candidate.kind())));
      const sdk = call ? detectSdkCall(call.text(), content) : null;
      return {
        sourceKind: /(?:process\.env|Deno\.env|import\.meta\.env)/.test(text)
          ? "environment"
          : "hardcoded",
        confidence: sdk?.provider === provider ? "high" : "medium",
        sdk: sdk?.provider === provider ? sdk.name : null,
      };
    }
    if (
      ancestor.kind() === "keyword_argument" &&
      /^\s*(?:model|model_id|model_name)\s*=/.test(text)
    ) {
      const call = ancestor
        .ancestors()
        .find((candidate) => ["call", "call_expression"].includes(String(candidate.kind())));
      const sdk = call ? detectSdkCall(call.text(), content) : null;
      return {
        sourceKind: /(?:os\.(?:environ|getenv)|environ\.get)/.test(text)
          ? "environment"
          : "hardcoded",
        confidence: sdk?.provider === provider ? "high" : "medium",
        sdk: sdk?.provider === provider ? sdk.name : null,
      };
    }
    if (
      ["call", "call_expression"].includes(String(ancestor.kind())) &&
      /(?:^|\.)GenerativeModel\s*\(/.test(ancestor.text())
    ) {
      const sdk = detectSdkCall(ancestor.text(), content);
      return {
        sourceKind: "hardcoded",
        confidence: sdk?.provider === provider ? "high" : "medium",
        sdk: sdk?.provider === provider ? sdk.name : null,
      };
    }
    if (ancestor.kind() === "variable_declarator") {
      const identifier = declarationIdentifier(ancestor);
      const sdk = identifier ? staticConstants.get(identifier) : undefined;
      if (sdk?.provider === provider) {
        return {
          sourceKind: "hardcoded",
          confidence: "high",
          sdk: sdk.name,
        };
      }
    }
    if (
      ["variable_declarator", "assignment", "expression_statement"].includes(
        String(ancestor.kind()),
      ) &&
      /\b[A-Za-z_]*model[A-Za-z0-9_]*\s*[:=]/i.test(text)
    ) {
      return {
        sourceKind: /(?:process\.env|Deno\.env|import\.meta\.env|os\.(?:environ|getenv))/.test(text)
          ? "environment"
          : "hardcoded",
        confidence: "medium",
        sdk: null,
      };
    }
  }
  return null;
}

function modelIdByteRange(node: SgNode, modelId: string): { start: number; end: number } {
  const offset = Buffer.byteLength(node.text().slice(0, node.text().indexOf(modelId)), "utf8");
  const start = node.range().start.index + offset;
  return { start, end: start + Buffer.byteLength(modelId, "utf8") };
}

function runtimeSourceKind(text: string): "environment" | "dynamic" {
  return /(?:process\.env|Deno\.env|import\.meta\.env|os\.(?:environ|getenv)|environ\.get)/.test(
    text,
  )
    ? "environment"
    : "dynamic";
}

function literalModelEntry(
  argument: SgNode,
  entries: Map<string, LifecycleEntry>,
): LifecycleEntry | null {
  let result: LifecycleEntry | null = null;
  walk(argument, (node) => {
    if (result) {
      return;
    }
    const value = stringValue(node);
    const entry = value ? entries.get(value) : undefined;
    if (entry) {
      result = entry;
    }
  });
  return result;
}

function parameterNameAndValue(
  node: SgNode,
): { name: "temperature" | "top_p" | "top_k"; value: string } | null {
  if (!["pair", "keyword_argument"].includes(String(node.kind()))) {
    return null;
  }
  const match = node.text().match(/^\s*(temperature|top_p|top_k)\s*[:=]\s*([\s\S]+?)\s*$/);
  if (!match || !ANTHROPIC_UNSUPPORTED_SAMPLING_PARAMETERS.has(match[1] ?? "")) {
    return null;
  }
  return {
    name: match[1] as "temperature" | "top_p" | "top_k",
    value: match[2] ?? "",
  };
}

function isDirectRequestParameter(candidate: SgNode, call: SgNode): boolean {
  const ancestors = candidate.ancestors();
  const nearestCall = ancestors.find((ancestor) =>
    ["call", "call_expression"].includes(String(ancestor.kind())),
  );
  if (!nearestCall || nearestCall.range().start.index !== call.range().start.index) {
    return false;
  }
  if (candidate.kind() === "keyword_argument") {
    return true;
  }
  const objectsBeforeCall = ancestors
    .slice(0, ancestors.indexOf(nearestCall))
    .filter((ancestor) => ancestor.kind() === "object");
  return objectsBeforeCall.length === 1;
}

function isStaticNumericValue(value: string): boolean {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.replaceAll("_", ""));
}

function propertyDeletionRange(
  content: string,
  start: number,
  end: number,
): { start: number; end: number; oldText: string } {
  const bytes = Buffer.from(content, "utf8");
  let expandedStart = start;
  let expandedEnd = end;
  while (expandedEnd < bytes.length && [9, 32].includes(bytes[expandedEnd] ?? -1)) {
    expandedEnd += 1;
  }
  if (bytes[expandedEnd] === 44) {
    expandedEnd += 1;
    while (expandedEnd < bytes.length && [9, 32].includes(bytes[expandedEnd] ?? -1)) {
      expandedEnd += 1;
    }
  } else {
    let cursor = expandedStart - 1;
    while (cursor >= 0 && [9, 32].includes(bytes[cursor] ?? -1)) {
      cursor -= 1;
    }
    if (bytes[cursor] === 44) {
      expandedStart = cursor;
    }
  }
  const precedingNewline = bytes.lastIndexOf(10, start - 1);
  const lineStart = precedingNewline + 1;
  const leadingText = bytes.subarray(lineStart, start).toString("utf8");
  if (/^[\t ]*$/.test(leadingText)) {
    let newlineEnd = expandedEnd;
    if (bytes[newlineEnd] === 13) {
      newlineEnd += 1;
    }
    if (bytes[newlineEnd] === 10) {
      expandedStart = lineStart;
      expandedEnd = newlineEnd + 1;
    }
  }
  return {
    start: expandedStart,
    end: expandedEnd,
    oldText: bytes.subarray(expandedStart, expandedEnd).toString("utf8"),
  };
}

export function analyzeCode(
  relativePath: string,
  content: string,
  entries: Map<string, LifecycleEntry>,
  apiEntries: ApiLifecycleEntry[] = [],
): Finding[] {
  const extension = path.extname(relativePath).toLowerCase();
  const language =
    extension === ".py"
      ? "python"
      : extension === ".tsx" || extension === ".jsx"
        ? Lang.Tsx
        : extension === ".ts"
          ? Lang.TypeScript
          : Lang.JavaScript;
  const root = parse(language, content).root();
  const staticConstants = directStaticSdkConstants(root, content);
  const apiEntriesById = new Map(apiEntries.map((entry) => [entry.apiId, entry]));
  const findings: Finding[] = [];
  const seen = new Set<string>();

  const addApiFinding = (node: SgNode, entry: ApiLifecycleEntry): void => {
    const range = node.range();
    const location = toLocation(
      relativePath,
      range.start.line,
      range.start.column,
      range.start.index,
      range.end.index,
    );
    const id = findingId("api", location, `openai-${entry.apiId}`);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    const migration = entry.replacement
      ? `migrate to ${entry.replacement}`
      : "the official deprecations page lists no replacement";
    findings.push({
      id,
      kind: "api_deprecation",
      provider: "openai",
      apiId: entry.apiId,
      status: entry.status,
      shutdownDate: entry.shutdownDate,
      replacement: entry.replacement,
      sourceUrl: entry.sourceUrl,
      confidence: "high",
      sdk: entry.sdk,
      location,
      message: `${entry.apiName} is deprecated and shuts down on ${entry.shutdownDate}; ${migration}.`,
    });
  };

  walk(root, (node) => {
    const value = stringValue(node);
    const entry = value ? entries.get(value) : undefined;
    if (!entry) {
      return;
    }
    const context = modelContext(node, content, entry.provider, staticConstants);
    if (!context) {
      return;
    }
    const byteRange = modelIdByteRange(node, entry.modelId);
    const range = node.range();
    const location = toLocation(
      relativePath,
      range.start.line,
      range.start.column,
      byteRange.start,
      byteRange.end,
    );
    const id = findingId("model", location, entry.modelId);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    const finding: ModelFinding = {
      id,
      kind: "model_reference",
      provider: entry.provider,
      modelId: entry.modelId,
      status: entry.status,
      shutdownDate: entry.shutdownDate,
      replacement: entry.replacement,
      sourceUrl: entry.sourceUrl,
      sourceKind: context.sourceKind,
      confidence: context.confidence,
      replacementConfidence: entry.replacementConfidence,
      sdk: context.sdk,
      location,
      message: `${entry.modelId} is ${entry.status}; official replacement: ${entry.replacement}`,
    };
    findings.push(finding);
  });

  walk(root, (node) => {
    const entry = apiEntriesById.get("assistants-api");
    if (
      !entry ||
      !["call", "call_expression"].includes(String(node.kind())) ||
      !/\.beta\.(?:assistants|threads)\b/.test(node.text()) ||
      !providerEvidence(content, "openai")
    ) {
      return;
    }
    addApiFinding(node, entry);
  });

  walk(root, (node) => {
    const entry = apiEntriesById.get("videos-api");
    if (
      !entry ||
      !["call", "call_expression"].includes(String(node.kind())) ||
      !/\.videos\.(?:create|retrieve|downloadContent|download_content|delete|remix)\s*\(/.test(
        node.text(),
      ) ||
      !providerEvidence(content, "openai")
    ) {
      return;
    }
    addApiFinding(node, entry);
  });

  walk(root, (node) => {
    const entry = apiEntriesById.get("reusable-prompts-api");
    if (!entry || !["call", "call_expression"].includes(String(node.kind()))) {
      return;
    }
    const text = node.text();
    const promptEndpoint = /\.prompts\.(?:create|retrieve|list|update|delete)\s*\(/.test(text);
    const reusablePromptObject =
      /\.responses\.create\s*\(/.test(text) &&
      (/(?:\bprompt\s*:|\bprompt\s*=)\s*\{[\s\S]*?\bid\s*[:=]/.test(text) ||
        /\bprompt\s*=\s*\{[\s\S]*?["']id["']\s*:/.test(text));
    if ((!promptEndpoint && !reusablePromptObject) || !providerEvidence(content, "openai")) {
      return;
    }
    addApiFinding(node, entry);
  });

  walk(root, (node) => {
    const entry = apiEntriesById.get("evals-api");
    if (
      !entry ||
      !["call", "call_expression"].includes(String(node.kind())) ||
      !/\.evals(?:\.runs)?\.(?:create|retrieve|list|update|delete|cancel)\s*\(/.test(node.text()) ||
      !providerEvidence(content, "openai")
    ) {
      return;
    }
    addApiFinding(node, entry);
  });

  walk(root, (node) => {
    if (!["call", "call_expression"].includes(String(node.kind()))) {
      return;
    }
    const sdk = detectSdkCall(node.text(), content);
    if (sdk?.provider !== "anthropic") {
      return;
    }
    const argument = modelArgument(node);
    const entry = argument ? literalModelEntry(argument, entries) : null;
    if (
      entry?.provider !== "anthropic" ||
      !ANTHROPIC_TARGETS_WITHOUT_SAMPLING_PARAMETERS.has(entry.replacement)
    ) {
      return;
    }
    walk(node, (candidate) => {
      const parameter = parameterNameAndValue(candidate);
      if (!parameter || !isDirectRequestParameter(candidate, node)) {
        return;
      }
      const range = candidate.range();
      const deletion = propertyDeletionRange(content, range.start.index, range.end.index);
      const autoFix = isStaticNumericValue(parameter.value);
      const location = toLocation(
        relativePath,
        range.start.line,
        range.start.column,
        deletion.start,
        deletion.end,
      );
      const id = findingId(
        "migration-risk",
        location,
        `anthropic-unsupported-sampling-parameter:${parameter.name}`,
      );
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      const finding: MigrationRiskFinding = {
        id,
        kind: "migration_risk",
        provider: "anthropic",
        ruleId: "anthropic-unsupported-sampling-parameter",
        parameter: parameter.name,
        targetModel: entry.replacement,
        confidence: autoFix ? "high" : "medium",
        autoFix,
        oldText: deletion.oldText,
        sourceUrl: ANTHROPIC_PARAMETER_SOURCE,
        location,
        message: autoFix
          ? `${parameter.name} is removed because explicit sampling values are rejected by ${entry.replacement}.`
          : `${parameter.name} may be rejected by ${entry.replacement}; its dynamic value requires review.`,
      };
      findings.push(finding);
    });
  });

  walk(root, (node) => {
    if (!["call", "call_expression"].includes(String(node.kind()))) {
      return;
    }
    const sdk = detectSdkCall(node.text(), content);
    if (!sdk) {
      return;
    }
    const argument = modelArgument(node);
    if (!argument) {
      return;
    }
    const expression = modelExpression(argument);
    const sourceKind = runtimeSourceKind(expression);
    const literalModel = hasLiteralModelInNode(argument);
    const staticSdk = staticConstants.get(expression);
    if (
      (literalModel && isDirectLiteralModelExpression(expression)) ||
      staticSdk?.provider === sdk.provider
    ) {
      return;
    }
    const range = argument.range();
    const location = toLocation(
      relativePath,
      range.start.line,
      range.start.column,
      range.start.index,
      range.end.index,
    );
    const id = findingId("runtime", location, sdk.provider);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    const finding: RuntimeCheckFinding = {
      id,
      kind: "runtime_check",
      provider: sdk.provider,
      expression: expression.slice(0, 240),
      confidence: "low",
      sdk: sdk.name,
      location,
      message:
        sourceKind === "environment"
          ? "Model value can be overridden at runtime; verify the deployed environment value."
          : "Model expression is not statically resolvable; runtime confirmation is required.",
    };
    findings.push(finding);
  });

  return findings;
}

const MODEL_KEYS = new Set([
  "model",
  "modelid",
  "model_id",
  "openai_model",
  "anthropic_model",
  "gemini_model",
  "google_model",
]);

function byteOffset(content: string, characterOffset: number): number {
  return Buffer.byteLength(content.slice(0, characterOffset), "utf8");
}

export function analyzeConfig(
  relativePath: string,
  content: string,
  entries: Map<string, LifecycleEntry>,
): ModelFinding[] {
  const findings: ModelFinding[] = [];
  let characterOffset = 0;
  const lines = content.split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
      characterOffset += line.length + 1;
      continue;
    }
    const pairs = line.matchAll(
      /["']?([A-Za-z_][A-Za-z0-9_-]*)["']?\s*[:=]\s*["']?([^"',#\s}]+)["']?/g,
    );
    for (const pair of pairs) {
      const key = pair[1]?.toLowerCase() ?? "";
      const modelId = pair[2] ?? "";
      const entry = MODEL_KEYS.has(key) ? entries.get(modelId) : undefined;
      if (!entry) {
        continue;
      }
      const pairOffset = pair.index ?? 0;
      const column = pairOffset + pair[0].indexOf(modelId);
      const modelCharacterOffset = characterOffset + column;
      const start = byteOffset(content, modelCharacterOffset);
      const location = toLocation(relativePath, index, column, start, start + modelId.length);
      findings.push({
        id: findingId("model", location, modelId),
        kind: "model_reference",
        provider: entry.provider,
        modelId,
        status: entry.status,
        shutdownDate: entry.shutdownDate,
        replacement: entry.replacement,
        sourceUrl: entry.sourceUrl,
        sourceKind: relativePath.split("/").at(-1)?.startsWith(".env") ? "environment" : "config",
        confidence: "high",
        replacementConfidence: entry.replacementConfidence,
        sdk: null,
        location,
        message: `${modelId} is ${entry.status}; official replacement: ${entry.replacement}`,
      });
    }
    characterOffset += line.length + 1;
  }
  return findings;
}
