import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve("_site");
const baseUrl = "https://synergia-yoshi.github.io/sunsetpr-action";
const actionUrl = "https://github.com/synergia-yoshi/sunsetpr-action";
const demoPrUrl = "https://github.com/synergia-yoshi/sunsetpr-demo/pull/2";
const socialImageUrl = `${baseUrl}/assets/og.png`;
const googleSiteVerification = "g3p4aBhy-QisDBolUrs_oDS-nZnFvnbovM47ibKSaK8";
const privateBetaUrl =
  "mailto:katsumi@synergia-hub.com?subject=SunsetPR%20Repair%20beta%20request&body=Please%20do%20not%20include%20source%20code%2C%20secrets%2C%20or%20environment%20values.%0A%0AProviders%3A%0ALanguages%3A%0ARepository%20count%3A%0APublic%20or%20private%3A";
const database = JSON.parse(await readFile("data/lifecycle.json", "utf8"));
const benchmarkCasesPerLabel = database.entries.length * 2 + 20;
const benchmarkCasesTotal = benchmarkCasesPerLabel * 2;
const providerLabels = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  cohere: "Cohere",
  xai: "xAI",
};

function html(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function modelPath(modelId) {
  return `models/${encodeURIComponent(modelId)}/`;
}

function apiPath(apiId) {
  return `apis/openai/${encodeURIComponent(apiId)}/`;
}

function shell({ title, description, canonical, body, relativeRoot = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="google-site-verification" content="${googleSiteVerification}">
  <title>${html(title)}</title>
  <meta name="description" content="${html(description)}">
  <link rel="canonical" href="${html(canonical)}">
  <link rel="icon" href="${relativeRoot}assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${relativeRoot}assets/site.css">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${html(title)}">
  <meta property="og:description" content="${html(description)}">
  <meta property="og:url" content="${html(canonical)}">
  <meta property="og:image" content="${socialImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="SunsetPR turns AI model deprecation evidence into review-ready draft PRs">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${html(title)}">
  <meta name="twitter:description" content="${html(description)}">
  <meta name="twitter:image" content="${socialImageUrl}">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="${relativeRoot}"><span>S/</span> SunsetPR</a>
    <nav aria-label="Primary">
      <a href="${relativeRoot}models/">Models</a>
      <a href="${relativeRoot}apis/">APIs</a>
      <a href="${actionUrl}">GitHub Action ↗</a>
      <a href="${demoPrUrl}">Real draft PR ↗</a>
    </nav>
  </header>
  <main>${body}</main>
  <footer>
    <strong>SunsetPR</strong>
    <span>Official lifecycle evidence → review-ready draft PRs.</span>
    <a href="${actionUrl}/blob/main/DATA-HANDLING.md">Data handling</a>
    <a href="${actionUrl}/blob/main/SECURITY.md">Security</a>
  </footer>
</body>
</html>
`;
}

const css = `:root{--ink:#241b18;--muted:#766d68;--paper:#f4f0e8;--card:#fffdf8;--line:#d9d1c6;--sun:#df552d;--night:#152126;--lime:#b9dc72;color-scheme:light}*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;scroll-behavior:smooth}body{margin:0}a{color:inherit;text-decoration:none}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid var(--sun);outline-offset:3px}.site-header{align-items:center;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;margin:auto;max-width:1180px;padding:20px 24px}.brand{font-size:15px;font-weight:750;letter-spacing:-.02em}.brand span{color:var(--sun);font-family:ui-monospace,monospace}.site-header nav{display:flex;font-size:12px;gap:24px}.site-header nav a:hover{color:var(--sun)}main{margin:auto;max-width:1180px;padding:72px 24px 96px}.hero{display:grid;gap:56px;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);padding:44px 0 76px}.eyebrow,.tag{color:var(--sun);font-family:ui-monospace,monospace;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(36px,4.4vw,52px);letter-spacing:-.05em;line-height:1.08;margin:16px 0 24px;max-width:820px}h2{font-size:clamp(25px,3vw,36px);letter-spacing:-.04em;margin:0 0 16px}h3{font-size:18px;letter-spacing:-.02em}p{line-height:1.75}.lead{color:var(--muted);font-size:16px;max-width:700px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.button{align-items:center;border:1px solid var(--ink);display:inline-flex;font-size:12px;font-weight:700;justify-content:center;min-height:44px;padding:0 18px}.button.primary{background:var(--ink);color:white}.button:hover{border-color:var(--sun);color:var(--sun)}.button.primary:hover{background:var(--sun);color:white}.proof{background:var(--night);color:white;padding:28px}.proof strong{color:var(--lime);display:block;font-family:ui-monospace,monospace;font-size:28px}.proof p{color:#b6c0c3;font-size:12px;margin:8px 0 22px}.proof p:last-child{margin-bottom:0}.stats{border-bottom:1px solid var(--line);border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(4,1fr);margin:22px 0 48px}.stats div{border-right:1px solid var(--line);padding:18px}.stats div:last-child{border-right:0}.stats strong{display:block;font-family:ui-monospace,monospace;font-size:20px}.stats span{color:var(--muted);font-size:10px}.catalog-head{align-items:end;display:flex;gap:24px;justify-content:space-between;margin-bottom:28px}.search{background:var(--card);border:1px solid var(--line);font:inherit;max-width:380px;min-height:44px;padding:10px 14px;width:100%}.table{border:1px solid var(--line)}.row{align-items:center;border-bottom:1px solid var(--line);display:grid;font-size:12px;gap:16px;grid-template-columns:minmax(0,1.35fr) .55fr .75fr minmax(0,1fr);min-height:52px;padding:10px 16px}.row:last-child{border-bottom:0}.row.head{background:#ebe5da;color:var(--muted);font-family:ui-monospace,monospace;font-size:9px;text-transform:uppercase}.row[data-entry]:hover{background:var(--card);color:var(--sun)}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;overflow-wrap:anywhere}.status{font-family:ui-monospace,monospace;font-size:10px}.status.retired{color:#9d2d21}.status.deprecated{color:#a65d00}.detail{max-width:900px}.breadcrumbs{color:var(--muted);font-size:11px;margin-bottom:42px}.detail h1{font-family:ui-monospace,monospace;font-size:clamp(30px,5vw,48px);overflow-wrap:anywhere}.facts{border:1px solid var(--line);display:grid;grid-template-columns:repeat(2,1fr);margin:34px 0}.facts div{border-bottom:1px solid var(--line);padding:20px}.facts div:nth-child(odd){border-right:1px solid var(--line)}.facts div:nth-last-child(-n+2){border-bottom:0}.facts dt{color:var(--muted);font-family:ui-monospace,monospace;font-size:9px;margin-bottom:8px;text-transform:uppercase}.facts dd{font-size:14px;margin:0;overflow-wrap:anywhere}.evidence,.caution,.cta{border-top:1px solid var(--line);margin-top:42px;padding-top:30px}.evidence a{border-bottom:1px solid var(--ink);font-weight:700}.caution{color:var(--muted);font-size:12px}.cta{background:var(--night);color:white;margin-top:52px;padding:30px}.cta p{color:#b6c0c3;font-size:13px}.disclaimer{color:var(--muted);font-size:11px;margin-top:22px}footer{align-items:center;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;font-size:10px;gap:18px;margin:auto;max-width:1180px;padding:26px 24px}footer span{color:var(--muted);margin-right:auto}footer a:hover{color:var(--sun)}.empty{border:1px solid var(--line);color:var(--muted);display:none;padding:24px;text-align:center}@media(max-width:760px){.site-header nav a:nth-child(-n+2){display:none}.site-header nav{gap:12px}.hero{grid-template-columns:1fr;padding-top:20px}.stats{grid-template-columns:repeat(2,1fr)}.stats div:nth-child(2){border-right:0}.stats div:nth-child(-n+2){border-bottom:1px solid var(--line)}.catalog-head{align-items:start;flex-direction:column}.row{gap:7px;grid-template-columns:1fr;padding:14px}.row.head{display:none}.row span:before{color:var(--muted);content:attr(data-label) " · ";font-family:ui-monospace,monospace;font-size:9px}.facts{grid-template-columns:1fr}.facts div,.facts div:nth-child(odd){border-bottom:1px solid var(--line);border-right:0}.facts div:last-child{border-bottom:0}main{padding:48px 18px 72px}.site-header{padding:16px 18px}h1{font-size:34px}}`;

const catalogScript = `const input=document.querySelector("[data-search]");const rows=[...document.querySelectorAll("[data-entry]")];const empty=document.querySelector("[data-empty]");input?.addEventListener("input",()=>{const query=input.value.trim().toLowerCase();let shown=0;for(const row of rows){const visible=row.dataset.entry.includes(query);row.hidden=!visible;if(visible)shown++}empty.style.display=shown===0?"block":"none"});`;

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, "assets"), { recursive: true });
await writeFile(path.join(outputRoot, "assets/site.css"), css, "utf8");
await writeFile(path.join(outputRoot, "assets/catalog.js"), catalogScript, "utf8");
await writeFile(
  path.join(outputRoot, "assets/favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#152126"/><path d="M17 43c4 4 20 4 20-4 0-10-20-4-20-15 0-9 16-10 22-4" fill="none" stroke="#df552d" stroke-width="6" stroke-linecap="round"/><path d="m43 17-12 31" stroke="#b9dc72" stroke-width="5" stroke-linecap="round"/></svg>`,
  "utf8",
);
await copyFile("assets/og.png", path.join(outputRoot, "assets/og.png"));

const homeDescription =
  "Search OpenAI, Anthropic, Google Gemini, Cohere, and xAI model and API shutdown dates, official replacements, and primary-source evidence.";
const home = shell({
  title: "AI model shutdown dates and migration evidence — SunsetPR",
  description: homeDescription,
  canonical: `${baseUrl}/`,
  body: `<section class="hero">
  <div>
    <p class="eyebrow">Official-source AI lifecycle database</p>
    <h1>AI model and API shutdown dates, backed by official sources.</h1>
    <p class="lead">Search ${database.entries.length} exact model IDs and ${database.apiDeprecations.length} deprecated API surfaces. Then scan your repository read-only and turn eligible findings into an evidence-backed draft repair PR.</p>
    <div class="actions">
      <a class="button primary" href="${actionUrl}">Scan a repository free ↗</a>
      <a class="button" href="models/">Browse shutdown dates</a>
      <a class="button" href="apis/">Browse API shutdowns</a>
      <a class="button" href="${demoPrUrl}">Inspect the real draft PR ↗</a>
      <a class="button" href="${privateBetaUrl}">Request repair beta privately</a>
    </div>
    <p class="disclaimer">Provider documentation is the source of truth. The public Action sends no repository code to SunsetPR or an external AI model.</p>
  </div>
  <aside class="proof" aria-label="Public verification">
    <strong>${benchmarkCasesTotal} fixtures</strong><p>labeled synthetic cases cover every lifecycle row and run in public CI; not a real-repository performance claim.</p>
    <strong>5 refs · 6 files</strong><p>real GitHub App → Cloud Run → bot-created draft PR; location-scoped migration invariants and repository CI passed.</p>
    <strong>0 auto-merges</strong><p>dynamic values remain runtime confirmation; every repair stays draft for customer review.</p>
  </aside>
</section>
<section>
  <p class="tag">Public lifecycle catalog</p>
  <h2>Know the deadline. Find the code. Review the repair.</h2>
  <div class="stats">
    <div><strong>${database.entries.length}</strong><span>exact model IDs</span></div>
    <div><strong>${database.apiDeprecations.length}</strong><span>API surfaces</span></div>
    <div><strong>${benchmarkCasesTotal}</strong><span>labeled model fixtures</span></div>
    <div><strong>56</strong><span>fixed public API call sites</span></div>
  </div>
  <a class="button primary" href="models/">Open the lifecycle database</a>
</section>`,
});
await writeFile(path.join(outputRoot, "index.html"), home, "utf8");

const catalogEntries = [...database.entries].sort((left, right) => {
  if (left.status !== right.status) {
    return left.status === "deprecated" ? -1 : 1;
  }
  return left.status === "deprecated"
    ? (left.shutdownDate ?? "9999-12-31").localeCompare(
        right.shutdownDate ?? "9999-12-31",
      )
    : (right.shutdownDate ?? "0000-01-01").localeCompare(
        left.shutdownDate ?? "0000-01-01",
      );
});
const rows = catalogEntries
  .map(
    (entry) => `<a class="row" data-entry="${html(
      `${entry.modelId} ${entry.provider} ${entry.replacement} ${entry.shutdownDate ?? "not announced"}`.toLowerCase(),
    )}" href="./${encodeURIComponent(entry.modelId)}/">
  <code>${html(entry.modelId)}</code>
  <span class="status ${html(entry.status)}" data-label="Status">${html(entry.status)}</span>
  <span data-label="Shutdown">${html(entry.shutdownDate ?? "Not announced")}</span>
  <code data-label="Replacement">${html(entry.replacement)}</code>
</a>`,
  )
  .join("\n");
const catalog = shell({
  title: `${database.entries.length} AI model shutdown dates — SunsetPR`,
  description: homeDescription,
  canonical: `${baseUrl}/models/`,
  relativeRoot: "../",
  body: `<section class="catalog-head">
  <div><p class="tag">OpenAI · Anthropic · Gemini · Cohere · xAI</p><h1>AI model lifecycle database</h1><p class="lead">Exact IDs, shutdown dates, official replacements, and provider-owned evidence. Checked ${html(database.checkedAt)}.</p></div>
  <label><span class="tag">Filter exact IDs</span><input class="search" type="search" placeholder="e.g. gpt-4-turbo" data-search autocomplete="off"></label>
</section>
<div class="table" role="table">
  <div class="row head" role="row"><span>Model ID</span><span>Status</span><span>Shutdown</span><span>Official replacement</span></div>
  ${rows}
</div>
<p class="empty" data-empty>No matching lifecycle entry.</p>
<p class="disclaimer">A lifecycle entry is not a guarantee of behavioral, price, latency, token-limit, rate-limit, or parameter compatibility. Preview or ambiguous successors remain report-only.</p>
<script src="../assets/catalog.js" defer></script>`,
});
await mkdir(path.join(outputRoot, "models"), { recursive: true });
await writeFile(path.join(outputRoot, "models/index.html"), catalog, "utf8");

const apiRows = database.apiDeprecations
  .map(
    (entry) => `<a class="row" data-entry="${html(
      `${entry.apiName} ${entry.apiId} ${entry.shutdownDate} ${entry.replacement ?? ""}`.toLowerCase(),
    )}" href="./openai/${encodeURIComponent(entry.apiId)}/">
  <code>${html(entry.apiName)}</code>
  <span class="status deprecated" data-label="Status">${html(entry.status)}</span>
  <span data-label="Shutdown">${html(entry.shutdownDate)}</span>
  <span data-label="Official migration">${html(entry.replacement ?? "No official replacement listed")}</span>
</a>`,
  )
  .join("\n");
const apiCatalog = shell({
  title: `${database.apiDeprecations.length} AI API shutdown dates — SunsetPR`,
  description:
    "OpenAI API shutdown dates, official migration paths, and report-only safety boundaries.",
  canonical: `${baseUrl}/apis/`,
  relativeRoot: "../",
  body: `<section class="catalog-head">
  <div><p class="tag">OpenAI API surfaces</p><h1>AI API lifecycle database</h1><p class="lead">Shutdown dates, official migration paths, and provider-owned evidence. Checked ${html(database.checkedAt)}.</p></div>
  <label><span class="tag">Filter API surfaces</span><input class="search" type="search" placeholder="e.g. Assistants API" data-search autocomplete="off"></label>
</section>
<div class="table" role="table">
  <div class="row head" role="row"><span>API</span><span>Status</span><span>Shutdown</span><span>Official migration</span></div>
  ${apiRows}
</div>
<p class="empty" data-empty>No matching API lifecycle entry.</p>
<p class="disclaimer">API migrations are report-only until a deterministic rule can preserve the affected state model and request semantics. SunsetPR never invents a replacement when the official source lists none.</p>
<script src="../assets/catalog.js" defer></script>`,
});
await mkdir(path.join(outputRoot, "apis"), { recursive: true });
await writeFile(path.join(outputRoot, "apis/index.html"), apiCatalog, "utf8");

for (const entry of database.entries) {
  const relativePath = modelPath(entry.modelId);
  const canonical = `${baseUrl}/${relativePath}`;
  const shutdownLabel = entry.shutdownDate ?? "not announced";
  const title = `${entry.modelId} shutdown date: ${shutdownLabel} — SunsetPR`;
  const description = entry.shutdownDate
    ? `${providerLabels[entry.provider]} lists ${entry.modelId} as ${entry.status}; shutdown ${entry.shutdownDate}; official replacement ${entry.replacement}.`
    : `${providerLabels[entry.provider]} lists ${entry.modelId} as ${entry.status}; shutdown date not announced; official replacement ${entry.replacement}.`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    dateModified: database.checkedAt,
    citation: entry.sourceUrl,
    about: {
      "@type": "Thing",
      name: entry.modelId,
    },
  }).replaceAll("<", "\\u003c");
  const page = shell({
    title,
    description,
    canonical,
    relativeRoot: "../../",
    body: `<article class="detail">
  <p class="breadcrumbs"><a href="../../models/">Lifecycle DB</a> / ${html(providerLabels[entry.provider])}</p>
  <p class="tag">${html(entry.status)} · ${html(providerLabels[entry.provider])}</p>
  <h1>${html(entry.modelId)}</h1>
  <p class="lead">${html(providerLabels[entry.provider])} lists this model ID as ${html(entry.status)}${entry.shutdownDate ? ` with a shutdown date of <strong>${html(entry.shutdownDate)}</strong>` : "; the shutdown date is <strong>not announced</strong>"}.</p>
  <dl class="facts">
    <div><dt>Shutdown date</dt><dd>${html(entry.shutdownDate ?? "Not announced")}</dd></div>
    <div><dt>Status</dt><dd>${html(entry.status)}</dd></div>
    <div><dt>Official replacement</dt><dd><code>${html(entry.replacement)}</code></dd></div>
    <div><dt>Replacement confidence</dt><dd>${html(entry.replacementConfidence)}</dd></div>
    <div><dt>Provider</dt><dd>${html(providerLabels[entry.provider])}</dd></div>
    <div><dt>Official pages checked</dt><dd>${html(database.checkedAt)}</dd></div>
  </dl>
  <section class="evidence"><p class="tag">Primary evidence</p><h2>Provider-owned documentation</h2><p><a href="${html(entry.sourceUrl)}" rel="noreferrer">${html(providerLabels[entry.provider])} official deprecation page ↗</a></p><p>${html(entry.notes)}</p></section>
  <section class="caution"><h2>Migration caution</h2><p>An official replacement can change output quality, price, latency, rate limits, token limits, and supported parameters. ${entry.replacementConfidence === "high" ? "SunsetPR only considers a deterministic edit when the code context is also high confidence." : "This replacement is not eligible for the default deterministic repair path."}</p></section>
  <section class="cta"><p class="tag">Find this ID in your repository</p><h2>Scan read-only. Repair only with explicit opt-in.</h2><p>The free Action runs inside your GitHub runner and sends no repository code to SunsetPR or an external AI model. Eligible repairs are bot-created drafts and never auto-merge.</p><div class="actions"><a class="button primary" href="${actionUrl}">Install the free Action ↗</a><a class="button" href="${demoPrUrl}">Inspect a real repair PR ↗</a><a class="button" href="${privateBetaUrl}">Request beta privately</a></div><p class="disclaimer">Do not email source code, secrets, environment values, customer names, or private repository URLs.</p></section>
  <p class="disclaimer">Provider documentation remains the source of truth. Static analysis cannot resolve remote configuration or arbitrary runtime expressions; those remain explicitly unconfirmed.</p>
  <script type="application/ld+json">${structuredData}</script>
</article>`,
  });
  const directory = path.join(outputRoot, relativePath);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), page, "utf8");
}

for (const entry of database.apiDeprecations) {
  const relativePath = apiPath(entry.apiId);
  const canonical = `${baseUrl}/${relativePath}`;
  const title = `${entry.apiName} shutdown date: ${entry.shutdownDate} — SunsetPR`;
  const migration = entry.replacement ?? "No official replacement listed";
  const description = `OpenAI lists the ${entry.apiName} for shutdown on ${entry.shutdownDate}. Official migration: ${migration}.`;
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    dateModified: database.checkedAt,
    citation: entry.sourceUrl,
    about: {
      "@type": "Thing",
      name: entry.apiName,
    },
  }).replaceAll("<", "\\u003c");
  const page = shell({
    title,
    description,
    canonical,
    relativeRoot: "../../../",
    body: `<article class="detail">
  <p class="breadcrumbs"><a href="../../../apis/">API lifecycle DB</a> / OpenAI</p>
  <p class="tag">${html(entry.status)} · OpenAI API</p>
  <h1>${html(entry.apiName)}</h1>
  <p class="lead">OpenAI lists this API surface for shutdown on <strong>${html(entry.shutdownDate)}</strong>. SunsetPR reports matching call sites without treating an API redesign as a model-ID replacement.</p>
  <dl class="facts">
    <div><dt>Shutdown date</dt><dd>${html(entry.shutdownDate)}</dd></div>
    <div><dt>Status</dt><dd>${html(entry.status)}</dd></div>
    <div><dt>Official migration</dt><dd>${html(migration)}</dd></div>
    <div><dt>Repair policy</dt><dd>Report only</dd></div>
    <div><dt>Provider</dt><dd>OpenAI</dd></div>
    <div><dt>Official pages checked</dt><dd>${html(database.checkedAt)}</dd></div>
  </dl>
  <section class="evidence"><p class="tag">Primary evidence</p><h2>Provider-owned documentation</h2><p><a href="${html(entry.sourceUrl)}" rel="noreferrer">OpenAI official deprecations page ↗</a></p><p>${html(entry.notes)}</p></section>
  <section class="caution"><h2>Migration caution</h2><p>${entry.replacement ? `The official migration path is ${html(entry.replacement)}, but request state, tools, streaming, and persistence can require application redesign. SunsetPR does not apply a blind semantic rewrite.` : "OpenAI lists no replacement. SunsetPR does not infer one from adjacent products or model names."}</p></section>
  <section class="cta"><p class="tag">Find this API in your repository</p><h2>Scan read-only. Keep semantic migrations review-only.</h2><p>The free Action runs inside your GitHub runner and sends no repository code to SunsetPR or an external AI model.</p><div class="actions"><a class="button primary" href="${actionUrl}">Install the free Action ↗</a><a class="button" href="${privateBetaUrl}">Request beta privately</a></div></section>
  <script type="application/ld+json">${structuredData}</script>
</article>`,
  });
  const directory = path.join(outputRoot, relativePath);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), page, "utf8");
}

await copyFile("data/lifecycle.json", path.join(outputRoot, "lifecycle.json"));
const urls = [
  `${baseUrl}/`,
  `${baseUrl}/models/`,
  `${baseUrl}/apis/`,
  ...database.entries.map((entry) => `${baseUrl}/${modelPath(entry.modelId)}`),
  ...database.apiDeprecations.map((entry) => `${baseUrl}/${apiPath(entry.apiId)}`),
];
await writeFile(
  path.join(outputRoot, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((url) => `  <url><loc>${html(url)}</loc><lastmod>${database.checkedAt}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
  "utf8",
);
await writeFile(
  path.join(outputRoot, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`,
  "utf8",
);
await writeFile(
  path.join(outputRoot, "404.html"),
  shell({
    title: "Page not found — SunsetPR",
    description: "The requested SunsetPR lifecycle page does not exist.",
    canonical: `${baseUrl}/404.html`,
    body: `<section class="detail"><p class="tag">404</p><h1>Lifecycle page not found.</h1><p class="lead">Browse the current official-source lifecycle database.</p><a class="button primary" href="${baseUrl}/models/">Open model database</a></section>`,
  }),
  "utf8",
);
await writeFile(
  path.join(outputRoot, ".nojekyll"),
  "",
  "utf8",
);
await writeFile(
  path.join(outputRoot, "pages-manifest.json"),
  `${JSON.stringify(
    {
      checkedAt: database.checkedAt,
      entries: database.entries.length,
      apiEntries: database.apiDeprecations.length,
      urls: urls.length,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(
  `Built ${urls.length} crawlable pages from ${database.entries.length} model and ${database.apiDeprecations.length} API lifecycle entries.\n`,
);
