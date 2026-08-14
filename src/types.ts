export type Provider = "openai" | "anthropic" | "gemini" | "cohere" | "xai";
export type LifecycleStatus = "deprecated" | "retired";
export type Confidence = "high" | "medium" | "low";

export interface LifecycleEntry {
  provider: Provider;
  modelId: string;
  status: LifecycleStatus;
  shutdownDate: string | null;
  replacement: string;
  sourceUrl: string;
  replacementConfidence: Confidence;
  notes: string;
}

export interface ApiLifecycleEntry {
  provider: "openai";
  apiId: "assistants-api" | "videos-api" | "reusable-prompts-api" | "evals-api";
  apiName: "Assistants API" | "Videos API" | "Reusable prompts API" | "Evals API";
  status: "deprecated";
  shutdownDate: string;
  replacement: string | null;
  sourceUrl: string;
  sdk: "OpenAI Assistants" | "OpenAI Videos" | "OpenAI Prompts" | "OpenAI Evals";
  notes: string;
}

export interface LifecycleDatabase {
  version: number;
  checkedAt: string;
  entries: LifecycleEntry[];
  apiDeprecations: ApiLifecycleEntry[];
}

export interface Location {
  path: string;
  line: number;
  column: number;
  byteStart: number;
  byteEnd: number;
}

export type ReferenceSource = "hardcoded" | "environment" | "config";

export interface ModelFinding {
  id: string;
  kind: "model_reference";
  provider: Provider;
  modelId: string;
  status: LifecycleStatus;
  shutdownDate: string | null;
  replacement: string;
  sourceUrl: string;
  sourceKind: ReferenceSource;
  confidence: Confidence;
  replacementConfidence: Confidence;
  sdk: string | null;
  location: Location;
  message: string;
}

export interface RuntimeCheckFinding {
  id: string;
  kind: "runtime_check";
  provider: Provider;
  expression: string;
  confidence: "low";
  sdk: string;
  location: Location;
  message: string;
}

export interface ApiDeprecationFinding {
  id: string;
  kind: "api_deprecation";
  provider: "openai";
  apiId: "assistants-api" | "videos-api" | "reusable-prompts-api" | "evals-api";
  status: "deprecated";
  shutdownDate: string;
  replacement: string | null;
  sourceUrl: string;
  confidence: "high";
  sdk: "OpenAI Assistants" | "OpenAI Videos" | "OpenAI Prompts" | "OpenAI Evals";
  location: Location;
  message: string;
}

export interface MigrationRiskFinding {
  id: string;
  kind: "migration_risk";
  provider: "anthropic";
  ruleId: "anthropic-unsupported-sampling-parameter";
  parameter: "temperature" | "top_p" | "top_k";
  targetModel: string;
  confidence: Confidence;
  autoFix: boolean;
  oldText: string;
  sourceUrl: string;
  location: Location;
  message: string;
}

export type Finding =
  | ModelFinding
  | RuntimeCheckFinding
  | ApiDeprecationFinding
  | MigrationRiskFinding;

export interface ScanReport {
  schemaVersion: 1;
  toolVersion: string;
  databaseVersion: number;
  databaseCheckedAt: string;
  scannedAt: string;
  root: string;
  filesScanned: number;
  limitations: Array<{
    path: string;
    reason: string;
  }>;
  findings: Finding[];
  summary: {
    filesSkipped: number;
    modelReferences: number;
    apiDeprecations: number;
    runtimeChecks: number;
    migrationRisks: number;
    deprecated: number;
    retired: number;
    safeAutoFixes: number;
  };
}

export interface PlannedEdit {
  path: string;
  byteStart: number;
  byteEnd: number;
  oldText: string;
  newText: string;
  findingId: string;
  line?: number;
  editKind?: "model_id" | "parameter_removal";
}

export interface VerificationStep {
  name: string;
  command: string;
  status: "passed" | "failed" | "skipped";
  exitCode: number | null;
  durationMs: number;
  output: string;
}

export interface MigrationReport {
  schemaVersion: 1;
  createdAt: string;
  root: string;
  disposition: "draft_ready" | "draft_only" | "report_only";
  initialScan: ScanReport;
  finalScan: ScanReport;
  edits: PlannedEdit[];
  patchPath: string | null;
  compatibilityTestPath: string | null;
  prBodyPath: string;
  verification: VerificationStep[];
  unconfirmed: string[];
}

export interface BenchmarkManifest {
  positives: Array<{ path: string; line: number; modelId: string }>;
  negatives: Array<{ path: string; description: string }>;
}

export interface BenchmarkResult {
  truePositives: number;
  falseNegatives: number;
  falsePositives: number;
  trueNegatives: number;
  recall: number;
  falsePositiveRate: number;
  passed: boolean;
  missing: string[];
  unexpected: string[];
}
