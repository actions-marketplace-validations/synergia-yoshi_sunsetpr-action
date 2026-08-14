# Changelog

## Unreleased

- Refresh the official-source database to 124 model IDs and 4 API surfaces on 2026-08-14, preserving an unannounced Anthropic retirement date as unknown.
- Add Cohere and xAI provider-owned lifecycle sources, report-only retirement entries, SDK-aware detection, weekly semantic fingerprints, catalog pages, and labeled regression cases.
- Detect reusable OpenAI prompt objects and Evals API calls without applying unsafe semantic rewrites.
- Add a shareable Markdown migration decision with deadline, next action, and official evidence.
- Classify scans as `urgent`, `review_required`, `repair_ready`, or `clear` using deterministic rules.
- Report officially documented Anthropic sampling-parameter migration risks.

## 0.2.0 — 2026-07-19

- Detect OpenAI Assistants API calls with the official 2026-08-26 shutdown and Responses API plus
  Conversations API migration path.
- Detect OpenAI Videos API calls with the official 2026-09-24 shutdown and preserve the absence of
  an official replacement.
- Publish API lifecycle entries in the machine-readable database, official-source monitor, JSON
  output, annotations, Job Summary, and crawlable shutdown pages.
- Add a fixed-commit public regression sample covering 56 Assistants API call sites in 8 files.
- Resolve safe single-use TypeScript constants and legacy Gemini Python positional model calls.
- Keep mutable, conditional, shorthand, and environment-backed model values explicitly unconfirmed.

## 0.1.7 — 2026-07-19

- Recognize the official OpenAI `beta.chat.completions.runTools` helper as a high-confidence SDK context.
- Preserve a runtime-confirmation finding when a model expression combines a literal fallback with a dynamic override.

## 0.1.6 — 2026-07-19

- Make the first scan non-blocking by default with `fail-on: never`.
- Keep `deprecated` and `retired` failure thresholds as explicit opt-ins.
- Replace behavioral-compatibility wording with location-scoped migration evidence.
- Remove unvalidated price anchors from the public README.

## 0.1.5 — 2026-07-19

- Publish 230 positive and 230 negative labeled regression fixtures.
- Publish 105 model lifecycle pages and a 107-URL sitemap.
- Add version-consistency, page-generation, CodeQL, and packaged-Action gates.
- Enable repository security controls and immutable releases.

## 0.1.4 — 2026-07-19

- Separate detection confidence from official-replacement confidence in the Job Summary.
- Reject newline-bearing report paths before they cross GitHub output-record boundaries.
- Ship the Linux x64 parser bundle produced and self-tested by hosted CI.

## 0.1.3 — 2026-07-19

- Require both high-confidence code context and replacement evidence for a safe-fix candidate.
- Keep model-like catalog and configuration references visible but report-only.
- Publish the generated 105-entry Markdown lifecycle catalog with a CI drift guard.

## 0.1.2 — 2026-07-19

- Add six newly verified OpenAI model snapshots scheduled to shut down on 2026-12-11.
- Require provider-specific official documentation URLs in the lifecycle database.
- Reject high-confidence replacements that are themselves deprecated or retired.
- Route replacement chains to a current endpoint and keep chained migrations report-only.
- Correct the JavaScript Action output metadata contract.

## 0.1.1 — 2026-07-19

- Fix the bundled native AST parser bootstrap on GitHub-hosted Linux runners.
- Validate bundled native and Python parser assets before starting analysis.

## 0.1.0 — 2026-07-19

- Detect 99 exact OpenAI, Anthropic, and Gemini deprecated or retired model IDs and aliases.
- Scan TypeScript, JavaScript, Python, and common configuration formats.
- Add GitHub line annotations, Job Summary evidence tables, and JSON report outputs.
- Mark unresolved dynamic and environment-backed SDK model arguments for runtime confirmation.
- Separate detection confidence from replacement confidence.
- Treat only high-confidence official replacements as safe automatic-fix candidates.
- Run without sending repository code to SunsetPR or an external model.
