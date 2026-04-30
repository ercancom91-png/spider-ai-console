import { indexDocument } from "./knockIndex.js";

const USER_AGENT =
  "SpiderAIIndexCrawler/0.2 (+self-hosted authorized public web search; respects robots.txt)";
const MAX_BODY_CHARS = 40_000;
const PER_HOST_DELAY_MS = 1_000;

const lastFetchAt = new Map();
const robotsCache = new Map();

export async function crawlAndIndex({ seeds = [], maxPages = 12, maxDepth = 1 } = {}) {
  const queue = normalizeSeeds(seeds).map((url) => ({ url, depth: 0, priority: priorityFor(url) }));
  const seen = new Set();
  const indexed = [];
  const skipped = [];

  while (queue.length && indexed.length < maxPages) {
    queue.sort((a, b) => b.priority - a.priority);
    const item = queue.shift();
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);

    const allowed = await isAllowedByRobots(item.url);
    if (!allowed) {
      skipped.push({ url: item.url, reason: "robots.txt izin vermiyor" });
      continue;
    }

    await waitForHostBudget(item.url);

    try {
      const page = await fetchPage(item.url);
      if (!page) {
        skipped.push({ url: item.url, reason: "HTML olmayan yanıt" });
        continue;
      }

      indexed.push(indexDocument(page));

      if (item.depth < maxDepth) {
        for (const link of page.links.slice(0, 12)) {
          if (!seen.has(link) && sameHost(item.url, link)) {
            queue.push({ url: link, depth: item.depth + 1, priority: priorityFor(link) });
          }
        }
      }
    } catch (error) {
      skipped.push({ url: item.url, reason: error.message });
    }
  }

  return {
    indexed: indexed.length,
    skipped,
    documents: indexed,
    frontierRemaining: queue.length,
    mode: "self-hosted-crawl"
  };
}

const HIGH_PRIORITY_HOSTS = [
  "instagram.com", "facebook.com", "twitter.com", "x.com", "tiktok.com",
  "linkedin.com", "github.com", "youtube.com", "reddit.com",
  "pastebin.com", "have-i-been-pwned.com", "haveibeenpwned.com"
];

function priorityFor(url) {
  try {
    const host = new URL(url).host.replace(/^www\./, "");
    return HIGH_PRIORITY_HOSTS.some((h) => host.endsWith(h)) ? 10 : 1;
  } catch {
    return 0;
  }
}

async function waitForHostBudget(url) {
  let host;
  try { host = new URL(url).host; } catch { return; }
  const now = Date.now();
  const last = lastFetchAt.get(host) || 0;
  const wait = Math.max(0, PER_HOST_DELAY_MS - (now - last));
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastFetchAt.set(host, Date.now());
}

async function isAllowedByRobots(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.host;
  if (!robotsCache.has(host)) {
    robotsCache.set(host, fetchRobots(parsed));
  }
  const rules = await robotsCache.get(host);
  if (!rules) return true; // failed to fetch — assume allowed
  return checkRobots(rules, parsed.pathname);
}

async function fetchRobots(parsed) {
  try {
    const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(4_000)
    });
    if (!response.ok) return null;
    const text = await response.text();
    return parseRobots(text);
  } catch {
    return null;
  }
}

function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  const groups = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const fieldLower = field.toLowerCase();
    if (fieldLower === "user-agent") {
      if (!current || (current.disallow.length || current.allow.length)) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && fieldLower === "disallow") {
      current.disallow.push(value);
    } else if (current && fieldLower === "allow") {
      current.allow.push(value);
    }
  }
  return groups;
}

function checkRobots(groups, path) {
  const ourAgent = "spideraiindexcrawler";
  const matching = groups.find((g) => g.agents.some((a) => a === ourAgent || a === "*")) || null;
  if (!matching) return true;
  for (const rule of matching.disallow) {
    if (rule && path.startsWith(rule)) {
      const allowed = matching.allow.some((a) => a && path.startsWith(a));
      if (!allowed) return false;
    }
  }
  return true;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return null;
  }

  const html = await response.text();
  return parseHtml({ html, url });
}

function parseHtml({ html, url }) {
  const title = cleanText(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || url);
  const description =
    cleanText(
      firstMatch(
        html,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
      ) ||
        firstMatch(
          html,
          /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i
        ) ||
        ""
    ) || "";
  const body = cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).slice(0, MAX_BODY_CHARS);
  const links = extractLinks(html, url);
  const images = extractImages(html, url);

  return {
    url,
    title,
    snippet: description || body.slice(0, 260),
    body: `${body} ${images.map((image) => image.alt).filter(Boolean).join(" ")}`.trim(),
    links,
    images,
    sourceType: "knock-crawl"
  };
}

function extractLinks(html, baseUrl) {
  const links = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html))) {
    try {
      const parsed = new URL(match[1], baseUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        parsed.hash = "";
        links.push(parsed.toString());
      }
    } catch {
      // Ignore invalid links.
    }
  }

  return [...new Set(links)];
}

function extractImages(html, baseUrl) {
  const images = [];
  const metaRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = metaRegex.exec(html))) {
    const url = normalizeAssetUrl(match[1], baseUrl);
    if (url) {
      images.push({ url, alt: "Sayfa preview görseli", kind: "meta-preview" });
    }
  }

  while ((match = imgRegex.exec(html))) {
    const rawTag = match[0];
    const url = normalizeAssetUrl(match[1], baseUrl);
    if (!url) continue;
    const alt = cleanText(firstMatch(rawTag, /alt=["']([^"']*)["']/i) || "");
    images.push({ url, alt, kind: "page-image" });
  }

  return dedupeImages(images).slice(0, 16);
}

function normalizeAssetUrl(value, baseUrl) {
  try {
    const parsed = new URL(decodeHtml(value), baseUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      parsed.hash = "";
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

function dedupeImages(images) {
  const seen = new Set();
  const deduped = [];

  for (const image of images) {
    if (!image.url || seen.has(image.url)) continue;
    seen.add(image.url);
    deduped.push(image);
  }

  return deduped;
}

function normalizeSeeds(seeds) {
  return seeds
    .map((seed) => {
      try {
        return new URL(seed).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .slice(0, 8);
}

function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

function firstMatch(value, regex) {
  return regex.exec(value)?.[1] || "";
}

function cleanText(value = "") {
  return decodeHtml(value)
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
