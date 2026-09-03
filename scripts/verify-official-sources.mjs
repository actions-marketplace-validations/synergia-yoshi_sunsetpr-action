import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const databaseUrl = new URL("../data/lifecycle.json", import.meta.url);
const baselineUrl = new URL("../data/official-source-fingerprints.json", import.meta.url);
const reportUrl = new URL("../.sunsetpr/official-source-check.md", import.meta.url);
const writeBaseline = process.argv.includes("--write-baseline");
const maximumResponseBytes = 2 * 1024 * 1024;
const apiSourceTerms = {
  "reusable-prompts-api": ["reusable prompt objects", "/v1/prompts"],
  "evals-api": ["evals dashboard and api"],
};

const sources = {
  openai: {
    url: "https://developers.openai.com/api/docs/deprecations",
    fetchUrl: "https://developers.openai.com/api/docs/deprecations.md",
    hostname: "developers.openai.com",
    pathPrefix: "/api/docs/deprecations",
    acceptedContentTypes: ["text/markdown"],
    tokenPattern:
      /\b(?:babbage|chatgpt|codex|computer-use|dall-e|davinci|gpt|o[1-9]|omni-moderation|text-embedding|text-moderation|tts|whisper)[a-z0-9._-]{1,80}\b/g,
  },
  anthropic: {
    url: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
    fetchUrl: "https://platform.claude.com/docs/en/about-claude/model-deprecations.md",
    hostname: "platform.claude.com",
    pathPrefix: "/docs/en/about-claude/model-deprecations",
    acceptedContentTypes: ["text/markdown"],
    tokenPattern: /\bclaude-[a-z0-9._-]{2,80}\b/g,
  },
  gemini: {
    url: "https://ai.google.dev/gemini-api/docs/deprecations",
    hostname: "ai.google.dev",
    pathPrefix: "/gemini-api/docs/deprecations",
    acceptedContentTypes: ["text/html"],
    languageQuery: "en",
    tokenPattern: /\bgemini-[a-z0-9._-]{2,80}\b/g,
  },
  cohere: {
    url: "https://docs.cohere.com/docs/deprecations",
    hostname: "docs.cohere.com",
    pathPrefix: "/docs/deprecations",
    acceptedContentTypes: ["text/html"],
    tokenPattern: /\b(?:c4ai-aya|command|embed)[a-z0-9._-]{1,80}\b/g,
  },
  xai: {
    url: "https://docs.x.ai/developers/migration/may-15-retirement",
    hostname: "docs.x.ai",
    pathPrefix: "/developers/migration/may-15-retirement",
    acceptedContentTypes: ["text/html"],
    tokenPattern: /\bgrok-[a-z0-9._-]{1,80}\b/g,
  },
};

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function fingerprint(html, tokenPattern) {
  const lowerCase = html.toLowerCase();
  const modelTokens = sortedUnique(lowerCase.match(tokenPattern) ?? []);
  const isoDates = lowerCase.match(/\b20\d{2}-\d{2}-\d{2}\b/g) ?? [];
  const writtenDates =
    lowerCase.match(
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},\s+20\d{2}\b/g,
    ) ?? [];
  const normalizedWrittenDates = writtenDates
    .map((value) => value.replace(/(\d{1,2})(?:st|nd|rd|th),/i, "$1,"))
    .map((value) => new Date(`${value} UTC`))
    .filter((value) => !Number.isNaN(value.getTime()))
    .map((value) => value.toISOString().slice(0, 10));
  const dates = sortedUnique([...isoDates, ...normalizedWrittenDates]);
  const digest = createHash("sha256")
    .update(JSON.stringify({ modelTokens, dates }))
    .digest("hex");
  return { digest, modelTokens, dates };
}

function sourceRepresentsDate(html, isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const formats = [
    isoDate,
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(date),
  ];
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";
  formats.push(
    new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
      .format(date)
      .replace(/\s+20\d{2}$/, ` ${day}${suffix}, ${year}`),
  );
  const lowerCaseHtml = html.toLowerCase();
  return formats.some((value) => lowerCaseHtml.includes(value.toLowerCase()));
}

function differences(current, previous) {
  const previousValues = new Set(previous);
  const currentValues = new Set(current);
  return {
    added: current.filter((value) => !previousValues.has(value)),
    removed: previous.filter((value) => !currentValues.has(value)),
  };
}

async function fetchOfficialSource(provider, definition) {
  const requestedUrl = new URL(definition.fetchUrl ?? definition.url);
  if (definition.languageQuery) {
    requestedUrl.searchParams.set("hl", definition.languageQuery);
  }
  const response = await fetch(requestedUrl, {
    cache: "no-store",
    headers: {
      Accept: definition.acceptedContentTypes.join(", "),
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "SunsetPR-official-source-monitor/0.1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const finalUrl = new URL(response.url);
  if (
    !response.ok ||
    finalUrl.protocol !== "https:" ||
    finalUrl.hostname !== definition.hostname ||
    !finalUrl.pathname.startsWith(definition.pathPrefix)
  ) {
    throw new Error(
      `${provider} official source returned ${response.status} from an unexpected URL`,
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (
    !definition.acceptedContentTypes.some((acceptedType) =>
      contentType.toLowerCase().includes(acceptedType),
    )
  ) {
    throw new Error(`${provider} official source returned unexpected content type ${contentType}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maximumResponseBytes) {
    throw new Error(`${provider} official source returned ${bytes.length} bytes`);
  }
  return { html: bytes.toString("utf8"), bytes: bytes.length };
}

function bulletValues(values) {
  if (values.length === 0) {
    return "none";
  }
  return values
    .slice(0, 100)
    .map((value) => `\`${value.replaceAll("`", "")}\``)
    .join(", ");
}

const database = JSON.parse(await readFile(databaseUrl, "utf8"));
const baseline = await readFile(baselineUrl, "utf8")
  .then(JSON.parse)
  .catch(() => null);
const checkedAt = new Date().toISOString();
const currentBaseline = {
  schemaVersion: 1,
  generatedAt: checkedAt,
  providers: {},
};
const report = [
  "# SunsetPR official lifecycle source check",
  "",
  `Checked: ${checkedAt}`,
  "",
  "This monitor fetches only the five configured provider-owned lifecycle pages. It compares model-like tokens and ISO dates with a committed semantic baseline, and verifies that every current database entry remains represented.",
  "",
];
let failed = false;

for (const [provider, definition] of Object.entries(sources)) {
  try {
    const source = await fetchOfficialSource(provider, definition);
    const signals = fingerprint(source.html, definition.tokenPattern);
    const entries = database.entries.filter((entry) => entry.provider === provider);
    const apiEntries = (database.apiDeprecations ?? []).filter(
      (entry) => entry.provider === provider,
    );
    const missingModels = entries
      .filter((entry) => !source.html.includes(entry.modelId))
      .map((entry) => entry.modelId);
    const missingDates = entries
      .filter(
        (entry) =>
          entry.shutdownDate !== null && !sourceRepresentsDate(source.html, entry.shutdownDate),
      )
      .map((entry) => `${entry.modelId}: ${entry.shutdownDate}`);
    const missingReplacements = entries
      .filter((entry) => !source.html.includes(entry.replacement))
      .map((entry) => `${entry.modelId}: ${entry.replacement}`);
    const lowerCaseSource = source.html.toLowerCase();
    const missingApiNames = apiEntries
      .filter((entry) => {
        const terms = apiSourceTerms[entry.apiId] ?? [entry.apiName];
        return !terms.some((term) => lowerCaseSource.includes(term.toLowerCase()));
      })
      .map((entry) => entry.apiName);
    const missingApiDates = apiEntries
      .filter((entry) => !sourceRepresentsDate(source.html, entry.shutdownDate))
      .map((entry) => `${entry.apiName}: ${entry.shutdownDate}`);
    const missingApiReplacements = apiEntries
      .filter(
        (entry) =>
          entry.replacement && !lowerCaseSource.includes(entry.replacement.toLowerCase()),
      )
      .map((entry) => `${entry.apiName}: ${entry.replacement}`);
    const previous = baseline?.providers?.[provider];
    const tokenDrift = differences(signals.modelTokens, previous?.modelTokens ?? []);
    const dateDrift = differences(signals.dates, previous?.dates ?? []);
    const baselineDrift =
      previous !== undefined &&
      (tokenDrift.added.length > 0 ||
        tokenDrift.removed.length > 0 ||
        dateDrift.added.length > 0 ||
        dateDrift.removed.length > 0);
    const coverageFailure =
      missingModels.length > 0 ||
      missingDates.length > 0 ||
      missingReplacements.length > 0 ||
      missingApiNames.length > 0 ||
      missingApiDates.length > 0 ||
      missingApiReplacements.length > 0;
    if ((!writeBaseline && (!previous || baselineDrift)) || coverageFailure) {
      failed = true;
    }

    currentBaseline.providers[provider] = {
      sourceUrl: definition.url,
      digest: signals.digest,
      modelTokens: signals.modelTokens,
      dates: signals.dates,
    };
    report.push(
      `## ${provider}`,
      "",
      `- HTTP body: ${source.bytes} bytes`,
      `- Database entries represented: ${entries.length - missingModels.length}/${entries.length}`,
      `- API entries represented: ${apiEntries.length - missingApiNames.length}/${apiEntries.length}`,
      `- Semantic signals: ${signals.modelTokens.length} model-like tokens, ${signals.dates.length} ISO dates`,
      `- Baseline: ${previous ? (baselineDrift ? "changed — review required" : "unchanged") : "missing — generate and review"}`,
      `- Missing model IDs: ${bulletValues(missingModels)}`,
      `- Missing shutdown dates: ${bulletValues(missingDates)}`,
      `- Missing replacements: ${bulletValues(missingReplacements)}`,
      `- Missing API names: ${bulletValues(missingApiNames)}`,
      `- Missing API shutdown dates: ${bulletValues(missingApiDates)}`,
      `- Missing API replacements: ${bulletValues(missingApiReplacements)}`,
      `- Added model-like tokens: ${bulletValues(tokenDrift.added)}`,
      `- Removed model-like tokens: ${bulletValues(tokenDrift.removed)}`,
      `- Added dates: ${bulletValues(dateDrift.added)}`,
      `- Removed dates: ${bulletValues(dateDrift.removed)}`,
      "",
    );
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    report.push(`## ${provider}`, "", `- Fetch/validation error: ${message}`, "");
  }
}

report.push(
  "## Interpretation",
  "",
  "- A passing result proves that the committed data is still represented by the configured official pages and that the monitored semantic signals did not change.",
  "- It does not prove that every new deprecation was parsed correctly. Any drift requires review against the official page before changing lifecycle data.",
  "- Third-party feeds are not fetched and are never accepted as evidence.",
  "",
);

await mkdir(new URL("../.sunsetpr/", import.meta.url), { recursive: true });
await writeFile(reportUrl, `${report.join("\n")}`, "utf8");

if (writeBaseline && !failed) {
  await writeFile(baselineUrl, `${JSON.stringify(currentBaseline, null, 2)}\n`, "utf8");
  console.log("Wrote official source semantic baseline.");
} else if (writeBaseline) {
  console.error("Refusing to write a baseline because source validation failed.");
  process.exitCode = 1;
} else if (failed) {
  console.error("Official source verification found drift or incomplete coverage.");
  process.exitCode = 1;
} else {
  console.log("Official source semantic baseline and database coverage are current.");
}
