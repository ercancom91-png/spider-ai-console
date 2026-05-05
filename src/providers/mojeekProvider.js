import { buildSearchQueries } from "../normalizers.js";

// Tarayıcı UA havuzu — Mojeek de bot-revealing UA'ları zaman zaman 403 ile
// reddediyor. Rastgele masaüstü UA daha tutarlı sonuç dönüyor.
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
];
function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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
      "User-Agent": randomUA(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.5",
      "Upgrade-Insecure-Requests": "1",
      Referer: "https://www.mojeek.com/"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(11_000)
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
