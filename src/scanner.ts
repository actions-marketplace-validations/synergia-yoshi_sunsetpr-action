import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { analyzeCode, analyzeConfig } from "./analyzer.js";
import { listSupportedFiles } from "./files.js";
import type { Finding, LifecycleDatabase, ScanReport } from "./types.js";
import { TOOL_VERSION } from "./version.js";

const MAX_SUPPORTED_FILES = 25_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export async function scanRepository(
  rootInput: string,
  database: LifecycleDatabase,
): Promise<ScanReport> {
  const root = path.resolve(rootInput);
  const entries = new Map(database.entries.map((entry) => [entry.modelId, entry]));
  const files = await listSupportedFiles(root);
  if (files.length > MAX_SUPPORTED_FILES) {
    throw new Error(
      `Repository has ${files.length} supported files; maximum is ${MAX_SUPPORTED_FILES}`,
    );
  }
  const findings: Finding[] = [];
  const limitations: ScanReport["limitations"] = [];
  let filesScanned = 0;
  let totalBytes = 0;

  for (const file of files) {
    const fileSize = (await stat(file.absolutePath)).size;
    if (fileSize > MAX_FILE_BYTES) {
      limitations.push({
        path: file.relativePath,
        reason: `File size ${fileSize} bytes exceeds the ${MAX_FILE_BYTES}-byte static-analysis limit; runtime or manual confirmation is required.`,
      });
      continue;
    }
    totalBytes += fileSize;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Repository supported-file content exceeds the ${MAX_TOTAL_BYTES}-byte analysis limit`,
      );
    }
    const content = await readFile(file.absolutePath, "utf8");
    try {
      const fileFindings =
        file.kind === "code"
          ? analyzeCode(file.relativePath, content, entries, database.apiDeprecations)
          : analyzeConfig(file.relativePath, content, entries);
      findings.push(...fileFindings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to parse ${file.relativePath}: ${message}`, { cause: error });
    }
    filesScanned += 1;
  }

  findings.sort((left, right) => {
    const byPath = left.location.path.localeCompare(right.location.path);
    if (byPath !== 0) {
      return byPath;
    }
    return (
      left.location.line - right.location.line ||
      left.location.column - right.location.column ||
      left.kind.localeCompare(right.kind)
    );
  });

  const modelFindings = findings.filter((finding) => finding.kind === "model_reference");
  const apiDeprecations = findings.filter((finding) => finding.kind === "api_deprecation");
  const runtimeChecks = findings.filter((finding) => finding.kind === "runtime_check");
  const migrationRisks = findings.filter((finding) => finding.kind === "migration_risk");
  return {
    schemaVersion: 1,
    toolVersion: TOOL_VERSION,
    databaseVersion: database.version,
    databaseCheckedAt: database.checkedAt,
    scannedAt: new Date().toISOString(),
    root,
    filesScanned,
    limitations,
    findings,
    summary: {
      filesSkipped: limitations.length,
      modelReferences: modelFindings.length,
      apiDeprecations: apiDeprecations.length,
      runtimeChecks: runtimeChecks.length,
      migrationRisks: migrationRisks.length,
      deprecated: modelFindings.filter((finding) => finding.status === "deprecated").length,
      retired: modelFindings.filter((finding) => finding.status === "retired").length,
      safeAutoFixes: modelFindings.filter(
        (finding) => finding.confidence === "high" && finding.replacementConfidence === "high",
      ).length,
    },
  };
}
