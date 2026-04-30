import { buildSearchQueries } from "../normalizers.js";

const USER_AGENT = "SpiderAIBrowser/0.2 (consent-gated public audit)";
const REDDIT_BASE = "https://www.reddit.com";

export async function searchReddit(subject, options = {}) {
  const queries = pickQueries(subject, options);
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "reddit-json-api",
    queriesPlanned: queries.length,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0
  };

  const results = [];
  for (const query of queries) {
    if (Date.now() - startedAt > 12_000) break;

    try {
      const items = await fetchRedditPosts(query, limit);
      diagnostics.queriesRun += 1;
      diagnostics.rawCandidates += items.length;
      results.push(...items);
    } catch {
      // ignore per-query failures
    }
  }

  if (subject.username) {
    try {
      const userPosts = await fetchRedditUser(subject.username, limit);
      diagnostics.rawCandidates += userPosts.length;
      results.push(...userPosts);
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
  return [...new Set([...direct, ...queries])].slice(0, 6);
}

async function fetchRedditPosts(query, limit) {
  const url = new URL(`${REDDIT_BASE}/search.json`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(Math.min(limit * 2, 25)));
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("type", "link");

  const data = await fetchJson(url);
  const children = data?.data?.children || [];

  return children.map((child) => {
    const post = child.data || {};
    return {
      provider: "Reddit",
      sourceType: "community-forum",
      title: post.title || "",
      url: `${REDDIT_BASE}${post.permalink || ""}`,
      snippet: (post.selftext || "").slice(0, 280),
      query,
      fetchedAt: new Date().toISOString()
    };
  }).filter((r) => r.url && r.title);
}

async function fetchRedditUser(username, limit) {
  const url = new URL(`${REDDIT_BASE}/user/${encodeURIComponent(username)}/submitted.json`);
  url.searchParams.set("limit", String(Math.min(limit * 2, 25)));

  const data = await fetchJson(url);
  const children = data?.data?.children || [];

  return children.map((child) => {
    const post = child.data || {};
    return {
      provider: "Reddit",
      sourceType: "community-forum",
      title: post.title || `u/${username}`,
      url: `${REDDIT_BASE}${post.permalink || `/user/${username}`}`,
      snippet: (post.selftext || `Profil: u/${username}`).slice(0, 280),
      query: `user:${username}`,
      fetchedAt: new Date().toISOString()
    };
  }).filter((r) => r.url);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(6_500)
  });
  if (!response.ok) throw new Error(`Reddit API ${response.status}`);
  return response.json();
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
