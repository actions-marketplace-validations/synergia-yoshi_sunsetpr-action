import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiLifecycleEntry, LifecycleDatabase, LifecycleEntry } from "./types.js";

const PROVIDERS = new Set(["openai", "anthropic", "gemini"]);
const STATUSES = new Set(["deprecated", "retired"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);
const OFFICIAL_SOURCES = {
  openai: {
    hostname: "developers.openai.com",
    pathname: "/api/docs/deprecations",
  },
  anthropic: {
    hostname: "platform.claude.com",
    pathname: "/docs/en/about-claude/model-deprecations",
  },
  gemini: {
    hostname: "ai.google.dev",
    pathname: "/gemini-api/docs/deprecations",
  },
} as const;

function defaultDatabasePath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDirectory, "../../data/lifecycle.json");
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validateEntry(value: unknown, index: number): asserts value is LifecycleEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Lifecycle entry ${index} is not an object`);
  }
  const entry = value as Record<string, unknown>;
  if (!PROVIDERS.has(String(entry.provider))) {
    throw new Error(`Lifecycle entry ${index} has an unsupported provider`);
  }
  if (!STATUSES.has(String(entry.status))) {
    throw new Error(`Lifecycle entry ${index} has an unsupported status`);
  }
  if (!CONFIDENCES.has(String(entry.replacementConfidence))) {
    throw new Error(`Lifecycle entry ${index} has an invalid replacement confidence`);
  }
  for (const key of ["modelId", "replacement", "sourceUrl", "notes"]) {
    if (typeof entry[key] !== "string" || entry[key].length === 0) {
      throw new Error(`Lifecycle entry ${index} is missing ${key}`);
    }
  }
  if (entry.shutdownDate !== null && !isIsoDate(String(entry.shutdownDate))) {
    throw new Error(`Lifecycle entry ${index} has an invalid shutdown date`);
  }
  if (entry.status === "retired" && entry.shutdownDate === null) {
    throw new Error(`Lifecycle entry ${index} cannot be retired without a shutdown date`);
  }
  const source = new URL(String(entry.sourceUrl));
  if (source.protocol !== "https:") {
    throw new Error(`Lifecycle entry ${index} must use an HTTPS source URL`);
  }
  const provider = entry.provider as LifecycleEntry["provider"];
  const expectedSource = OFFICIAL_SOURCES[provider];
  if (
    source.hostname !== expectedSource.hostname ||
    source.pathname.replace(/\/$/, "") !== expectedSource.pathname
  ) {
    throw new Error(`Lifecycle entry ${index} must cite the official ${provider} source`);
  }
}

function validateApiEntry(value: unknown, index: number): asserts value is ApiLifecycleEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error(`API lifecycle entry ${index} is not an object`);
  }
  const entry = value as Record<string, unknown>;
  if (
    entry.provider !== "openai" ||
    !["assistants-api", "videos-api", "reusable-prompts-api", "evals-api"].includes(
      String(entry.apiId),
    ) ||
    !["Assistants API", "Videos API", "Reusable prompts API", "Evals API"].includes(
      String(entry.apiName),
    ) ||
    entry.status !== "deprecated" ||
    !["OpenAI Assistants", "OpenAI Videos", "OpenAI Prompts", "OpenAI Evals"].includes(
      String(entry.sdk),
    )
  ) {
    throw new Error(`API lifecycle entry ${index} has unsupported metadata`);
  }
  for (const key of ["shutdownDate", "sourceUrl", "notes"]) {
    if (typeof entry[key] !== "string" || entry[key].length === 0) {
      throw new Error(`API lifecycle entry ${index} is missing ${key}`);
    }
  }
  if (entry.replacement !== null && (typeof entry.replacement !== "string" || !entry.replacement)) {
    throw new Error(`API lifecycle entry ${index} has an invalid replacement`);
  }
  if (!isIsoDate(String(entry.shutdownDate))) {
    throw new Error(`API lifecycle entry ${index} has an invalid shutdown date`);
  }
  const source = new URL(String(entry.sourceUrl));
  const expectedSource = OFFICIAL_SOURCES.openai;
  if (
    source.protocol !== "https:" ||
    source.hostname !== expectedSource.hostname ||
    source.pathname.replace(/\/$/, "") !== expectedSource.pathname
  ) {
    throw new Error(`API lifecycle entry ${index} must cite the official openai source`);
  }
}

export async function loadDatabase(explicitPath?: string): Promise<LifecycleDatabase> {
  const databasePath = explicitPath ? path.resolve(explicitPath) : defaultDatabasePath();
  const parsed = JSON.parse(await readFile(databasePath, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Lifecycle database root must be an object");
  }
  const database = parsed as Record<string, unknown>;
  if (
    !Number.isInteger(database.version) ||
    typeof database.checkedAt !== "string" ||
    !Array.isArray(database.apiDeprecations) ||
    !Array.isArray(database.entries)
  ) {
    throw new Error(
      "Lifecycle database is missing version, checkedAt, API entries, or model entries",
    );
  }
  if (!isIsoDate(database.checkedAt)) {
    throw new Error("Lifecycle database has an invalid checkedAt date");
  }
  database.entries.forEach(validateEntry);
  database.apiDeprecations.forEach(validateApiEntry);
  const modelIds = new Set<string>();
  const entriesByModelId = new Map<string, LifecycleEntry>();
  for (const entry of database.entries) {
    if (modelIds.has(entry.modelId)) {
      throw new Error(`Duplicate model ID in lifecycle database: ${entry.modelId}`);
    }
    modelIds.add(entry.modelId);
    entriesByModelId.set(entry.modelId, entry);
  }
  for (const entry of database.entries) {
    const deprecatedReplacement = entriesByModelId.get(entry.replacement);
    if (deprecatedReplacement && entry.replacementConfidence === "high") {
      throw new Error(
        `High-confidence replacement for ${entry.modelId} is itself ${deprecatedReplacement.status}: ${entry.replacement}`,
      );
    }
  }
  const apiIds = new Set<string>();
  for (const entry of database.apiDeprecations) {
    if (apiIds.has(entry.apiId)) {
      throw new Error(`Duplicate API ID in lifecycle database: ${entry.apiId}`);
    }
    apiIds.add(entry.apiId);
  }
  return {
    version: database.version as number,
    checkedAt: database.checkedAt,
    entries: database.entries,
    apiDeprecations: database.apiDeprecations,
  };
}
