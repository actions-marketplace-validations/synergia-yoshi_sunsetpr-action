# Detection benchmark

The benchmark is a versioned regression suite for the declared MVP scope. It is not an estimate of performance across all real repositories.

## Current corpus

| Label | Count | Composition |
| --- | ---: | --- |
| Positive | 242 | 20 hand-designed SDK/config cases plus every one of the 111 lifecycle IDs in one TypeScript and one Python model-variable context |
| Negative | 242 | 20 hand-designed non-model cases plus every lifecycle ID in one TypeScript documentation context and one Python display-label context |

The manifest records the expected file, line, and model ID for every positive. A detection must match all three. Findings in any labeled negative file count as false positives, and unlisted findings fail the suite.

## Thresholds

- recall: at least 95%
- false-positive rate: below 5%
- unexpected unlabelled findings: zero

Current checked-in result:

- true positives 242
- false negatives 0
- false positives 0
- true negatives 242
- recall 100%
- false-positive rate 0%

## Reproduce

```bash
npm ci
npm run benchmark:check
npm run benchmark
```

`benchmark:check` rebuilds the expected generated content in memory and fails if the fixture no longer covers the complete lifecycle database. The public Linux workflow runs the same checks on every push and pull request.

## What this does not prove

- performance on arbitrary production repositories
- runtime-resolved environment variables, remote configuration, wrappers, or computed model IDs
- semantic output quality, latency, price, rate limits, token limits, or parameter compatibility after migration
- languages, providers, SDK shapes, or runner platforms outside the published support scope

Real-repository evaluation must be reported separately from this synthetic corpus. SunsetPR does not combine the public demo result with these 484 labels to inflate a success rate.

API-surface detection uses a separate fixed-commit positive sample. See
[API-DEPRECATION-EVALUATION.md](API-DEPRECATION-EVALUATION.md); its 56 call sites are not added to
this model-ID confusion matrix.
