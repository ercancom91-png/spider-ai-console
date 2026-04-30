import { buildSearchQueries } from "../normalizers.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export async function searchYandex(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "yandex-html",
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
      const items = await fetchYandexHtml(query);
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
  return [...new Set([...direct, ...queries])].slice(0, 6);
}

async function fetchYandexHtml(query) {
  const url = new URL("https://yandex.com/search/");
  url.searchParams.set("text", query);
  url.searchParams.set("lr", "11508"); // İstanbul region

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      Accept: "text/html"
    },
    signal: AbortSignal.timeout(7_000)
  });
  if (!response.ok) throw new Error(`Yandex ${response.status}`);
  const html = await response.text();

  const items = extractYandexResults(html);
  return items.map((item) => ({
    provider: "Yandex",
    sourceType: "web-search",
    title: item.title,
    url: item.url,
    snippet: item.snippet,
    query,
    fetchedAt: new Date().toISOString()
  }));
}

function extractYandexResults(html) {
  const out = [];
  // Yandex serp items use class patterns with "OrganicTitle-Link" and "TextContainer"
  const linkRegex = /<a[^>]*class="[^"]*OrganicTitle-Link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<span[^>]*class="[^"]*TextContainer[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

  const links = [...html.matchAll(linkRegex)];
  const snippets = [...html.matchAll(snippetRegex)];

  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    const snip = snippets[i];
    if (!link?.[1]) continue;
    out.push({
      url: decodeHtml(link[1]),
      title: cleanText(link[2] || ""),
      snippet: cleanText(snip?.[1] || "")
    });
  }

  // Fallback: simple <h2><a>...</a></h2> patterns
  if (out.length === 0) {
    const fallbackRegex = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const fallback = [...html.matchAll(fallbackRegex)];
    for (const m of fallback) {
      out.push({
        url: decodeHtml(m[1]),
        title: cleanText(m[2] || ""),
        snippet: ""
      });
    }
  }

  return out.filter((r) => r.url && r.title && r.url.startsWith("http"));
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
