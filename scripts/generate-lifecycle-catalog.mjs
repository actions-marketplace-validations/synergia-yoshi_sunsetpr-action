import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const databaseUrl = new URL("../data/lifecycle.json", import.meta.url);
const catalogUrl = new URL("../MODEL-LIFECYCLE.md", import.meta.url);
const checkOnly = process.argv.includes("--check");
const providerNames = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  cohere: "Cohere",
  xai: "xAI",
};

const database = JSON.parse(await readFile(databaseUrl, "utf8"));
const lines = [
  "# AI model shutdown dates and official replacements",
  "",
  `Machine-readable lifecycle data for ${database.entries.length} exact model IDs and aliases, checked against provider documentation on ${database.checkedAt}.`,
  "",
  "Provider documentation is the only source of truth. A listed replacement can still differ in behavior, quality, latency, price, limits, or supported parameters. `medium` and `low` replacement confidence are report-only by default.",
  "",
  "Use the [free SunsetPR GitHub Action](README.md#start-in-one-minute) to find these IDs at exact files and lines. The canonical machine-readable source is [`data/lifecycle.json`](data/lifecycle.json).",
  "",
];

for (const provider of ["openai", "anthropic", "gemini", "cohere", "xai"]) {
  const entries = database.entries
    .filter((entry) => entry.provider === provider)
    .sort(
      (left, right) =>
        (left.shutdownDate ?? "9999-12-31").localeCompare(
          right.shutdownDate ?? "9999-12-31",
        ) ||
        left.modelId.localeCompare(right.modelId),
    );
  lines.push(
    `## ${providerNames[provider]}`,
    "",
    "| Model ID | Status | Shutdown date | Official replacement | Confidence | Primary source |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  for (const entry of entries) {
    lines.push(
      `| \`${entry.modelId}\` | ${entry.status} | ${entry.shutdownDate ?? "Not announced"} | \`${entry.replacement}\` | ${entry.replacementConfidence} | [Official documentation](${entry.sourceUrl}) |`,
    );
  }
  lines.push("");
}

lines.push(
  "## Data boundaries",
  "",
  "- `deprecated` means the provider has announced deprecation; a shutdown date can still be unannounced.",
  "- `retired` means the published shutdown date has passed.",
  "- A dynamic value that static analysis cannot resolve is never classified as unaffected; SunsetPR reports `runtime confirmation required`.",
  "- SunsetPR is independent of OpenAI, Anthropic, Google, Cohere, xAI, and GitHub.",
  "",
);

const generated = `${lines.join("\n")}`;

if (checkOnly) {
  const current = await readFile(catalogUrl, "utf8").catch(() => "");
  if (current !== generated) {
    console.error("MODEL-LIFECYCLE.md is stale. Run npm run catalog:generate.");
    process.exitCode = 1;
  } else {
    console.log("Lifecycle catalog is up to date.");
  }
} else {
  await writeFile(catalogUrl, generated, "utf8");
  console.log("Generated MODEL-LIFECYCLE.md.");
}
