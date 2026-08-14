import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadDatabase } from "../src/database.js";

async function writeDatabase(entries: unknown[]): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sunsetpr-database-"));
  const databasePath = path.join(directory, "lifecycle.json");
  await writeFile(
    databasePath,
    `${JSON.stringify({ version: 1, checkedAt: "2026-07-19", apiDeprecations: [], entries })}\n`,
    "utf8",
  );
  return databasePath;
}

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: "openai",
    modelId: "retiring-model",
    status: "deprecated",
    shutdownDate: "2026-12-11",
    replacement: "current-model",
    sourceUrl: "https://developers.openai.com/api/docs/deprecations",
    replacementConfidence: "high",
    notes: "Official substitute model.",
    ...overrides,
  };
}

test("accepts an official source and a currently supported replacement", async () => {
  const databasePath = await writeDatabase([entry()]);
  const database = await loadDatabase(databasePath);
  assert.equal(database.entries.length, 1);
});

test("loads all current report-only API surfaces", async () => {
  const database = await loadDatabase();
  assert.deepEqual(
    database.apiDeprecations.map((entry) => entry.apiId),
    ["assistants-api", "videos-api", "reusable-prompts-api", "evals-api"],
  );
});

test("rejects a third-party lifecycle source", async () => {
  const databasePath = await writeDatabase([
    entry({ sourceUrl: "https://example.com/copied-deprecations" }),
  ]);
  await assert.rejects(loadDatabase(databasePath), /official openai source/);
});

test("accepts a deprecated model before its shutdown date is announced", async () => {
  const databasePath = await writeDatabase([entry({ shutdownDate: null })]);
  const database = await loadDatabase(databasePath);
  assert.equal(database.entries[0]?.shutdownDate, null);
});

test("rejects a retired model without a shutdown date", async () => {
  const databasePath = await writeDatabase([entry({ status: "retired", shutdownDate: null })]);
  await assert.rejects(loadDatabase(databasePath), /cannot be retired without a shutdown date/);
});

test("rejects a high-confidence replacement that is itself deprecated", async () => {
  const databasePath = await writeDatabase([
    entry(),
    entry({
      modelId: "current-model",
      replacement: "newest-model",
      shutdownDate: "2027-01-01",
    }),
  ]);
  await assert.rejects(loadDatabase(databasePath), /is itself deprecated/);
});

test("permits a replacement chain only when it is explicitly report-only", async () => {
  const databasePath = await writeDatabase([
    entry({ replacementConfidence: "medium" }),
    entry({
      modelId: "current-model",
      replacement: "newest-model",
      shutdownDate: "2027-01-01",
    }),
  ]);
  const database = await loadDatabase(databasePath);
  assert.equal(database.entries[0]?.replacementConfidence, "medium");
});
