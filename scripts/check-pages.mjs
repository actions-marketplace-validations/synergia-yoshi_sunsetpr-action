import { access, readFile } from "node:fs/promises";
import path from "node:path";

const database = JSON.parse(await readFile("data/lifecycle.json", "utf8"));
const manifest = JSON.parse(await readFile("_site/pages-manifest.json", "utf8"));
const googleSiteVerification = "g3p4aBhy-QisDBolUrs_oDS-nZnFvnbovM47ibKSaK8";
const expectedUrls = database.entries.length + database.apiDeprecations.length + 3;
if (
  manifest.entries !== database.entries.length ||
  manifest.apiEntries !== database.apiDeprecations.length ||
  manifest.urls !== expectedUrls
) {
  throw new Error("GitHub Pages manifest does not match lifecycle database");
}

const sitemap = await readFile("_site/sitemap.xml", "utf8");
const locations = sitemap.match(/<loc>/gu) ?? [];
if (locations.length !== expectedUrls) {
  throw new Error(`Expected ${expectedUrls} sitemap URLs; received ${locations.length}`);
}

const home = await readFile("_site/index.html", "utf8");
if (
  !home.includes(
    `<meta name="google-site-verification" content="${googleSiteVerification}">`,
  )
) {
  throw new Error("Homepage is missing Google Search Console verification metadata");
}

for (const entry of database.apiDeprecations) {
  const file = path.join(
    "_site/apis/openai",
    encodeURIComponent(entry.apiId),
    "index.html",
  );
  await access(file);
  const page = await readFile(file, "utf8");
  const expected = [
    entry.apiName,
    entry.shutdownDate,
    entry.replacement ?? "No official replacement listed",
    entry.sourceUrl,
  ];
  for (const value of expected) {
    if (!page.includes(value.replaceAll("&", "&amp;"))) {
      throw new Error(`${file} does not contain expected API lifecycle evidence`);
    }
  }
  if (!page.includes("Report only") || !page.includes("application/ld+json")) {
    throw new Error(`${file} is missing its safety boundary or structured evidence`);
  }
}

for (const entry of database.entries) {
  const file = path.join("_site/models", encodeURIComponent(entry.modelId), "index.html");
  await access(file);
  const page = await readFile(file, "utf8");
  for (const expected of [
    entry.modelId,
    entry.shutdownDate ?? "Not announced",
    entry.replacement,
    entry.sourceUrl,
  ]) {
    if (!page.includes(expected.replaceAll("&", "&amp;"))) {
      throw new Error(`${file} does not contain expected lifecycle evidence`);
    }
  }
  if (!page.includes("application/ld+json") || !page.includes("never auto-merge")) {
    throw new Error(`${file} is missing structured evidence or safety copy`);
  }
  if (
    !page.includes('property="og:image"') ||
    !page.includes('name="twitter:card" content="summary_large_image"')
  ) {
    throw new Error(`${file} is missing social-preview metadata`);
  }
}

const catalog = await readFile("_site/models/index.html", "utf8");
if (!catalog.includes(`Exact IDs, shutdown dates`) || !catalog.includes(`${database.entries.length}`)) {
  throw new Error("Lifecycle catalog is missing its declared scope");
}
await access("_site/lifecycle.json");
await access("_site/apis/index.html");
await access("_site/robots.txt");
await access("_site/assets/og.png");

process.stdout.write(
  `Verified ${database.entries.length} model pages, ${database.apiDeprecations.length} API pages, and ${locations.length} sitemap URLs.\n`,
);
