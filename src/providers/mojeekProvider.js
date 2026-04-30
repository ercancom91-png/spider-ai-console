import { buildSearchQueries } from "../normalizers.js";

const USER_AGENT = "Mozilla/5.0 SpiderAIBrowser/0.2 (consent-gated audit)";

export async function searchMojeek(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "mojeek-html",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0
  };

  const queries = pickQueries(subject, options);
  diagnostics.queriesPlanned = queries.length;
  const results = [];

  for (const query of queries) {
    if (Date.now() - startedAt > 14_000) break;

    try {
      const items = await fetchMojeekHtml(query, options);
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
  if (subject.username) direct.push(`"${subject.username}"`);
  if (subject.fullName) direct.push(`"${subject.fullName}"`);
  return [...new Set([...direct, ...queries])].slice(0, 6);
}

async function fetchMojeekHtml(query, options) {
  const url = new URL("https://www.mojeek.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("fmt", "html");
  url.searchParams.set("safe", options.includeSensitiveSources === true ? "0" : "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8"
    },
    signal: AbortSignal.timeout(7_000)
  });
  if (!response.ok) throw new Error(`Mojeek ${response.status}`);
  const html = await response.text();

  return extractMojeekResults(html).map((item) => ({
    provider: "Mojeek",
    sourceType: "web-search",
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    query,
    fetchedAt: new Date().toISOString()
  }));
}

function extractMojeekResults(html) {
  const out = [];
  // Mojeek results use <a class="ob"> for the link and <p class="s"> for snippet
  const blockRegex = /<a[^>]*class="ob"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<p class="s">([\s\S]*?)<\/p>/gi;
  const matches = [...html.matchAll(blockRegex)];

  for (const m of matches) {
    const url = decodeHtml(m[1]);
    const title = cleanText(m[2] || "");
    const snippet = cleanText(m[4] || "");
    if (url && title) {
      out.push({ url, title, snippet });
    }
  }

  // Fallback: simpler pattern
  if (out.length === 0) {
    const fallback = [...html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)];
    for (const m of fallback) {
      out.push({
        url: decodeHtml(m[1]),
        title: cleanText(m[2] || ""),
        snippet: ""
      });
    }
  }

  return out;
}

function cleanText(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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
