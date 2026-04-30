import { buildSearchQueries } from "../normalizers.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const TIMEOUT_MS = 8_000;
const RESULTS_PER_QUERY = 10;

// Startpage proxies Google results — no API key, no login. Better coverage for
// Instagram/TikTok/Facebook profiles than Bing or DDG HTML.
export async function searchStartpage(subject, options = {}) {
  const queries = pickQueries(subject, options);
  const diagnostics = {
    mode: "startpage-google-proxy",
    queriesPlanned: queries.length,
    queriesRun: 0,
    candidates: 0,
    reason: "Startpage üzerinden Google index'i sorgulandı; Instagram/TikTok/Facebook profillerinde Bing/DDG'den belirgin şekilde daha iyi kapsama sağlar."
  };

  const results = [];
  const batchSize = options.scanDepth === "maximum" ? 6 : options.scanDepth === "wide" ? 4 : 3;

  for (let index = 0; index < queries.length; index += batchSize) {
    const batch = queries.slice(index, index + batchSize);
    const settled = await Promise.allSettled(batch.map((query) => fetchStartpage(query)));
    for (const outcome of settled) {
      diagnostics.queriesRun += 1;
      if (outcome.status === "fulfilled") {
        diagnostics.candidates += outcome.value.length;
        results.push(...outcome.value);
      }
    }
    if (results.length >= candidateCap(options.scanDepth)) break;
  }

  return {
    results: dedupeByUrl(results).slice(0, candidateCap(options.scanDepth)),
    diagnostics
  };
}

const SOCIAL_PLATFORMS = [
  { name: "instagram", domain: "instagram.com" },
  { name: "facebook", domain: "facebook.com" },
  { name: "linkedin", domain: "linkedin.com" },
  { name: "twitter", domain: "x.com" },
  { name: "tiktok", domain: "tiktok.com" },
  { name: "youtube", domain: "youtube.com" },
  { name: "pinterest", domain: "pinterest.com" },
  { name: "threads", domain: "threads.net" },
  { name: "reddit", domain: "reddit.com" },
  { name: "telegram", domain: "t.me" }
];

function pickQueries(subject, options) {
  const queries = [];

  // Break the name into useful tokens. Last token in Turkish ≈ surname, which
  // is usually far more unique than the first name and surfaces profiles the
  // full-phrase search misses.
  const nameTokens = subject.fullName
    ? subject.fullName.split(/\s+/).filter((token) => token.length >= 2)
    : [];
  const fullName = subject.fullName || "";
  const firstName = nameTokens[0] || "";
  const surname = nameTokens.length >= 2 ? nameTokens[nameTokens.length - 1] : "";

  // 1. Full-name scoped per platform (highest signal when present)
  if (fullName) {
    queries.push(`"${fullName}"`);
    for (const platform of SOCIAL_PLATFORMS) {
      queries.push(`"${fullName}" ${platform.name}`);
      queries.push(`site:${platform.domain} "${fullName}"`);
    }
  }

  // 2. Surname alone scoped per platform — catches profiles where the visible
  // display name uses a nickname + surname, or uses the folded spelling.
  if (surname && surname !== fullName) {
    queries.push(`"${surname}"`);
    for (const platform of SOCIAL_PLATFORMS) {
      queries.push(`"${surname}" ${platform.name}`);
      queries.push(`site:${platform.domain} "${surname}"`);
    }
  }

  // 3. First name + surname together (no quotes on combo) for loose matches
  if (firstName && surname) {
    queries.push(`${firstName} ${surname} instagram OR tiktok OR facebook OR linkedin`);
  }

  // 4. Identifier-based exact queries
  if (subject.username) {
    queries.push(`"${subject.username}"`);
    queries.push(`${subject.username} instagram OR tiktok OR twitter OR facebook`);
    for (const platform of SOCIAL_PLATFORMS) {
      queries.push(`site:${platform.domain} "${subject.username}"`);
    }
  }
  if (subject.email) queries.push(`"${subject.email}"`);
  if (subject.phone?.digits) queries.push(`"${subject.phone.digits}"`);

  // 5. Append scoped base queries (taxonomy-driven `site:` across 50+ domains)
  const base = buildSearchQueries(subject, options);

  return [...new Set([...queries, ...base])].slice(
    0,
    options.scanDepth === "maximum" ? 80 : options.scanDepth === "wide" ? 50 : 28
  );
}

async function fetchStartpage(query) {
  const url = new URL("https://www.startpage.com/sp/search");
  url.searchParams.set("query", query);
  url.searchParams.set("cat", "web");
  url.searchParams.set("language", "turkish");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.5",
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) return [];
  const html = await response.text();
  return parseResults(html, query).slice(0, RESULTS_PER_QUERY);
}

const RESULT_PATTERN = /<a[^>]*class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*class="description[^"]*"[^>]*>([\s\S]*?)<\/p>/g;

function parseResults(html, query) {
  const items = [];
  RESULT_PATTERN.lastIndex = 0;
  let match;
  while ((match = RESULT_PATTERN.exec(html))) {
    const url = decodeEntities(match[1]).trim();
    if (!url.startsWith("http")) continue;
    if (url.includes("startpage.com")) continue;

    const title = cleanHtml(match[2]);
    const snippet = cleanHtml(match[3]);
    if (!title) continue;

    items.push({
      provider: "Startpage (Google)",
      sourceType: "web-search",
      title,
      url,
      snippet,
      query,
      fetchedAt: new Date().toISOString()
    });
  }
  return items;
}

function cleanHtml(value) {
  if (!value) return "";
  const stripped = value
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&#32;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function dedupeByUrl(results) {
  const seen = new Set();
  const out = [];
  for (const item of results) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function candidateCap(scanDepth) {
  if (scanDepth === "maximum") return 160;
  if (scanDepth === "wide") return 100;
  return 60;
}
