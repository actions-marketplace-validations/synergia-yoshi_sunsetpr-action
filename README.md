# SunsetPR AI Model Lifecycle Check

[![Test](https://github.com/synergia-yoshi/sunsetpr-action/actions/workflows/test.yml/badge.svg)](https://github.com/synergia-yoshi/sunsetpr-action/actions/workflows/test.yml)
[![Official source monitor](https://github.com/synergia-yoshi/sunsetpr-action/actions/workflows/official-source-monitor.yml/badge.svg)](https://github.com/synergia-yoshi/sunsetpr-action/actions/workflows/official-source-monitor.yml)
[![CodeQL](https://github.com/synergia-yoshi/sunsetpr-action/actions/workflows/codeql.yml/badge.svg)](https://github.com/synergia-yoshi/sunsetpr-action/actions/workflows/codeql.yml)
[![Latest release](https://img.shields.io/github/v/release/synergia-yoshi/sunsetpr-action)](https://github.com/synergia-yoshi/sunsetpr-action/releases/latest)
[![License](https://img.shields.io/github/license/synergia-yoshi/sunsetpr-action)](LICENSE)

Catch deprecated OpenAI, Anthropic, Google Gemini, Cohere, and xAI model IDs and selected API surfaces in CI
before their shutdown date.

SunsetPR reports the exact file and line, shutdown date, official replacement or migration path,
confidence, and provider-owned documentation. Dynamic model selection is never reported as
“unaffected”; it is marked for runtime confirmation. API redesigns remain report-only.

**Proof, not a screenshot:** inspect the [public demo scan workflow](https://github.com/synergia-yoshi/sunsetpr-demo/actions/workflows/sunsetpr.yml) and the [draft repair PR it complements](https://github.com/synergia-yoshi/sunsetpr-demo/pull/2). The PR shows the generated diff, migration invariants, official evidence, skipped checks, and repository CI in public.

## 日本語: 何をするActionか

SunsetPRは、通知だけで終わらせず、影響箇所を見つけ、検証可能な修正PRを用意するためのGitHub Actionです。
無料Actionはリポジトリ内で、終了予定のAIモデル名・終了するAPI・該当ファイル・公式根拠・実行時の確認が必要な箇所を表示します。
修正が必要な場合は、限定ベータで公式根拠、変更差分、置き換え漏れの検査、既存CIの結果を添えた**確認待ちの修正PR**を作成します。

動的な環境変数、リモート設定、計算で組み立てたモデル名は「影響なし」と断定しません。
実行時の確認が必要な箇所として残します。
公式の後継モデルでも、品質・料金・待ち時間・トークン上限・対応パラメータの互換性は保証しません。

## 日本語: 最短導入

次の内容を `.github/workflows/model-lifecycle.yml` として保存し、通常のプルリクエストまたはpushで実行します。
最初は `fail-on: never` のまま、検出結果だけを確認してください。
レビュー済み公開版 `v0.2.0` はOpenAI、Anthropic、Google Geminiが対象です。
このソースの `v0.3.0` 候補ではCohereとxAIの公式ライフサイクル情報も追加していますが、公開リリース前のため、利用時は下の固定SHAを変更しないでください。

実行後はGitHub ActionsのJob Summary、`.sunsetpr/report.json`、`.sunsetpr/summary.md` に、終了日・影響箇所・公式URL・次の判断を出力します。
無料Actionは `contents: read` だけを要求し、リポジトリのコードをSunsetPRや外部AIへ送信しません。
自動マージや本番公開は行いません。

## Start in one minute

Create `.github/workflows/model-lifecycle.yml`:

```yaml
name: AI model lifecycle

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 3 * * 1"

permissions:
  contents: read

jobs:
  sunsetpr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
      - uses: synergia-yoshi/sunsetpr-action@074b4e2aad0678075acad14d5e043e0ca788e77b # v0.2.0
        with:
          fail-on: never
```

The first run adds line annotations and a structured table to the GitHub Actions Job Summary. A machine-readable report is written to `.sunsetpr/report.json`, and a shareable migration decision is written to `.sunsetpr/summary.md`.

## What it detects

- TypeScript, JavaScript, and Python
- hardcoded model IDs in major official SDK call shapes
- single-use `const` model IDs passed to a supported SDK call
- model IDs assigned to model-named variables
- `.env`, JSON, YAML, TOML, INI, and CFG model settings
- OpenAI Assistants API calls before the 2026-08-26 shutdown
- OpenAI Videos API calls before the 2026-09-24 shutdown, with no replacement invented
- OpenAI reusable prompt objects and Evals API calls before the 2026-11-30 shutdown
- Anthropic sampling parameters that an official successor rejects
- legacy Gemini Python `GenerativeModel("…")` call shapes
- OpenAI, Anthropic, Google Gemini, Cohere, and xAI entries verified against official provider documentation
- unresolved SDK arguments that require runtime confirmation

The bundled database currently contains 124 exact model IDs and aliases plus 4 API surfaces,
checked on 2026-08-14. Provider documentation is the only source of truth.

[Browse model shutdown dates](MODEL-LIFECYCLE.md), inspect the
[API deprecation evaluation](API-DEPRECATION-EVALUATION.md), or consume the canonical
[`data/lifecycle.json`](data/lifecycle.json).

The same official-source data also powers
[124 model shutdown pages](https://synergia-yoshi.github.io/sunsetpr-action/models/) and
[4 API shutdown pages](https://synergia-yoshi.github.io/sunsetpr-action/apis/) on GitHub Pages.
The pages are generated and count-checked in public CI; they do not add tracking or another source.

The maintainer workflow fetches only the five configured provider-owned pages each week. It verifies that every current ID, shutdown date, and replacement remains represented and compares semantic model/date fingerprints. Drift opens one refreshable GitHub issue; it never rewrites lifecycle data without an official-source review.

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Repository directory to scan |
| `fail-on` | `never` | `never` annotates without failing; opt into `deprecated` or `retired` after the first scan |
| `report` | `.sunsetpr/report.json` | JSON report output path |
| `summary` | `.sunsetpr/summary.md` | Shareable Markdown decision report |

## Outputs

| Output | Meaning |
| --- | --- |
| `findings` | Deprecated or retired model references |
| `api-deprecations` | Deprecated API call sites |
| `runtime-checks` | Dynamic values that static analysis could not resolve |
| `migration-risks` | Officially documented provider migration risks |
| `retired` | References to models already shut down |
| `deprecated` | References to models with an announced shutdown |
| `safe-auto-fixes` | Findings with both high-confidence code context and official replacement |
| `decision` | `clear`, `repair_ready`, `review_required`, or `urgent` |
| `nearest-shutdown` | Nearest affected shutdown date, when present |
| `report` | Absolute path to the JSON report |
| `summary` | Absolute path to the Markdown decision report |

## Security and privacy

- The Action requests only `contents: read`.
- Analysis runs entirely inside your GitHub Actions runner.
- It makes no network request and sends no repository code to SunsetPR or an AI model.
- It never prints arbitrary file contents or environment-variable values.
- Symlinks and common generated, dependency, VCS, and virtual-environment directories are skipped.
- Individual files over 2 MiB are reported as limitations; the scan is bounded to 25,000 supported files and 100 MiB.
- Automatic merge and deployment are not part of this Action.
- Repository build, Pages, artifact, and CodeQL workflow dependencies are pinned to full commit SHAs.

The checked-in bundle is built from the checked-in TypeScript source. See [DATA-HANDLING.md](DATA-HANDLING.md) and [SECURITY.md](SECURITY.md).

## Honest limits

Static analysis cannot prove the deployed value of an environment variable, a database lookup, a remote feature flag, or an arbitrary computed expression. These cases are surfaced as “runtime confirmation required.”

An official replacement can still differ in behavior, quality, latency, price, token limits, or supported parameters. The free Action does not edit code. Detection confidence is separate from replacement confidence; both must be high before the repair product considers a finding eligible for a deterministic edit. Preview or ambiguous successors are not considered safe automatic fixes.

The repository includes 268 labeled positive and 268 labeled negative synthetic cases and currently measures 100% recall and 0% false-positive rate. It is a reproducible regression suite, not a claim about all real repositories.

```bash
npm ci
npm run benchmark:check
npm run benchmark
```

`benchmark:check` also proves that the generated cases still cover every lifecycle-database row. The same commands run in the public Linux CI.

See [BENCHMARK.md](BENCHMARK.md) for the corpus construction, thresholds, exact current confusion matrix, and limits.

The API detector also has a separately labeled positive engineering sample: 4 licensed public
repositories at fixed commits, 8 files, and 56 Assistants API call sites. All 56 are detected. This
is a real-source regression gate, not a prevalence, recall, or false-positive estimate.

```bash
npm run evaluate:api-deprecations
```

See [API-DEPRECATION-EVALUATION.md](API-DEPRECATION-EVALUATION.md) for fixed commits, licenses,
method, and limits.

## Evidence-backed repair beta

The paid product is being validated separately. It proposes a draft pull request with conservative code changes, location-scoped migration invariants, official evidence, and customer-CI results. The invariants do not prove live model behavior. It never auto-merges. If CI fails or the successor is ambiguous, the result remains a draft or report.

[Request repair beta access privately by email](mailto:katsumi@synergia-hub.com?subject=SunsetPR%20Repair%20beta%20request&body=Please%20do%20not%20include%20source%20code%2C%20secrets%2C%20or%20environment%20values.%0A%0AProviders%3A%0ALanguages%3A%0ARepository%20count%3A%0APublic%20or%20private%3A)

The [GitHub beta request form](https://github.com/synergia-yoshi/sunsetpr-action/issues/new?template=repair-beta.yml) remains available, but it creates a public issue. Do not include source code, secrets, environment values, customer names, or private repository URLs in either request.

Pricing is under design-partner validation and is not an active purchase offer.

## Supported runner

The `v0` release is packaged and tested for GitHub-hosted `ubuntu-latest` runners on x64. Other runner operating systems and architectures are not yet supported.

## Versioning

The installation snippet pins the current reviewed `v0.2.0` Linux runtime by full commit SHA. The `v0.3.0` source remains a release candidate until Linux packaging and self-tests pass. Review release
notes and public CI before updating both the SHA and its version comment. The immutable `@v0.2.0`
tag is available for readability; use floating `@v0` only when automatic compatible-beta updates are
an intentional tradeoff.

Apache-2.0. SunsetPR is independent of OpenAI, Anthropic, Google, Cohere, xAI, and GitHub.
