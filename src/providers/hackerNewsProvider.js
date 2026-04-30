import { buildSearchQueries } from "../normalizers.js";

const HN_API = "https://hn.algolia.com/api/v1/search";

export async function searchHackerNews(subject, options = {}) {
  const queries = pickQueries(subject, options);
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "hackernews-algolia",
    queriesPlanned: queries.length,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0
  };

  const results = [];
  for (const query of queries) {
    if (Date.now() - startedAt > 10_000) break;

    try {
      const items = await fetchHN(query, limit);
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
  if (subject.email) direct.push(subject.email);
  if (subject.username) direct.push(subject.username);
  if (subject.fullName) direct.push(subject.fullName);
  return [...new Set([...direct, ...queries])].slice(0, 5);
}

async function fetchHN(query, limit) {
  const url = new URL(HN_API);
  url.searchParams.set("query", query);
  url.searchParams.set("hitsPerPage", String(Math.min(limit * 2, 30)));
  url.searchParams.set("tags", "story,comment");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(6_000),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`HN ${response.status}`);
  const data = await response.json();
  const hits = data?.hits || [];

  return hits.map((hit) => {
    const isComment = hit._tags?.includes("comment");
    const id = hit.objectID;
    return {
      provider: "Hacker News",
      sourceType: "community-forum",
      title: hit.title || hit.story_title || (isComment ? "Yorum" : "Tartışma"),
      url: hit.url || `https://news.ycombinator.com/item?id=${id}`,
      snippet: (hit.comment_text || hit.story_text || "").replace(/<[^>]+>/g, "").slice(0, 280),
      query,
      fetchedAt: new Date().toISOString()
    };
  }).filter((r) => r.url);
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
