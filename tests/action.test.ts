import assert from "node:assert/strict";
import test from "node:test";
import { renderActionSummary, resolveReportPath } from "../src/action.js";
import { analyzeCode } from "../src/analyzer.js";
import { loadDatabase } from "../src/database.js";
import { scanRepository } from "../src/scanner.js";

test("ships a current validated lifecycle database", async () => {
  const database = await loadDatabase();
  assert.equal(database.checkedAt, "2026-08-07");
  assert.equal(database.entries.length, 111);
  assert.equal(new Set(database.entries.map((entry) => entry.modelId)).size, 111);
  assert.equal(database.apiDeprecations.length, 4);
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
  assert.match(summary, /Human review required/);
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
