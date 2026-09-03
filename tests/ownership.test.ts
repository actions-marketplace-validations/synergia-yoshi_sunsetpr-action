import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCode } from "../src/analyzer.js";
import { loadDatabase } from "../src/database.js";

const database = await loadDatabase();
const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));

function modelFindings(path: string, source: string) {
  return analyzeCode(path, source, entries).filter(
    (finding) => finding.kind === "model_reference",
  );
}

function assertRuntimeOnly(path: string, source: string, expectedRuntimeChecks = 1): void {
  const findings = analyzeCode(path, source, entries);
  const models = findings.filter((finding) => finding.kind === "model_reference");
  assert.equal(models.length, 1, path);
  assert.equal(models[0]?.confidence, "medium", path);
  assert.equal(
    findings.filter((finding) => finding.kind === "runtime_check").length,
    expectedRuntimeChecks,
    path,
  );
}

test("requires exact TypeScript SDK ownership before reporting high confidence", () => {
  const official = modelFindings(
    "src/official.ts",
    `import OpenAI from "openai";
new OpenAI().responses.create({ model: "gpt-4-turbo", input: "x" });`,
  );
  assert.equal(official[0]?.confidence, "high");

  for (const [label, source, expectedRuntimeChecks] of [
    [
      "local-class",
      `import SDK from "openai";
class OpenAI {}
new OpenAI().responses.create({ model: "gpt-4-turbo", input: "x" });`,
      1,
    ],
    [
      "shadowed-parameter",
      `import OpenAI from "openai";
function run(OpenAI: any) {
  return new OpenAI().responses.create({ model: "gpt-4-turbo", input: "x" });
}`,
      1,
    ],
    [
      "nested-member",
      `import OpenAI from "openai";
const client = new OpenAI();
client.custom.responses.create({ model: "gpt-4-turbo", input: "x" });`,
      0,
    ],
    [
      "wrapped-require",
      `const OpenAI = wrap(require("openai"));
new OpenAI().responses.create({ model: "gpt-4-turbo", input: "x" });`,
      1,
    ],
  ] as const) {
    assertRuntimeOnly(`src/${label}.ts`, source, expectedRuntimeChecks);
  }
});

test("keeps ambiguous Python SDK ownership at runtime confirmation", () => {
  for (const [label, source] of [
    [
      "late-binding",
      `from openai import OpenAI
def run():
  OpenAI().responses.create(model="gpt-4-turbo", input="x")
  OpenAI = custom`,
    ],
    [
      "lambda-parameter",
      `from openai import OpenAI
run = lambda OpenAI: OpenAI().responses.create(model="gpt-4-turbo", input="x")`,
    ],
    [
      "conditional-import",
      `if use_custom:
  from custom import OpenAI
else:
  from openai import OpenAI
OpenAI().responses.create(model="gpt-4-turbo", input="x")`,
    ],
    [
      "wildcard-import",
      `from openai import OpenAI
from custom import *
OpenAI().responses.create(model="gpt-4-turbo", input="x")`,
    ],
    [
      "class-namespace",
      `from custom import OpenAI
class Runner:
  from openai import OpenAI
  def run(self):
    return OpenAI().responses.create(model="gpt-4-turbo", input="x")`,
    ],
    [
      "global-directive",
      `from custom import OpenAI
def outer():
  from openai import OpenAI
  def inner():
    global OpenAI
    return OpenAI().responses.create(model="gpt-4-turbo", input="x")`,
    ],
  ] as const) {
    assertRuntimeOnly(`src/${label}.py`, source);
  }
});

test("preserves direct Python SDK ownership", () => {
  const findings = modelFindings(
    "src/official.py",
    `from openai import OpenAI
OpenAI().responses.create(model="gpt-4-turbo", input="x")`,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.confidence, "high");
});
