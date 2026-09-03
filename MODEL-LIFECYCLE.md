# AI model shutdown dates and official replacements

Machine-readable lifecycle data for 129 exact model IDs and aliases, checked against provider documentation on 2026-09-01.

Provider documentation is the only source of truth. A listed replacement can still differ in behavior, quality, latency, price, limits, or supported parameters. `medium` and `low` replacement confidence are report-only by default.

Use the [free SunsetPR GitHub Action](README.md#start-in-one-minute) to find these IDs at exact files and lines. The canonical machine-readable source is [`data/lifecycle.json`](data/lifecycle.json).

## OpenAI

| Model ID | Status | Shutdown date | Official replacement | Confidence | Primary source |
| --- | --- | --- | --- | --- | --- |
| `gpt-4.5-preview` | retired | 2025-07-14 | `gpt-4.1` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `computer-use-preview` | retired | 2026-07-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `computer-use-preview-2025-03-11` | retired | 2026-07-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-mini-search-preview-2025-03-11` | retired | 2026-07-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-search-preview-2025-03-11` | retired | 2026-07-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5-chat-latest` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5-codex` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.1-chat-latest` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.1-codex` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.1-codex-max` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.1-codex-mini` | retired | 2026-07-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.2-codex` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-audio-mini-2025-10-06` | retired | 2026-07-23 | `gpt-audio-1.5` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-realtime-mini-2025-10-06` | retired | 2026-07-23 | `gpt-realtime-2.1-mini` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o3-deep-research` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o3-deep-research-2025-06-26` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o4-mini-deep-research` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o4-mini-deep-research-2025-06-26` | retired | 2026-07-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.2-chat-latest` | retired | 2026-08-10 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5.3-chat-latest` | retired | 2026-08-10 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `babbage-002` | deprecated | 2026-09-28 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `davinci-002` | deprecated | 2026-09-28 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-3.5-turbo-1106` | deprecated | 2026-09-28 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-3.5-turbo-instruct` | deprecated | 2026-09-28 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-3.5-turbo` | deprecated | 2026-10-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-3.5-turbo-0125` | deprecated | 2026-10-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-3.5-turbo-completions` | deprecated | 2026-10-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-0613` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-0613-completions` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-1106-preview` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-completions` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-turbo` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-turbo-2024-04-09` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4-turbo-completions` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4.1-nano` | deprecated | 2026-10-23 | `gpt-5.6-luna` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4.1-nano-2025-04-14` | deprecated | 2026-10-23 | `gpt-5.6-luna` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-2024-05-13` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-image-1` | deprecated | 2026-10-23 | `gpt-image-2` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o1` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o1-2024-12-17` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o1-pro` | deprecated | 2026-10-23 | `gpt-5.6-sol` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o1-pro-2025-03-19` | deprecated | 2026-10-23 | `gpt-5.6-sol` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o3-mini` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o3-mini-2025-01-31` | deprecated | 2026-10-23 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o4-mini` | deprecated | 2026-10-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o4-mini-2025-04-16` | deprecated | 2026-10-23 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `chatgpt-image-latest` | deprecated | 2026-12-01 | `gpt-image-2` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-image-1-mini` | deprecated | 2026-12-01 | `gpt-image-2` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-image-1.5` | deprecated | 2026-12-01 | `gpt-image-2` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5-2025-08-07` | deprecated | 2026-12-11 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5-mini-2025-08-07` | deprecated | 2026-12-11 | `gpt-5.6-terra` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5-nano-2025-08-07` | deprecated | 2026-12-11 | `gpt-5.6-luna` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-5-pro-2025-10-06` | deprecated | 2026-12-11 | `gpt-5.6-sol` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o3-2025-04-16` | deprecated | 2026-12-11 | `gpt-5.6-sol` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `o3-pro-2025-06-10` | deprecated | 2026-12-11 | `gpt-5.6-sol` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-audio` | deprecated | 2027-01-20 | `gpt-audio-1.5` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-mini-audio` | deprecated | 2027-01-20 | `gpt-audio-1.5` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-mini-realtime` | deprecated | 2027-01-20 | `gpt-realtime-2.1-mini` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-mini-transcribe-2025-03-20` | deprecated | 2027-01-20 | `gpt-4o-mini-transcribe-2025-12-15` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-realtime` | deprecated | 2027-01-20 | `gpt-realtime-2.1` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-audio` | deprecated | 2027-01-20 | `gpt-audio-1.5` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-audio-mini` | deprecated | 2027-01-20 | `gpt-audio-1.5` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-realtime` | deprecated | 2027-01-20 | `gpt-realtime-2.1` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-realtime-mini` | deprecated | 2027-01-20 | `gpt-realtime-2.1-mini` | high | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-mini-transcribe` | deprecated | 2027-02-26 | `gpt-transcribe` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-transcribe` | deprecated | 2027-02-26 | `gpt-transcribe` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `gpt-4o-transcribe-diarize` | deprecated | 2027-02-26 | `gpt-transcribe` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |
| `whisper-1` | deprecated | 2027-02-26 | `gpt-transcribe` | medium | [Official documentation](https://developers.openai.com/api/docs/deprecations) |

## Anthropic

| Model ID | Status | Shutdown date | Official replacement | Confidence | Primary source |
| --- | --- | --- | --- | --- | --- |
| `claude-2.0` | retired | 2025-07-21 | `claude-opus-4-8` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-2.1` | retired | 2025-07-21 | `claude-opus-4-8` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-sonnet-20240229` | retired | 2025-07-21 | `claude-sonnet-4-6` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-5-sonnet-20240620` | retired | 2025-10-28 | `claude-sonnet-4-6` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-5-sonnet-20241022` | retired | 2025-10-28 | `claude-sonnet-4-6` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-opus-20240229` | retired | 2026-01-05 | `claude-opus-4-8` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-5-haiku-20241022` | retired | 2026-02-19 | `claude-haiku-4-5-20251001` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-7-sonnet-20250219` | retired | 2026-02-19 | `claude-sonnet-4-6` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-3-haiku-20240307` | retired | 2026-04-20 | `claude-haiku-4-5-20251001` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-opus-4-20250514` | retired | 2026-06-15 | `claude-opus-4-8` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-sonnet-4-20250514` | retired | 2026-06-15 | `claude-sonnet-4-6` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-opus-4-1-20250805` | retired | 2026-08-05 | `claude-opus-4-8` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |
| `claude-mythos-preview` | deprecated | Not announced | `claude-mythos-5` | high | [Official documentation](https://platform.claude.com/docs/en/about-claude/model-deprecations) |

## Google Gemini

| Model ID | Status | Shutdown date | Official replacement | Confidence | Primary source |
| --- | --- | --- | --- | --- | --- |
| `embedding-001` | retired | 2025-10-30 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `embedding-gecko-001` | retired | 2025-10-30 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-embedding-exp` | retired | 2025-10-30 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-embedding-exp-03-07` | retired | 2025-10-30 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-preview-image-generation` | retired | 2025-11-14 | `gemini-2.5-flash-image` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-flash-preview-05-20` | retired | 2025-11-18 | `gemini-3.6-flash` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-pro-preview-03-25` | retired | 2025-12-02 | `gemini-3.1-pro-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-pro-preview-05-06` | retired | 2025-12-02 | `gemini-3.1-pro-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-pro-preview-06-05` | retired | 2025-12-02 | `gemini-3.1-pro-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-lite-preview` | retired | 2025-12-09 | `gemini-3.1-flash-lite` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-lite-preview-02-05` | retired | 2025-12-09 | `gemini-3.1-flash-lite` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-live-001` | retired | 2025-12-09 | `gemini-3.1-flash-live-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-live-2.5-flash-preview` | retired | 2025-12-09 | `gemini-3.1-flash-live-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `text-embedding-004` | retired | 2026-01-14 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-flash-image-preview` | retired | 2026-01-15 | `gemini-3.1-flash-image` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-flash-preview-09-25` | retired | 2026-02-17 | `gemini-3.6-flash` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-3-pro-preview` | retired | 2026-03-09 | `gemini-3.1-pro-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-flash-lite-preview-09-2025` | retired | 2026-03-31 | `gemini-3.1-flash-lite` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-robotics-er-1.5-preview` | retired | 2026-04-30 | `gemini-robotics-er-1.6-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-3.1-flash-lite-preview` | retired | 2026-05-25 | `gemini-3.1-flash-lite` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash` | retired | 2026-06-01 | `gemini-3.6-flash` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-001` | retired | 2026-06-01 | `gemini-3.6-flash` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-lite` | retired | 2026-06-01 | `gemini-3.1-flash-lite` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.0-flash-lite-001` | retired | 2026-06-01 | `gemini-3.1-flash-lite` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-3-pro-image-preview` | retired | 2026-06-25 | `gemini-3-pro-image` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-3.1-flash-image-preview` | retired | 2026-06-25 | `gemini-3.1-flash-image` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `embedding-2-preview` | retired | 2026-08-10 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `imagen-4.0-fast-generate-001` | retired | 2026-08-17 | `gemini-3.1-flash-image` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `imagen-4.0-generate-001` | retired | 2026-08-17 | `gemini-3.1-flash-image` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `imagen-4.0-ultra-generate-001` | retired | 2026-08-17 | `gemini-3.1-flash-image` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-omni-flash-preview` | deprecated | 2026-09-30 | `gemini-omni-1.1-flash` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-2.5-flash-image` | deprecated | 2026-10-02 | `gemini-3.1-flash-image-preview` | medium | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-3.1-flash-lite` | deprecated | 2027-05-07 | `gemini-3.5-flash-lite` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |
| `gemini-embedding-001` | deprecated | 2028-05-14 | `gemini-embedding-2` | high | [Official documentation](https://ai.google.dev/gemini-api/docs/deprecations) |

## Cohere

| Model ID | Status | Shutdown date | Official replacement | Confidence | Primary source |
| --- | --- | --- | --- | --- | --- |
| `c4ai-aya-expanse-8b` | retired | 2026-04-04 | `command-a-03-2025` | medium | [Official documentation](https://docs.cohere.com/docs/deprecations) |
| `c4ai-aya-vision-8b` | retired | 2026-04-04 | `command-a-03-2025` | medium | [Official documentation](https://docs.cohere.com/docs/deprecations) |
| `embed-english-light-v2.0` | retired | 2026-04-04 | `embed-v4.0` | medium | [Official documentation](https://docs.cohere.com/docs/deprecations) |
| `embed-english-v2.0` | retired | 2026-04-04 | `embed-v4.0` | medium | [Official documentation](https://docs.cohere.com/docs/deprecations) |
| `embed-multilingual-v2.0` | retired | 2026-04-04 | `embed-v4.0` | medium | [Official documentation](https://docs.cohere.com/docs/deprecations) |

## xAI

| Model ID | Status | Shutdown date | Official replacement | Confidence | Primary source |
| --- | --- | --- | --- | --- | --- |
| `grok-3` | retired | 2026-05-15 | `grok-4.3` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-4-0709` | retired | 2026-05-15 | `grok-4.3` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-4-1-fast-non-reasoning` | retired | 2026-05-15 | `grok-4.3` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-4-1-fast-reasoning` | retired | 2026-05-15 | `grok-4.3` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-4-fast-non-reasoning` | retired | 2026-05-15 | `grok-4.3` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-4-fast-reasoning` | retired | 2026-05-15 | `grok-4.3` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-code-fast-1` | retired | 2026-05-15 | `grok-build-0.1` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |
| `grok-imagine-image-pro` | retired | 2026-05-15 | `grok-imagine-image-quality` | medium | [Official documentation](https://docs.x.ai/developers/migration/may-15-retirement) |

## Data boundaries

- `deprecated` means the provider has announced deprecation; a shutdown date can still be unannounced.
- `retired` means the published shutdown date has passed.
- A dynamic value that static analysis cannot resolve is never classified as unaffected; SunsetPR reports `runtime confirmation required`.
- SunsetPR is independent of OpenAI, Anthropic, Google, Cohere, xAI, and GitHub.
