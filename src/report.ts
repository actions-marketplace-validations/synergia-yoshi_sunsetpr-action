import path from "node:path";
import type { MigrationReport, ScanReport, VerificationStep } from "./types.js";

export type ScanDecisionStatus = "clear" | "repair_ready" | "review_required" | "urgent";

export interface ScanDecision {
  status: ScanDecisionStatus;
  label: string;
  nearestShutdownDate: string | null;
  daysUntilShutdown: number | null;
  nextAction: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function summarizeScanDecision(report: ScanReport): ScanDecision {
  const lifecycleFindings = report.findings.filter(
    (finding) => finding.kind === "model_reference" || finding.kind === "api_deprecation",
  );
  const nearestShutdownDate =
    lifecycleFindings
      .map((finding) => finding.shutdownDate)
      .filter((date): date is string => date !== null)
      .sort((left, right) => left.localeCompare(right))[0] ?? null;
  const referenceDate = Number.isFinite(Date.parse(report.scannedAt))
    ? Date.parse(report.scannedAt)
    : Date.parse(`${report.databaseCheckedAt}T00:00:00.000Z`);
  const daysUntilShutdown = nearestShutdownDate
    ? Math.ceil((Date.parse(`${nearestShutdownDate}T00:00:00.000Z`) - referenceDate) / DAY_MS)
    : null;
  const isUrgent =
    lifecycleFindings.some(
      (finding) => finding.kind === "model_reference" && finding.status === "retired",
    ) ||
    (daysUntilShutdown !== null && daysUntilShutdown <= 0);
  if (isUrgent) {
    return {
      status: "urgent",
      label: "Immediate action required",
      nearestShutdownDate,
      daysUntilShutdown,
      nextAction:
        "Stop treating this as routine maintenance; review affected paths and prepare a tested migration now.",
    };
  }

  const unsupportedMigrationRisk = report.findings.some(
    (finding) => finding.kind === "migration_risk" && !finding.autoFix,
  );
  const needsReview =
    report.summary.apiDeprecations > 0 ||
    report.summary.runtimeChecks > 0 ||
    report.limitations.length > 0 ||
    unsupportedMigrationRisk ||
    report.summary.modelReferences > report.summary.safeAutoFixes;
  if (needsReview) {
    return {
      status: "review_required",
      label: "Human review required",
      nearestShutdownDate,
      daysUntilShutdown,
      nextAction:
        "Confirm unresolved or semantic migration points before generating a repair patch.",
    };
  }
  if (report.summary.safeAutoFixes > 0) {
    return {
      status: "repair_ready",
      label: "Deterministic repair available",
      nearestShutdownDate,
      daysUntilShutdown,
      nextAction:
        "Generate the migration patch and run repository checks before opening a draft PR.",
    };
  }
  return {
    status: "clear",
    label: "No known lifecycle impact found",
    nearestShutdownDate,
    daysUntilShutdown,
    nextAction:
      "Keep the lifecycle database and scheduled scan enabled; dynamic calls remain outside static proof.",
  };
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function inlineCode(value: string): string {
  const oneLine = [...value]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("");
  const safe = oneLine.replaceAll("`", "ˋ").replaceAll("@", "@\u200b");
  return `\`${safe}\``;
}

function verificationTable(steps: VerificationStep[]): string {
  return steps
    .map(
      (step) =>
        `| ${escapeTable(step.name)} | ${step.status} | \`${escapeTable(step.command)}\` | ${step.durationMs} ms |`,
    )
    .join("\n");
}

export function renderScanText(report: ScanReport): string {
  const lines = [
    `SunsetPR scanned ${report.filesScanned} files (${report.summary.filesSkipped} skipped): ${report.summary.modelReferences} model reference(s), ${report.summary.apiDeprecations} API deprecation(s), ${report.summary.migrationRisks} migration risk(s), ${report.summary.runtimeChecks} runtime check(s).`,
  ];
  for (const limitation of report.limitations) {
    lines.push(`LIMIT ${limitation.path} ${limitation.reason}`);
  }
  for (const finding of report.findings) {
    if (finding.kind === "model_reference") {
      lines.push(
        `${finding.status === "retired" ? "ERROR" : "WARN"} ${finding.location.path}:${finding.location.line}:${finding.location.column} ${finding.modelId} -> ${finding.replacement} (${finding.shutdownDate ?? "shutdown not announced"}, ${finding.confidence})`,
      );
    } else if (finding.kind === "api_deprecation") {
      lines.push(
        `WARN ${finding.location.path}:${finding.location.line}:${finding.location.column} ${finding.apiId} -> ${finding.replacement ?? "no official replacement listed"} (${finding.shutdownDate}, ${finding.confidence})`,
      );
    } else if (finding.kind === "runtime_check") {
      lines.push(
        `CHECK ${finding.location.path}:${finding.location.line}:${finding.location.column} ${finding.message}`,
      );
    } else {
      lines.push(
        `RISK ${finding.location.path}:${finding.location.line}:${finding.location.column} ${finding.message}`,
      );
    }
  }
  return lines.join("\n");
}

export function renderScanDecisionMarkdown(report: ScanReport): string {
  const decision = summarizeScanDecision(report);
  const deadline = decision.nearestShutdownDate
    ? `${decision.nearestShutdownDate}${decision.daysUntilShutdown === null ? "" : ` (${decision.daysUntilShutdown} day(s))`}`
    : "None found";
  const evidence = report.findings
    .filter((finding) => finding.kind === "model_reference" || finding.kind === "api_deprecation")
    .map((finding) => {
      const subject = finding.kind === "model_reference" ? finding.modelId : finding.apiId;
      return `| ${inlineCode(subject)} | ${finding.status} | ${finding.shutdownDate ?? "Not announced"} | [official source](${finding.sourceUrl}) |`;
    })
    .join("\n");
  return `# SunsetPR migration decision

- Decision: **${decision.label}** (${decision.status})
- Nearest shutdown: **${deadline}**
- Next action: ${decision.nextAction}
- Findings: ${report.summary.modelReferences} model, ${report.summary.apiDeprecations} API, ${report.summary.runtimeChecks} runtime confirmation, ${report.summary.migrationRisks} migration risk
- Deterministic repair candidates: ${report.summary.safeAutoFixes}

| Affected item | Status | Shutdown | Evidence |
| --- | --- | --- | --- |
${evidence || "| — | clear | — | — |"}

The scan is deterministic and local. A clear result does not prove that runtime-computed model IDs are unaffected.
`;
}

export function renderPrBody(report: MigrationReport): string {
  const modelFindings = report.initialScan.findings.filter(
    (finding) => finding.kind === "model_reference",
  );
  const uniqueEvidence = new Map(
    modelFindings.map((finding) => [
      finding.modelId,
      {
        modelId: finding.modelId,
        replacement: finding.replacement,
        shutdownDate: finding.shutdownDate,
        sourceUrl: finding.sourceUrl,
        detectionConfidence: finding.confidence,
        replacementConfidence: finding.replacementConfidence,
      },
    ]),
  );
  const evidenceRows = [...uniqueEvidence.values()]
    .map(
      (item) =>
        `| \`${item.modelId}\` | \`${item.replacement}\` | ${item.shutdownDate ?? "Not announced"} | ${item.detectionConfidence} | ${item.replacementConfidence} | [official source](${item.sourceUrl}) |`,
    )
    .join("\n");
  const migrationRisks = report.initialScan.findings.filter(
    (finding) => finding.kind === "migration_risk",
  );
  const apiDeprecations = report.initialScan.findings.filter(
    (finding) => finding.kind === "api_deprecation",
  );
  const apiDeprecationRows = apiDeprecations
    .map(
      (finding) =>
        `| \`${finding.apiId}\` | ${finding.replacement ?? "No official replacement listed"} | ${finding.shutdownDate} | ${finding.confidence} | ${inlineCode(`${finding.location.path}:${finding.location.line}`)} | [official source](${finding.sourceUrl}) |`,
    )
    .join("\n");
  const editedFindingIds = new Set(report.edits.map((edit) => edit.findingId));
  const migrationRiskRows = migrationRisks
    .map(
      (risk) =>
        `| \`${risk.parameter}\` | \`${risk.targetModel}\` | ${inlineCode(`${risk.location.path}:${risk.location.line}`)} | ${editedFindingIds.has(risk.id) ? "removed" : "review required"} | [official source](${risk.sourceUrl}) |`,
    )
    .join("\n");
  const editedFiles = [...new Set(report.edits.map((edit) => edit.path))];
  const compatibilityTestFile = report.compatibilityTestPath
    ? path.relative(report.root, report.compatibilityTestPath).split(path.sep).join("/")
    : null;
  const changedFiles = [...editedFiles, ...(compatibilityTestFile ? [compatibilityTestFile] : [])];
  const failed = report.verification.filter((step) => step.status === "failed");
  const skipped = report.verification.filter((step) => step.status === "skipped");

  return `## SunsetPR migration

This is an automatically generated **draft**. It is never eligible for automatic merge.

### Outcome

- Disposition: **${report.disposition}**
- Changed ${report.edits.length} model reference(s) in ${editedFiles.length} source/config file(s).
- Added ${compatibilityTestFile ? `generated, location-scoped migration invariants in ${inlineCode(compatibilityTestFile)}` : "no generated migration invariants"}.
- Verification result: ${failed.length === 0 ? `all executed checks passed${skipped.length > 0 ? `; ${skipped.length} check(s) skipped` : ""}` : `${failed.length} check(s) failed`}.
- Generated migration invariants verify only the edited locations. They do not prove live model behavior, output quality, latency, or cost.

### Official evidence

| Deprecated model | Recommended replacement | Shutdown date | Detection | Replacement | Evidence |
| --- | --- | --- | --- | --- | --- |
${evidenceRows || "| — | — | — | — | — | — |"}
${
  apiDeprecations.length > 0
    ? `
### Deprecated API surfaces

These findings are report-only until SunsetPR has a deterministic migration rule for the affected API.

| API | Recommended migration | Shutdown date | Detection | Location | Evidence |
| --- | --- | --- | --- | --- | --- |
${apiDeprecationRows}
`
    : ""
}
${
  migrationRisks.length > 0
    ? `
### Deterministic migration risks

| Parameter | Target model | Location | Action | Evidence |
| --- | --- | --- | --- | --- |
${migrationRiskRows}
`
    : ""
}

### Changed files

${changedFiles.length > 0 ? changedFiles.map((file) => `- ${inlineCode(file)}`).join("\n") : "- No safe automatic edit was available."}

### Verification

| Check | Result | Command | Duration |
| --- | --- | --- | --- |
${verificationTable(report.verification)}

### Unconfirmed / requires review

${report.unconfirmed.length > 0 ? report.unconfirmed.map((item) => `- ${item}`).join("\n") : "- No statically unresolved model expressions were found."}
${report.initialScan.limitations.length > 0 ? `\n### Scan limitations\n\n${report.initialScan.limitations.map((limitation) => `- ${inlineCode(limitation.path)}: ${limitation.reason}`).join("\n")}` : ""}
${skipped.length > 0 ? `\n### Skipped checks\n\n${skipped.map((step) => `- **${step.name}:** ${step.output}`).join("\n")}` : ""}

### Safety

- No secrets or environment values were read into this report.
- No customer code was sent to an external model.
- No merge or deployment action was attempted.
- Review behavior, quality, cost, rate limits, and live API responses before merging.
`;
}
