import { config } from "../config.js";
import { buildSearchQueries } from "../normalizers.js";

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export async function searchBrave(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const diagnostics = {
    mode: "brave-search-api",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0,
    skipped: false
  };

  if (!config.braveApiKey) {
    diagnostics.skipped = true;
    diagnostics.reason = "BRAVE_API_KEY tanımlı değil.";
    return { results: [], diagnostics };
  }

  const startedAt = Date.now();
  const queries = pickQueries(subject, options);
  diagnostics.queriesPlanned = queries.length;
  const results = [];

  for (const query of queries) {
    if (Date.now() - startedAt > 14_000) break;

    try {
      const items = await fetchBrave(query, limit, options);
      diagnostics.queriesRun += 1;
      diagnostics.rawCandidates += items.length;
      results.push(...items);
    } catch {
      // ignore
    }
  }

  const deduped = dedupeByUrl(results).slice(0, limit * 3);
  diagnostics.dedupedCandidates = deduped.length;
  diagnostics.durationMs = Date.now() - startedAt;

  return { results: deduped, diagnostics };
}

function pickQueries(subject, options) {
  const queries = buildSearchQueries(subject, options).filter((q) => !q.startsWith("site:"));
  const direct = [];
  if (subject.email) direct.push(`"${subject.email}"`);
  if (subject.phone?.digits) direct.push(`"${subject.phone.digits}"`);
  if (subject.username) direct.push(`"${subject.username}"`);
  if (subject.fullName) direct.push(`"${subject.fullName}"`);
  return [...new Set([...direct, ...queries])].slice(0, 8);
}

async function fetchBrave(query, limit, options) {
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(limit * 2, 20)));
  url.searchParams.set("safesearch", options.includeSensitiveSources === true ? "off" : "strict");
  url.searchParams.set("country", "TR");
  url.searchParams.set("search_lang", "tr");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": config.braveApiKey
    },
    signal: AbortSignal.timeout(7_000)
  });
  if (!response.ok) throw new Error(`Brave ${response.status}`);
  const data = await response.json();
  const web = data?.web?.results || [];

  return web.map((r) => ({
    provider: "Brave Search",
    sourceType: "web-search",
    title: r.title || "",
    url: r.url || "",
    snippet: (r.description || "").replace(/<[^>]+>/g, "").slice(0, 280),
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
