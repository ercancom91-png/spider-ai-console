import { config } from "../config.js";
import { buildSearchQueries } from "../normalizers.js";

export async function searchSearx(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const diagnostics = {
    mode: "searx-meta-search",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0,
    skipped: false
  };

  if (!config.searxBaseUrl) {
    diagnostics.skipped = true;
    diagnostics.reason = "SEARX_BASE_URL tanımlı değil.";
    return { results: [], diagnostics };
  }

  const startedAt = Date.now();
  const queries = pickQueries(subject, options);
  diagnostics.queriesPlanned = queries.length;
  const results = [];

  for (const query of queries) {
    if (Date.now() - startedAt > 15_000) break;

    try {
      const items = await fetchSearx(query, limit, options);
      diagnostics.queriesRun += 1;
      diagnostics.rawCandidates += items.length;
      results.push(...items);
    } catch {
      // ignore
    }
  }

  const deduped = dedupeByUrl(results).slice(0, limit * 4);
  diagnostics.dedupedCandidates = deduped.length;
  diagnostics.durationMs = Date.now() - startedAt;

  return { results: deduped, diagnostics };
}

function pickQueries(subject, options) {
  const queries = buildSearchQueries(subject, options).filter((q) => !q.startsWith("site:"));
  const direct = [];
  if (subject.email) direct.push(`"${subject.email}"`);
  if (subject.username) direct.push(`"${subject.username}"`);
  if (subject.fullName) direct.push(`"${subject.fullName}"`);
  return [...new Set([...direct, ...queries])].slice(0, 6);
}

async function fetchSearx(query, limit, options) {
  const base = config.searxBaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "tr-TR");
  url.searchParams.set("safesearch", options.includeSensitiveSources === true ? "0" : "2");
  url.searchParams.set("categories", "general");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/json",
      "User-Agent": "SpiderAIBrowser/0.2"
    }
  });
  if (!response.ok) throw new Error(`SearX ${response.status}`);
  const data = await response.json();
  const items = data?.results || [];

  return items.slice(0, limit * 2).map((r) => ({
    provider: `SearX (${r.engine || "meta"})`,
    sourceType: "web-search",
    title: r.title || "",
    url: r.url || "",
    snippet: (r.content || "").slice(0, 280),
    query,
    fetchedAt: new Date().toISOString()
  })).filter((r) => r.url);
}

function dedupeByUrl(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
  }
  return out;
}
