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

const PROVIDERS_REQUIRING_MATCHED_SDK_EVIDENCE = new Set<Provider>(["cohere", "xai"]);

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

interface SdkConstructorBindings {
  constructors: Set<string>;
  namespaces: Set<string>;
}

const COHERE_CONSTRUCTOR_EXPORTS = new Set([
  "AsyncClient",
  "AsyncClientV2",
  "Client",
  "ClientV2",
  "CohereClient",
  "CohereClientV2",
]);

function isDirectRequireCall(node: SgNode, moduleName: string): boolean {
  return (
    ["call", "call_expression"].includes(String(node.kind())) &&
    node.field("function")?.kind() === "identifier" &&
    node.field("function")?.text() === "require" &&
    !hasLocalBindingVisibleAt(node, "require") &&
    new RegExp(`^require\\(\\s*["']${moduleName}["']\\s*\\)$`).test(node.text())
  );
}

function commonJsRequireKind(
  node: SgNode,
  moduleName: string,
  provider: "cohere" | "openai",
): "constructor" | "module" | null {
  if (isDirectRequireCall(node, moduleName)) {
    return "module";
  }
  if (node.kind() !== "member_expression") {
    return null;
  }
  const object = node.field("object");
  const property = node.field("property");
  if (
    !object ||
    !property ||
    property.kind() !== "property_identifier" ||
    !isDirectRequireCall(object, moduleName)
  ) {
    return null;
  }
  const exported = property.text();
  const recognized =
    provider === "openai"
      ? exported === "OpenAI" || exported === "default"
      : COHERE_CONSTRUCTOR_EXPORTS.has(exported);
  return recognized ? "constructor" : null;
}

function addNamedImports(
  bindings: SdkConstructorBindings,
  specifiers: string,
  provider: "cohere" | "openai",
): void {
  for (const specifier of specifiers.split(",")) {
    const match = specifier
      .trim()
      .match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/);
    const imported = match?.[1];
    const local = match?.[2] ?? imported;
    if (
      imported &&
      local &&
      (provider === "openai" ? imported === "OpenAI" : COHERE_CONSTRUCTOR_EXPORTS.has(imported))
    ) {
      bindings.constructors.add(local);
    }
  }
}

function sdkConstructorBindings(
  call: SgNode,
  provider: "cohere" | "openai",
): SdkConstructorBindings {
  const bindings: SdkConstructorBindings = {
    constructors: new Set<string>(),
    namespaces: new Set<string>(),
  };
  const jsModule = provider === "openai" ? "openai" : "cohere-ai";
  const pythonModule = provider === "openai" ? "openai" : "cohere";
  const root = call.getRoot().root();
  walk(root, (node) => {
    const text = node.text().trim().replace(/;$/, "");
    if (node.kind() === "import_statement") {
      const fromMatch = text.match(
        new RegExp(`^import\\s+([\\s\\S]+?)\\s+from\\s+["']${jsModule}["']$`),
      );
      if (fromMatch) {
        const clause = fromMatch[1] ?? "";
        const defaultImport = clause.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|$)/)?.[1];
        if (provider === "openai" && defaultImport) {
          bindings.constructors.add(defaultImport);
        }
        const namespaceImport = clause.match(/\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1];
        if (namespaceImport) {
          bindings.namespaces.add(namespaceImport);
        }
        const namedImports = clause.match(/\{([\s\S]*)\}/)?.[1];
        if (namedImports) {
          addNamedImports(bindings, namedImports, provider);
        }
        return;
      }
      const pythonImport = text.match(
        new RegExp(`^import\\s+${pythonModule}(?:\\s+as\\s+([A-Za-z_$][A-Za-z0-9_$]*))?$`),
      );
      if (pythonImport) {
        bindings.namespaces.add(pythonImport[1] ?? pythonModule);
      }
      return;
    }
    if (node.kind() === "import_from_statement") {
      const fromImport = text.match(
        new RegExp(`^from\\s+${pythonModule}\\s+import\\s+([\\s\\S]+)$`),
      );
      if (fromImport) {
        addNamedImports(bindings, fromImport[1] ?? "", provider);
      }
      return;
    }
    const initializer = node.kind() === "variable_declarator" ? directInitializer(node) : null;
    const requireKind = initializer ? commonJsRequireKind(initializer, jsModule, provider) : null;
    if (!requireKind) {
      return;
    }
    const left = text.split("=")[0]?.trim() ?? "";
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(left)) {
      if (requireKind === "constructor" || provider === "openai") {
        bindings.constructors.add(left);
      }
      if (requireKind === "module") {
        bindings.namespaces.add(left);
      }
      return;
    }
    const namedImports = left.match(/^\{([\s\S]*)\}$/)?.[1];
    if (namedImports && requireKind === "module") {
      addNamedImports(bindings, namedImports.replaceAll(":", " as "), provider);
    }
  });
  return bindings;
}

const LEXICAL_SCOPE_KINDS = new Set([
  "arrow_function",
  "block",
  "catch_clause",
  "class",
  "class_definition",
  "dictionary_comprehension",
  "except_clause",
  "function_declaration",
  "function_definition",
  "function_expression",
  "generator_function",
  "generator_expression",
  "list_comprehension",
  "lambda",
  "method_definition",
  "module",
  "module_body",
  "program",
  "statement_block",
  "set_comprehension",
]);
const PARAMETER_KINDS = new Set([
  "default_parameter",
  "optional_parameter",
  "required_parameter",
  "typed_default_parameter",
  "typed_parameter",
]);
const PYTHON_COMPREHENSION_KINDS = new Set([
  "dictionary_comprehension",
  "generator_expression",
  "list_comprehension",
  "set_comprehension",
]);

function lexicalScopeIds(node: SgNode): Set<number> {
  const root = node.getRoot().root();
  if (root.kind() === "module") {
    const scopeIds = new Set<number>();
    let crossedNestedExecutionScope = false;
    for (const candidate of [node, ...node.ancestors(), root]) {
      const kind = String(candidate.kind());
      if (
        kind === "function_definition" ||
        kind === "lambda" ||
        PYTHON_COMPREHENSION_KINDS.has(kind)
      ) {
        scopeIds.add(candidate.id());
        crossedNestedExecutionScope = true;
        continue;
      }
      if (kind === "class_definition") {
        if (!crossedNestedExecutionScope) {
          scopeIds.add(candidate.id());
        }
        crossedNestedExecutionScope = true;
        continue;
      }
      if (kind === "module") {
        scopeIds.add(candidate.id());
      }
    }
    return scopeIds;
  }
  return new Set(
    [node, ...node.ancestors(), root]
      .filter((candidate) => LEXICAL_SCOPE_KINDS.has(String(candidate.kind())))
      .map((candidate) => candidate.id()),
  );
}

function nearestLexicalScope(node: SgNode): SgNode {
  return (
    node.ancestors().find((candidate) => LEXICAL_SCOPE_KINDS.has(String(candidate.kind()))) ??
    node.getRoot().root()
  );
}

function bindingIdentifier(node: SgNode): string | null {
  if (["assignment", "variable_declarator"].includes(String(node.kind()))) {
    return declarationIdentifier(node);
  }
  if (
    [
      "class_declaration",
      "class_definition",
      "function_declaration",
      "function_definition",
      "generator_function_declaration",
    ].includes(String(node.kind()))
  ) {
    return node.field("name")?.text() ?? null;
  }
  if (PARAMETER_KINDS.has(String(node.kind()))) {
    return node.text().match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)/)?.[1] ?? null;
  }
  if (
    ["identifier_pattern", "shorthand_property_identifier_pattern"].includes(String(node.kind()))
  ) {
    const insideParameters = node
      .ancestors()
      .some((ancestor) => ["formal_parameters", "parameters"].includes(String(ancestor.kind())));
    return insideParameters ? node.text() : null;
  }
  if (node.kind() === "identifier") {
    const parameterList = node
      .ancestors()
      .find((ancestor) => ["formal_parameters", "parameters"].includes(String(ancestor.kind())));
    if (parameterList) {
      return node.text();
    }
  }
  return null;
}

function bindingPatternHasIdentifier(pattern: SgNode, identifier: string): boolean {
  if (
    ["identifier", "identifier_pattern", "shorthand_property_identifier_pattern"].includes(
      String(pattern.kind()),
    )
  ) {
    return pattern.text() === identifier;
  }
  if (pattern.kind() === "as_pattern") {
    const alias = pattern.field("alias");
    return Boolean(alias && bindingPatternHasIdentifier(alias, identifier));
  }
  if (pattern.kind() === "pair_pattern") {
    const value = pattern.field("value");
    return Boolean(value && bindingPatternHasIdentifier(value, identifier));
  }
  if (["assignment_pattern", "object_assignment_pattern"].includes(String(pattern.kind()))) {
    const left = pattern.field("left");
    return Boolean(left && bindingPatternHasIdentifier(left, identifier));
  }
  if (
    [
      "array_pattern",
      "as_pattern_target",
      "case_pattern",
      "dict_pattern",
      "dotted_name",
      "list_pattern",
      "object_pattern",
      "pattern_list",
      "rest_pattern",
      "splat_pattern",
      "tuple_pattern",
    ].includes(String(pattern.kind()))
  ) {
    return pattern.children().some((child) => bindingPatternHasIdentifier(child, identifier));
  }
  return false;
}

function importStatementBindsIdentifier(node: SgNode, identifier: string): boolean {
  if (node.getRoot().root().kind() === "module") {
    const importedName = node.field("name");
    if (importedName?.kind() === "dotted_name") {
      const boundName =
        node.kind() === "import_statement"
          ? importedName.text().split(".")[0]
          : importedName.text();
      if (boundName === identifier) {
        return true;
      }
    }
  }
  let binds = false;
  walk(node, (candidate) => {
    if (binds) {
      return;
    }
    if (candidate.kind() === "import_clause") {
      binds = candidate
        .children()
        .some((child) => child.kind() === "identifier" && child.text() === identifier);
      return;
    }
    if (candidate.kind() === "import_specifier") {
      const local = candidate.field("alias") ?? candidate.field("name");
      binds = local?.text() === identifier;
      return;
    }
    if (candidate.kind() === "namespace_import") {
      binds = candidate
        .children()
        .some((child) => child.kind() === "identifier" && child.text() === identifier);
      return;
    }
    if (candidate.kind() === "aliased_import") {
      const local = candidate.field("alias") ?? candidate.field("name");
      binds = local?.text() === identifier;
    }
  });
  return binds;
}

function nodeBindsIdentifier(node: SgNode, identifier: string): boolean {
  if (bindingIdentifier(node) === identifier) {
    return true;
  }
  if (["import_statement", "import_from_statement"].includes(String(node.kind()))) {
    return importStatementBindsIdentifier(node, identifier);
  }
  if (["assignment", "variable_declarator"].includes(String(node.kind()))) {
    const pattern = node.field(node.kind() === "variable_declarator" ? "name" : "left");
    return Boolean(pattern && bindingPatternHasIdentifier(pattern, identifier));
  }
  if (node.kind() === "catch_clause") {
    const parameter = node.field("parameter");
    return Boolean(parameter && bindingPatternHasIdentifier(parameter, identifier));
  }
  if (node.kind() === "except_clause") {
    const value = node.field("value");
    return Boolean(value && bindingPatternHasIdentifier(value, identifier));
  }
  if (node.kind() === "as_pattern") {
    const alias = node.field("alias");
    return Boolean(alias && bindingPatternHasIdentifier(alias, identifier));
  }
  if (["for_in_clause", "for_statement"].includes(String(node.kind()))) {
    const left = node.field("left");
    return Boolean(left && bindingPatternHasIdentifier(left, identifier));
  }
  if (node.kind() === "named_expression") {
    return node.field("name")?.text() === identifier;
  }
  if (node.kind() === "case_clause") {
    return node
      .children()
      .some(
        (child) =>
          child.kind() === "case_pattern" && bindingPatternHasIdentifier(child, identifier),
      );
  }
  if (["lambda_parameters", "parameters"].includes(String(node.kind()))) {
    return node.children().some((child) => bindingPatternHasIdentifier(child, identifier));
  }
  if (["class", "function_expression", "generator_function"].includes(String(node.kind()))) {
    return node.field("name")?.text() === identifier;
  }
  return false;
}

function bindingLexicalScope(node: SgNode): SgNode {
  if (node.getRoot().root().kind() === "module") {
    if (node.kind() === "for_in_clause") {
      const comprehension = node
        .ancestors()
        .find((ancestor) => PYTHON_COMPREHENSION_KINDS.has(String(ancestor.kind())));
      if (comprehension) {
        return comprehension;
      }
    }
    const skipComprehension = node.kind() === "named_expression";
    return (
      node
        .ancestors()
        .find(
          (ancestor) =>
            ["class_definition", "function_definition", "lambda", "module"].includes(
              String(ancestor.kind()),
            ) ||
            (!skipComprehension && PYTHON_COMPREHENSION_KINDS.has(String(ancestor.kind()))),
        ) ?? node.getRoot().root()
    );
  }
  const exceptClause = node.ancestors().find((ancestor) => ancestor.kind() === "except_clause");
  if (node.kind() === "except_clause") {
    return node;
  }
  if (exceptClause) {
    return exceptClause;
  }
  if (node.kind() === "for_in_clause") {
    const comprehension = node
      .ancestors()
      .find((ancestor) =>
        [
          "dictionary_comprehension",
          "generator_expression",
          "list_comprehension",
          "set_comprehension",
        ].includes(String(ancestor.kind())),
      );
    if (comprehension) {
      return comprehension;
    }
  }
  if (node.kind() === "case_clause") {
    const matchStatement = node
      .ancestors()
      .find((ancestor) => ancestor.kind() === "match_statement");
    if (matchStatement) {
      return nearestLexicalScope(matchStatement);
    }
  }
  return ["catch_clause", "class", "function_expression", "generator_function"].includes(
    String(node.kind()),
  )
    ? node
    : nearestLexicalScope(node);
}

function bindingIsVisibleBefore(candidate: SgNode, node: SgNode): boolean {
  if (
    ["function_declaration", "generator_function_declaration"].includes(String(candidate.kind()))
  ) {
    return true;
  }
  if (candidate.kind() === "for_in_clause") {
    return bindingLexicalScope(candidate).id() === bindingLexicalScope(node).id();
  }
  if (
    candidate.getRoot().root().kind() === "module" &&
    ["function_definition", "lambda"].includes(String(bindingLexicalScope(candidate).kind()))
  ) {
    return true;
  }
  return candidate.range().start.index < node.range().start.index;
}

function bindingProvidesValueBefore(candidate: SgNode, node: SgNode): boolean {
  if (
    ["function_declaration", "generator_function_declaration"].includes(String(candidate.kind()))
  ) {
    return true;
  }
  if (candidate.kind() === "for_in_clause") {
    return bindingLexicalScope(candidate).id() === bindingLexicalScope(node).id();
  }
  return candidate.range().start.index < node.range().start.index;
}

const PYTHON_CONTROL_FLOW_KINDS = new Set([
  "case_clause",
  "elif_clause",
  "else_clause",
  "except_clause",
  "for_statement",
  "if_statement",
  "match_statement",
  "try_statement",
  "while_statement",
  "with_statement",
]);

function bindingHasDivergentPythonControlFlow(binding: SgNode, node: SgNode): boolean {
  if (binding.getRoot().root().kind() !== "module") {
    return false;
  }
  const nodeAncestors = new Set([node, ...node.ancestors()].map((ancestor) => ancestor.id()));
  const bindingScope = bindingLexicalScope(binding);
  for (const ancestor of binding.ancestors()) {
    if (ancestor.id() === bindingScope.id()) {
      break;
    }
    if (
      PYTHON_CONTROL_FLOW_KINDS.has(String(ancestor.kind())) &&
      !nodeAncestors.has(ancestor.id())
    ) {
      return true;
    }
    if (
      ancestor.kind() === "block" &&
      PYTHON_CONTROL_FLOW_KINDS.has(String(ancestor.parent()?.kind())) &&
      !nodeAncestors.has(ancestor.id())
    ) {
      return true;
    }
  }
  return false;
}

function hasVisiblePythonScopeDirective(node: SgNode, identifier: string): boolean {
  if (node.getRoot().root().kind() !== "module") {
    return false;
  }
  const visibleScopes = lexicalScopeIds(node);
  let found = false;
  walk(node.getRoot().root(), (candidate) => {
    if (
      found ||
      !["global_statement", "nonlocal_statement"].includes(String(candidate.kind())) ||
      !visibleScopes.has(bindingLexicalScope(candidate).id())
    ) {
      return;
    }
    walk(candidate, (part) => {
      if (part.kind() === "identifier" && part.text() === identifier) {
        found = true;
      }
    });
  });
  return found;
}

function visibleReceiverBinding(call: SgNode, receiver: string): SgNode | null {
  if (hasVisiblePythonScopeDirective(call, receiver)) {
    return null;
  }
  const root = call.getRoot().root();
  const visibleScopes = lexicalScopeIds(call);
  let binding: SgNode | null = null;
  let ambiguous = false;
  walk(root, (candidate) => {
    if (
      !nodeBindsIdentifier(candidate, receiver) ||
      !bindingIsVisibleBefore(candidate, call) ||
      !visibleScopes.has(bindingLexicalScope(candidate).id())
    ) {
      return;
    }
    if (bindingHasDivergentPythonControlFlow(candidate, call)) {
      ambiguous = true;
      return;
    }
    if (!binding || binding.range().start.index < candidate.range().start.index) {
      binding = candidate;
    }
  });
  return ambiguous ? null : binding;
}

function hasVisiblePythonWildcardImport(call: SgNode): boolean {
  if (call.getRoot().root().kind() !== "module") {
    return false;
  }
  const root = call.getRoot().root();
  const visibleScopes = lexicalScopeIds(call);
  let found = false;
  walk(root, (candidate) => {
    if (
      found ||
      candidate.kind() !== "import_from_statement" ||
      !/\bimport\s+\*/.test(candidate.text()) ||
      !bindingIsVisibleBefore(candidate, call) ||
      !visibleScopes.has(bindingLexicalScope(candidate).id())
    ) {
      return;
    }
    found = true;
  });
  return found;
}

function hasLocalBindingVisibleAt(node: SgNode, identifier: string): boolean {
  const root = node.getRoot().root();
  const visibleScopes = lexicalScopeIds(node);
  let found = false;
  walk(root, (candidate) => {
    if (
      found ||
      !nodeBindsIdentifier(candidate, identifier) ||
      !visibleScopes.has(bindingLexicalScope(candidate).id())
    ) {
      return;
    }
    if (bindingIsVisibleBefore(candidate, node)) {
      found = true;
    }
  });
  return found;
}

function callMemberChain(call: SgNode): { receiver: SgNode; path: string[] } | null {
  let current = call.field("function");
  const path: string[] = [];
  while (current && ["attribute", "member_expression"].includes(String(current.kind()))) {
    const property = current.field(current.kind() === "attribute" ? "attribute" : "property");
    if (!property || !["identifier", "property_identifier"].includes(String(property.kind()))) {
      return null;
    }
    path.unshift(property.text());
    current = current.field("object");
  }
  return current ? { receiver: current, path } : null;
}

function directInitializer(binding: SgNode): SgNode | null {
  if (!["assignment", "variable_declarator"].includes(String(binding.kind()))) {
    return null;
  }
  return binding.children().at(-1) ?? null;
}

function constructorName(node: SgNode): string | null {
  if (node.kind() === "new_expression") {
    return node.field("constructor")?.text() ?? null;
  }
  if (node.kind() === "call") {
    return node.field("function")?.text() ?? null;
  }
  return null;
}

function isOfficialRequireBinding(binding: SgNode, provider: "cohere" | "openai"): boolean {
  const moduleName = provider === "openai" ? "openai" : "cohere-ai";
  const initializer = directInitializer(binding);
  return Boolean(initializer && commonJsRequireKind(initializer, moduleName, provider));
}

function isOfficialSdkImportBinding(
  binding: SgNode,
  identifier: string,
  provider: "cohere" | "openai",
): boolean {
  if (
    !["import_statement", "import_from_statement"].includes(String(binding.kind())) ||
    !importStatementBindsIdentifier(binding, identifier)
  ) {
    return false;
  }
  const moduleName = provider === "openai" ? "openai" : "cohere";
  const jsModuleName = provider === "openai" ? "openai" : "cohere-ai";
  const text = binding.text().trim().replace(/;$/, "");
  return (
    new RegExp(`\\sfrom\\s+["']${jsModuleName}["']$`).test(text) ||
    new RegExp(`^(?:from\\s+${moduleName}\\s+import|import\\s+${moduleName}(?:\\s|$))`).test(text)
  );
}

function importedReferenceIsVisible(
  reference: string,
  call: SgNode,
  provider: "cohere" | "openai",
): boolean {
  const bindings = sdkConstructorBindings(call, provider);
  const parts = reference.split(".");
  const rootName = parts[0] ?? "";
  const imported =
    parts.length === 1
      ? bindings.constructors.has(reference) || bindings.namespaces.has(reference)
      : parts.length === 2 &&
        bindings.namespaces.has(rootName) &&
        (provider === "openai"
          ? parts[1] === "OpenAI"
          : COHERE_CONSTRUCTOR_EXPORTS.has(parts[1] ?? ""));
  if (!imported || !rootName) {
    return false;
  }
  if (hasVisiblePythonWildcardImport(call)) {
    return false;
  }
  const shadowingBinding = visibleReceiverBinding(call, rootName);
  if (!shadowingBinding) {
    return false;
  }
  if (!bindingProvidesValueBefore(shadowingBinding, call)) {
    return false;
  }
  return (
    isOfficialRequireBinding(shadowingBinding, provider) ||
    isOfficialSdkImportBinding(shadowingBinding, rootName, provider)
  );
}

function classifyOpenAiConstructor(node: SgNode, call: SgNode): "openai" | "xai" | "unknown" {
  const name = constructorName(node) ?? "";
  if (!importedReferenceIsVisible(name, call, "openai")) {
    return "unknown";
  }
  const argumentsText = node.field("arguments")?.text() ?? "";
  const xaiBaseUrl =
    /(?:["']?baseURL["']?\s*:|\bbase_url\s*=)\s*["']https:\/\/api\.x\.ai(?:\/[^"']*)?["']/.test(
      argumentsText,
    );
  if (xaiBaseUrl) {
    return "xai";
  }
  return /(?:["']?baseURL["']?\s*:|\bbase_url\s*=)/.test(argumentsText) ? "unknown" : "openai";
}

function openAiCompatibleOwnership(call: SgNode): "openai" | "xai" | "unknown" {
  const chain = callMemberChain(call);
  if (!chain) {
    return "unknown";
  }
  const legacyChatCompletion =
    (chain.receiver.text() === "ChatCompletion" && chain.path.join(".") === "create") ||
    chain.path.join(".") === "ChatCompletion.create";
  if (legacyChatCompletion) {
    return importedReferenceIsVisible(chain.receiver.text(), call, "openai") ? "openai" : "unknown";
  }
  const inline = classifyOpenAiConstructor(chain.receiver, call);
  if (inline !== "unknown") {
    return inline;
  }
  if (chain.receiver.kind() !== "identifier") {
    return "unknown";
  }
  const binding = visibleReceiverBinding(call, chain.receiver.text());
  const initializer =
    binding && bindingProvidesValueBefore(binding, call) ? directInitializer(binding) : null;
  return initializer ? classifyOpenAiConstructor(initializer, call) : "unknown";
}

function isCohereSdkCall(call: SgNode): boolean {
  const chain = callMemberChain(call);
  if (!chain) {
    return false;
  }
  const isCohereConstructor = (candidate: SgNode): boolean =>
    importedReferenceIsVisible(constructorName(candidate) ?? "", call, "cohere");
  if (isCohereConstructor(chain.receiver)) {
    return true;
  }
  if (chain.receiver.kind() !== "identifier") {
    return false;
  }
  const binding = visibleReceiverBinding(call, chain.receiver.text());
  const initializer =
    binding && bindingProvidesValueBefore(binding, call) ? directInitializer(binding) : null;
  return Boolean(initializer && isCohereConstructor(initializer));
}

function openAiCallKind(call: SgNode): "create" | "runTools" | null {
  const chain = callMemberChain(call);
  if (!chain) {
    return null;
  }
  const path = chain.path.join(".");
  if (path === "beta.chat.completions.runTools") {
    return "runTools";
  }
  if (
    [
      "responses.create",
      "chat.completions.create",
      "images.generate",
      "ChatCompletion.create",
    ].includes(path) ||
    (chain.receiver.text() === "ChatCompletion" && path === "create")
  ) {
    return "create";
  }
  return null;
}

function isOpenAiCompatibleCallShape(call: SgNode): boolean {
  return openAiCallKind(call) !== null;
}

function isCohereCallShape(call: SgNode): boolean {
  const path = callMemberChain(call)?.path.join(".") ?? "";
  return ["chat", "embed", "rerank", "v2.chat", "v2.embed", "v2.rerank"].includes(path);
}

function detectSdkCall(call: SgNode, content: string): SdkCall | null {
  const text = call.text();
  const openAiKind = openAiCallKind(call);
  if (openAiKind) {
    const ownership = openAiCompatibleOwnership(call);
    if (ownership === "unknown") {
      return null;
    }
    return {
      provider: ownership,
      name:
        ownership === "xai"
          ? "xAI OpenAI-compatible"
          : openAiKind === "runTools"
            ? "OpenAI runTools"
            : "OpenAI create",
    };
  }
  if (isCohereCallShape(call) && isCohereSdkCall(call)) {
    return { provider: "cohere", name: "Cohere SDK" };
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
    const sdk = detectSdkCall(node, content);
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
      const sdk = call ? detectSdkCall(call, content) : null;
      if (
        call &&
        PROVIDERS_REQUIRING_MATCHED_SDK_EVIDENCE.has(provider) &&
        sdk?.provider !== provider
      ) {
        return null;
      }
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
      const sdk = call ? detectSdkCall(call, content) : null;
      if (
        call &&
        PROVIDERS_REQUIRING_MATCHED_SDK_EVIDENCE.has(provider) &&
        sdk?.provider !== provider
      ) {
        return null;
      }
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
      const sdk = detectSdkCall(ancestor, content);
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

function unresolvedProviderOwnership(
  node: SgNode,
  provider: Provider,
  content: string,
): { argument: SgNode; sdk: SdkCall | null } | null {
  if (provider !== "openai" && !PROVIDERS_REQUIRING_MATCHED_SDK_EVIDENCE.has(provider)) {
    return null;
  }
  const argument = node.ancestors().find((ancestor) => {
    const text = ancestor.text();
    return (
      (ancestor.kind() === "pair" &&
        /^\s*(?:model|modelId|model_id|modelName|model_name)\s*:/.test(text)) ||
      (ancestor.kind() === "keyword_argument" && /^\s*(?:model|model_id|model_name)\s*=/.test(text))
    );
  });
  const call = argument
    ?.ancestors()
    .find((candidate) => ["call", "call_expression"].includes(String(candidate.kind())));
  if (!argument || !call) {
    return null;
  }
  const sdk = detectSdkCall(call, content);
  if (provider === "openai" && !isOpenAiCompatibleCallShape(call)) {
    return null;
  }
  return sdk?.provider === provider ? null : { argument, sdk };
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

  const addOwnershipRuntimeCheck = (
    node: SgNode,
    entry: LifecycleEntry,
    unresolved: { argument: SgNode; sdk: SdkCall | null },
  ): void => {
    const byteRange = modelIdByteRange(node, entry.modelId);
    const range = node.range();
    const location = toLocation(
      relativePath,
      range.start.line,
      range.start.column,
      byteRange.start,
      byteRange.end,
    );
    const id = findingId("runtime-ownership", location, entry.provider);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    findings.push({
      id,
      kind: "runtime_check",
      provider: entry.provider,
      expression: modelExpression(unresolved.argument).slice(0, 240),
      confidence: "low",
      sdk: unresolved.sdk?.name ?? `${entry.provider} provider ownership unresolved`,
      location,
      message: `The model ID matches ${entry.provider} lifecycle data, but the provider endpoint cannot be confirmed statically; verify the deployed client configuration.`,
    });
  };

  walk(root, (node) => {
    const value = stringValue(node);
    const entry = value ? entries.get(value) : undefined;
    if (!entry) {
      return;
    }
    const context = modelContext(node, content, entry.provider, staticConstants);
    const unresolved = unresolvedProviderOwnership(node, entry.provider, content);
    if (!context) {
      if (unresolved) {
        addOwnershipRuntimeCheck(node, entry, unresolved);
      }
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
    if (unresolved) {
      addOwnershipRuntimeCheck(node, entry, unresolved);
    }
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
    const sdk = detectSdkCall(node, content);
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
    const sdk = detectSdkCall(node, content);
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
