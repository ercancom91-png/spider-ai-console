const WIKI_API = "https://tr.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

export async function searchWikipedia(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "wikipedia-mediawiki",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0
  };

  const queries = pickQueries(subject);
  diagnostics.queriesPlanned = queries.length;
  const results = [];

  for (const query of queries) {
    if (Date.now() - startedAt > 10_000) break;

    try {
      const [tr, en, wd] = await Promise.allSettled([
        fetchWiki(WIKI_API, query, "tr", limit),
        fetchWiki(WIKI_API_EN, query, "en", limit),
        fetchWikidata(query, limit)
      ]);
      diagnostics.queriesRun += 1;
      const hits = [
        ...(tr.status === "fulfilled" ? tr.value : []),
        ...(en.status === "fulfilled" ? en.value : []),
        ...(wd.status === "fulfilled" ? wd.value : [])
      ];
      diagnostics.rawCandidates += hits.length;
      results.push(...hits);
    } catch {
      // ignore
    }
  }

  const deduped = dedupeByUrl(results).slice(0, limit * 3);
  diagnostics.dedupedCandidates = deduped.length;
  diagnostics.durationMs = Date.now() - startedAt;

  return { results: deduped, diagnostics };
}

function pickQueries(subject) {
  const queries = [];
  if (subject.fullName) queries.push(subject.fullName);
  if (subject.username) queries.push(subject.username);
  return [...new Set(queries)].slice(0, 3);
}

async function fetchWiki(endpoint, query, lang, limit) {
  const url = new URL(endpoint);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(Math.min(limit * 2, 15)));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url, { signal: AbortSignal.timeout(5_500) });
  if (!response.ok) throw new Error(`Wiki ${response.status}`);
  const data = await response.json();
  const hits = data?.query?.search || [];

  return hits.map((hit) => ({
    provider: lang === "tr" ? "Wikipedia TR" : "Wikipedia EN",
    sourceType: "knowledge-base",
    title: hit.title,
    url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`,
    snippet: (hit.snippet || "").replace(/<[^>]+>/g, "").slice(0, 280),
    query,
    fetchedAt: new Date().toISOString()
  }));
}

async function fetchWikidata(query, limit) {
  const url = new URL(WIKIDATA_API);
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", query);
  url.searchParams.set("language", "tr");
  url.searchParams.set("limit", String(Math.min(limit, 10)));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url, { signal: AbortSignal.timeout(5_500) });
  if (!response.ok) throw new Error(`Wikidata ${response.status}`);
  const data = await response.json();
  const hits = data?.search || [];

  return hits.map((hit) => ({
    provider: "Wikidata",
    sourceType: "knowledge-base",
    title: hit.label || hit.id,
    url: hit.concepturi || `https://www.wikidata.org/wiki/${hit.id}`,
    snippet: hit.description || `Wikidata varlığı (${hit.id})`,
    query,
    fetchedAt: new Date().toISOString()
  }));
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
