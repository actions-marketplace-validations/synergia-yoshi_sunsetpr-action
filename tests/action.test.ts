import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderActionSummary, resolveReportPath } from "../src/action.js";
import { analyzeCode } from "../src/analyzer.js";
import { loadDatabase } from "../src/database.js";
import { scanRepository } from "../src/scanner.js";
import type { LifecycleEntry } from "../src/types.js";

test("ships a current validated lifecycle database", async () => {
  const database = await loadDatabase();
  assert.equal(database.checkedAt, "2026-09-01");
  assert.equal(database.entries.length, 129);
  assert.equal(new Set(database.entries.map((entry) => entry.modelId)).size, 129);
  assert.equal(database.apiDeprecations.length, 4);

  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  for (const modelId of [
    "whisper-1",
    "gpt-4o-transcribe",
    "gpt-4o-mini-transcribe",
    "gpt-4o-transcribe-diarize",
  ]) {
    const entry = entries.get(modelId);
    assert.equal(entry?.provider, "openai");
    assert.equal(entry?.shutdownDate, "2027-02-26");
    assert.equal(entry?.replacement, "gpt-transcribe");
    assert.equal(entry?.replacementConfidence, "medium");
  }

  const geminiOmni = entries.get("gemini-omni-flash-preview");
  assert.equal(geminiOmni?.provider, "gemini");
  assert.equal(geminiOmni?.shutdownDate, "2026-09-30");
  assert.equal(geminiOmni?.replacement, "gemini-omni-1.1-flash");
  assert.equal(geminiOmni?.replacementConfidence, "high");
});

test("detects known IDs and preserves dynamic model uncertainty", async () => {
  const report = await scanRepository("test-fixture", await loadDatabase());
  assert.equal(report.toolVersion, "0.3.0");
  assert.equal(report.summary.modelReferences, 1);
  assert.equal(report.summary.apiDeprecations, 0);
  assert.equal(report.summary.runtimeChecks, 1);
  assert.equal(report.summary.safeAutoFixes, 1);
  const summary = renderActionSummary(report);
  assert.match(summary, /official/);
  assert.match(summary, /v0\.3\.0/);
  assert.match(summary, /Immediate action required/);
  assert.match(summary, /Nearest shutdown/);
  assert.match(summary, /Runtime confirmation required/);
  assert.match(summary, /repair PR/);
});

test("rejects report paths that could inject GitHub output records", () => {
  assert.throws(
    () => resolveReportPath(".sunsetpr/report.json\nunexpected=value"),
    /must not contain newline/,
  );
  assert.match(resolveReportPath(".sunsetpr/report.json"), /report\.json$/);
});

test("packages the checked-in Action runtime for GitHub-hosted Linux x64", async () => {
  const packaging = await readFile("scripts/package-action.mjs", "utf8");
  assert.match(packaging, /SUNSETPR_ACTION_PLATFORM\s*\?\?\s*"linux"/);
  assert.match(packaging, /SUNSETPR_ACTION_ARCHITECTURE\s*\?\?\s*"x64"/);
});

test("groups low-risk Dependabot updates without mixing runtime dependencies", async () => {
  const dependabot = await readFile(".github/dependabot.yml", "utf8");
  assert.match(
    dependabot,
    /development-dependencies:\n\s+dependency-type: development/,
  );
  assert.match(dependabot, /github-actions:\n\s+patterns:\n\s+- "\*"/);
  assert.doesNotMatch(dependabot, /dependency-type: production/);
});

test("monitors focused official Markdown when a provider exposes it", async () => {
  const monitor = await readFile("scripts/verify-official-sources.mjs", "utf8");
  assert.match(
    monitor,
    /fetchUrl: "https:\/\/developers\.openai\.com\/api\/docs\/deprecations\.md"/,
  );
  assert.match(
    monitor,
    /fetchUrl: "https:\/\/platform\.claude\.com\/docs\/en\/about-claude\/model-deprecations\.md"/,
  );
  assert.match(monitor, /acceptedContentTypes: \["text\/markdown"\]/);
});

test("documents installation and safety boundaries in Japanese", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.match(readme, /## 日本語: 何をするActionか/);
  assert.match(readme, /通知だけで終わらせず、影響箇所を見つけ/);
  assert.match(readme, /## 日本語: 最短導入/);
  assert.match(readme, /自動マージや本番公開は行いません/);
});

test("detects OpenAI runTools fallback IDs without hiding the dynamic override", async () => {
  const database = await loadDatabase();
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const source = `import OpenAI from "openai";
new OpenAI().beta.chat.completions.runTools({
  model: options.model ?? "gpt-4-turbo",
  messages: [],
  tools: [],
});`;
  const findings = analyzeCode("src/tools.ts", source, entries);
  const models = findings.filter((finding) => finding.kind === "model_reference");
  const runtimeChecks = findings.filter((finding) => finding.kind === "runtime_check");

  assert.equal(models.length, 1);
  assert.equal(models[0]?.confidence, "high");
  assert.equal(models[0]?.sdk, "OpenAI runTools");
  assert.equal(runtimeChecks.length, 1);
  assert.equal(runtimeChecks[0]?.expression, 'options.model ?? "gpt-4-turbo"');
});

test("detects a single-use model constant without hiding mutable uncertainty", async () => {
  const database = await loadDatabase();
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const fixed = analyzeCode(
    "src/fixed.ts",
    `import OpenAI from "openai";
const MODEL = "gpt-4-turbo";
new OpenAI().responses.create({ model: MODEL, input: "x" });`,
    entries,
  );
  const mutable = analyzeCode(
    "src/mutable.ts",
    `import OpenAI from "openai";
let model = "gpt-4-turbo";
new OpenAI().responses.create({ model, input: "x" });`,
    entries,
  );

  assert.equal(
    fixed.find((finding) => finding.kind === "model_reference")?.confidence,
    "high",
  );
  assert.equal(fixed.filter((finding) => finding.kind === "runtime_check").length, 0);
  assert.equal(
    mutable.find((finding) => finding.kind === "model_reference")?.confidence,
    "medium",
  );
  assert.equal(mutable.filter((finding) => finding.kind === "runtime_check").length, 1);
});

test("detects legacy Gemini positional calls", async () => {
  const database = await loadDatabase();
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const findings = analyzeCode(
    "src/gemini.py",
    `import google.generativeai as genai
model = genai.GenerativeModel("gemini-3.1-flash-lite")
model.generate_content("hello")`,
    entries,
  );
  const model = findings.find((finding) => finding.kind === "model_reference");

  assert.equal(model?.confidence, "high");
  assert.equal(model?.sdk, "Gemini generate content");
});

test("detects Cohere and xAI calls only with provider-specific SDK evidence", () => {
  const entries = new Map<string, LifecycleEntry>([
    [
      "embed-english-v2.0",
      {
        provider: "cohere",
        modelId: "embed-english-v2.0",
        status: "retired",
        shutdownDate: "2026-04-04",
        replacement: "embed-v4.0",
        sourceUrl: "https://docs.cohere.com/docs/deprecations",
        replacementConfidence: "medium",
        notes: "Official alternatives require workload review.",
      },
    ],
    [
      "grok-4-0709",
      {
        provider: "xai",
        modelId: "grok-4-0709",
        status: "retired",
        shutdownDate: "2026-05-15",
        replacement: "grok-4.3",
        sourceUrl: "https://docs.x.ai/developers/migration/may-15-retirement",
        replacementConfidence: "medium",
        notes: "The documented redirect changes behavior and needs review.",
      },
    ],
  ]);
  const cohere = analyzeCode(
    "src/cohere.ts",
    `import { CohereClientV2 } from "cohere-ai";
const co = new CohereClientV2({ token: process.env.COHERE_API_KEY });
await co.v2.embed({ model: "embed-english-v2.0", texts: ["hello"] });`,
    entries,
  );
  const xai = analyzeCode(
    "src/xai.ts",
    `import OpenAI from "openai";
const xai = new OpenAI({ baseURL: "https://api.x.ai/v1" });
await xai.chat.completions.create({ model: "grok-4-0709", messages: [] });`,
    entries,
  );
  const unrelated = analyzeCode(
    "src/unrelated.ts",
    `await anotherClient.send({ name: "grok-4-0709" });`,
    entries,
  );

  assert.equal(cohere.find((finding) => finding.kind === "model_reference")?.sdk, "Cohere SDK");
  assert.equal(xai.find((finding) => finding.kind === "model_reference")?.sdk, "xAI OpenAI-compatible");
  assert.deepEqual(unrelated, []);
});

test("reports a deprecated model whose shutdown date is not announced", async () => {
  const database = await loadDatabase();
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const findings = analyzeCode(
    "src/anthropic.ts",
    'import Anthropic from "@anthropic-ai/sdk"; new Anthropic().messages.create({ model: "claude-mythos-preview", max_tokens: 64, messages: [] });',
    entries,
  );
  const modelFindings = findings.filter((finding) => finding.kind === "model_reference");
  assert.equal(modelFindings[0]?.shutdownDate, null);
  const summary = renderActionSummary({
    schemaVersion: 1,
    toolVersion: "0.3.0",
    databaseVersion: database.version,
    databaseCheckedAt: database.checkedAt,
    scannedAt: "2026-08-07T00:00:00.000Z",
    root: "/tmp/repository",
    filesScanned: 1,
    limitations: [],
    findings: modelFindings,
    summary: {
      filesSkipped: 0,
      modelReferences: 1,
      apiDeprecations: 0,
      runtimeChecks: 0,
      migrationRisks: 0,
      deprecated: 1,
      retired: 0,
      safeAutoFixes: 1,
    },
  });
  assert.match(summary, /Not announced/);
  assert.match(summary, /Deterministic repair available/);
});

test("reports OpenAI API shutdowns without inventing unsafe migrations", async () => {
  const database = await loadDatabase();
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const findings = analyzeCode(
    "src/openai.ts",
    `import OpenAI from "openai";
const client = new OpenAI();
await client.beta.threads.runs.create("thread", { assistant_id: "assistant" });
await client.videos.create({ model: "sora-2", prompt: "hello" });
await client.responses.create({ prompt: { id: "pmpt_123" } });
await client.evals.create({ name: "quality" });`,
    entries,
    database.apiDeprecations,
  );
  const apiFindings = findings.filter((finding) => finding.kind === "api_deprecation");
  const assistants = apiFindings.find((finding) => finding.apiId === "assistants-api");
  const videos = apiFindings.find((finding) => finding.apiId === "videos-api");
  const prompts = apiFindings.find((finding) => finding.apiId === "reusable-prompts-api");
  const evals = apiFindings.find((finding) => finding.apiId === "evals-api");

  assert.equal(assistants?.shutdownDate, "2026-08-26");
  assert.equal(assistants?.status, "retired");
  assert.equal(assistants?.replacement, "Responses API and Conversations API");
  assert.equal(videos?.shutdownDate, "2026-09-24");
  assert.equal(videos?.replacement, null);
  assert.equal(
    prompts?.replacement,
    "Move reusable prompt content into your application code",
  );
  assert.equal(evals?.replacement, "Promptfoo");
  const summary = renderActionSummary({
    schemaVersion: 1,
    toolVersion: "0.3.0",
    databaseVersion: database.version,
    databaseCheckedAt: database.checkedAt,
    scannedAt: new Date(0).toISOString(),
    root: "/tmp/repository",
    filesScanned: 1,
    limitations: [],
    findings: apiFindings,
    summary: {
      filesSkipped: 0,
      modelReferences: 0,
      apiDeprecations: 4,
      runtimeChecks: 0,
      migrationRisks: 0,
      deprecated: 0,
      retired: 0,
      safeAutoFixes: 0,
    },
  });
  assert.match(summary, /Responses API and Conversations API/);
  assert.match(summary, /no official replacement is listed/);
  assert.match(summary, /Promptfoo/);
  assert.match(summary, /Immediate action required/);
});

test("does not classify unrelated prompt or eval clients as OpenAI APIs", async () => {
  const database = await loadDatabase();
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const findings = analyzeCode(
    "src/other.ts",
    `import { EvalClient } from "other-sdk";
const client = new EvalClient();
await client.evals.create({ name: "x" });
await client.prompts.create({ body: "x" });`,
    entries,
    database.apiDeprecations,
  );
  assert.deepEqual(findings, []);
});
