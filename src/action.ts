import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { loadDatabase } from "./database.js";
import { renderScanText, summarizeScanDecision } from "./report.js";
import { scanRepository } from "./scanner.js";
import type { Finding, ScanReport } from "./types.js";
import { TOOL_VERSION } from "./version.js";

const FAIL_THRESHOLDS = new Set(["never", "deprecated", "retired"]);
export const DEFAULT_FAIL_ON = "never";
const REPAIR_BETA_URL =
  "https://github.com/synergia-yoshi/sunsetpr-action/issues/new?template=repair-beta.yml";

async function appendIfConfigured(environmentName: string, content: string): Promise<void> {
  const outputPath = process.env[environmentName];
  if (outputPath) {
    await appendFile(outputPath, content, "utf8");
  }
}

export function escapeSummaryHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("@", "&#64;");
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("@", "@\u200b");
}

function inlineCode(value: string): string {
  return `\`${escapeMarkdown(value).replaceAll("`", "ˋ")}\``;
}

function workflowCommandValue(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}

function workflowCommandMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

export function resolveReportPath(input: string): string {
  if (/[\r\n]/u.test(input)) {
    throw new Error("Output path must not contain newline characters");
  }
  return path.resolve(input);
}

export function renderAnnotation(finding: Finding): string {
  const level =
    finding.kind === "runtime_check"
      ? "notice"
      : finding.kind === "migration_risk"
        ? "warning"
        : finding.kind === "api_deprecation"
          ? finding.status === "retired"
            ? "error"
            : "warning"
          : finding.status === "retired"
            ? "error"
            : "warning";
  const title =
    finding.kind === "runtime_check"
      ? "SunsetPR: runtime confirmation required"
      : finding.kind === "migration_risk"
        ? "SunsetPR: deterministic migration risk"
        : finding.kind === "api_deprecation"
          ? `SunsetPR: ${finding.status} API surface`
          : `SunsetPR: ${finding.provider} model ${finding.status}`;
  const message =
    finding.kind === "runtime_check"
      ? finding.message
      : finding.kind === "migration_risk"
        ? `${finding.message} Official source: ${finding.sourceUrl}`
        : finding.kind === "api_deprecation"
          ? `${finding.apiId} → ${finding.replacement ?? "no official replacement listed"}; shutdown ${finding.shutdownDate}. Official source: ${finding.sourceUrl}`
          : `${finding.modelId} → ${finding.replacement}; shutdown ${finding.shutdownDate ?? "not announced"}; replacement confidence ${finding.replacementConfidence}. Official source: ${finding.sourceUrl}`;
  return `::${level} file=${workflowCommandValue(finding.location.path)},line=${finding.location.line},col=${finding.location.column},title=${workflowCommandValue(title)}::${workflowCommandMessage(message)}`;
}

export function renderActionSummary(report: ScanReport): string {
  const decision = summarizeScanDecision(report);
  const decisionIcon =
    decision.status === "urgent"
      ? "🔴"
      : decision.status === "review_required"
        ? "🟠"
        : decision.status === "repair_ready"
          ? "🟡"
          : "🟢";
  const deadline = decision.nearestShutdownDate
    ? `${decision.nearestShutdownDate}${decision.daysUntilShutdown === null ? "" : ` (${decision.daysUntilShutdown} day(s))`}`
    : "none found";
  const modelFindings = report.findings.filter((finding) => finding.kind === "model_reference");
  const rows = modelFindings
    .map(
      (finding) =>
        `| ${finding.status === "retired" ? "🔴 retired" : "🟠 deprecated"} | ${escapeMarkdown(finding.provider)} | ${inlineCode(finding.modelId)} | ${inlineCode(finding.replacement)} | ${finding.shutdownDate ?? "Not announced"} | ${escapeMarkdown(finding.replacementConfidence)} | [official](${finding.sourceUrl}) | ${inlineCode(`${finding.location.path}:${finding.location.line}`)} |`,
    )
    .join("\n");
  const runtimeRows = report.findings
    .filter((finding) => finding.kind === "runtime_check")
    .map(
      (finding) =>
        `- ${inlineCode(`${finding.location.path}:${finding.location.line}`)} — ${escapeMarkdown(finding.message)}`,
    )
    .join("\n");
  const apiRows = report.findings
    .filter((finding) => finding.kind === "api_deprecation")
    .map(
      (finding) =>
        `- ${inlineCode(`${finding.location.path}:${finding.location.line}`)} — ${inlineCode(finding.apiId)} ${finding.status === "retired" ? "shut down" : "shuts down"} ${finding.shutdownDate}; ${finding.replacement ? `migrate to ${escapeMarkdown(finding.replacement)}` : "no official replacement is listed"} ([official](${finding.sourceUrl}))`,
    )
    .join("\n");
  const migrationRiskRows = report.findings
    .filter((finding) => finding.kind === "migration_risk")
    .map(
      (finding) =>
        `- ${inlineCode(`${finding.location.path}:${finding.location.line}`)} — ${escapeMarkdown(finding.message)} ([official](${finding.sourceUrl}))`,
    )
    .join("\n");
  const limitationRows = report.limitations
    .map((limitation) => `- ${inlineCode(limitation.path)} — ${escapeMarkdown(limitation.reason)}`)
    .join("\n");

  return `## SunsetPR model lifecycle check

### Decision

- ${decisionIcon} **${decision.label}** (${decision.status})
- Nearest shutdown: **${deadline}**
- Next action: ${escapeMarkdown(decision.nextAction)}

${modelFindings.length === 0 ? "✅ No known deprecated or retired model IDs were found." : `Found **${modelFindings.length}** model reference(s): **${report.summary.retired} retired**, **${report.summary.deprecated} deprecated**. **${report.summary.safeAutoFixes}** have a high-confidence official replacement.`}

| Status | Provider | Model | Official replacement | Shutdown | Replacement confidence | Evidence | Location |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows || "| ✅ clear | — | — | — | — | — | — | — |"}
${apiRows ? `\n### Deprecated API surfaces\n\nSunsetPR reports these surfaces without applying an unsafe semantic rewrite.\n\n${apiRows}\n` : ""}
${migrationRiskRows ? `\n### Deterministic migration risks\n\nThese rules come directly from provider migration documentation; no model inference is used.\n\n${migrationRiskRows}\n` : ""}
${runtimeRows ? `\n### Runtime confirmation required\n\nStatic analysis could not resolve these values. SunsetPR does **not** classify them as unaffected.\n\n${runtimeRows}\n` : ""}
${limitationRows ? `\n### Scan limitations\n\n${limitationRows}\n` : ""}
### Scope and data handling

- Scanned ${report.filesScanned} TypeScript, JavaScript, Python, and supported config file(s) locally on this runner.
- Model values that are dynamic or environment-backed remain explicitly unconfirmed.
- No repository code or environment values are sent to SunsetPR or to an external AI model.
- SunsetPR Action **v${TOOL_VERSION}**; lifecycle database checked **${report.databaseCheckedAt}** against provider documentation.
${modelFindings.length > 0 ? `\n[Request a CI-verified draft repair PR](${REPAIR_BETA_URL}) — early access; no automatic merge.\n` : ""}
`;
}

export async function main(): Promise<void> {
  const root = path.resolve(process.env.INPUT_PATH ?? ".");
  const reportPath = resolveReportPath(process.env.INPUT_REPORT ?? ".sunsetpr/report.json");
  const summaryPath = resolveReportPath(process.env.INPUT_SUMMARY ?? ".sunsetpr/summary.md");
  const failOn = process.env["INPUT_FAIL-ON"] ?? DEFAULT_FAIL_ON;
  if (!FAIL_THRESHOLDS.has(failOn)) {
    throw new Error(`Invalid fail-on value "${failOn}"; expected never, deprecated, or retired`);
  }
  const database = await loadDatabase();
  const report = await scanRepository(root, database);
  const summary = renderActionSummary(report);
  const decision = summarizeScanDecision(report);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(summaryPath, summary, "utf8");

  await appendIfConfigured(
    "GITHUB_OUTPUT",
    `findings=${report.summary.modelReferences}\napi-deprecations=${report.summary.apiDeprecations}\nruntime-checks=${report.summary.runtimeChecks}\nmigration-risks=${report.summary.migrationRisks}\nretired=${report.summary.retired}\ndeprecated=${report.summary.deprecated}\nsafe-auto-fixes=${report.summary.safeAutoFixes}\ndecision=${decision.status}\nnearest-shutdown=${decision.nearestShutdownDate ?? ""}\nreport=${reportPath}\nsummary=${summaryPath}\n`,
  );
  await appendIfConfigured("GITHUB_STEP_SUMMARY", summary);
  for (const finding of report.findings) {
    process.stdout.write(`${renderAnnotation(finding)}\n`);
  }
  process.stdout.write(`${renderScanText(report)}\n`);

  const lifecycleFindings = report.findings.filter(
    (finding) => finding.kind === "model_reference" || finding.kind === "api_deprecation",
  );
  const fails =
    failOn === "retired"
      ? lifecycleFindings.some((finding) => finding.status === "retired")
      : failOn === "never"
        ? false
        : lifecycleFindings.length > 0;
  if (fails) {
    process.exitCode = 2;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`SunsetPR action failed: ${message}\n`);
    process.exitCode = 1;
  });
}
