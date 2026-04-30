import { buildSearchQueries } from "../normalizers.js";

const USER_AGENT =
  "SpiderAIBrowser/0.1 (+https://localhost; user-authorized public web search)";

export async function searchSelfMade(subject, options = {}) {
  const queries = buildSelfMadeQueries(subject, options);
  const candidateLimit = candidateLimitForDepth(options.scanDepth);
  const deadlineMs = deadlineForDepth(options.scanDepth);
  const startedAt = Date.now();
  const rawResults = [];
  const diagnostics = {
    mode: "live-metasearch",
    queriesPlanned: queries.length,
    queriesRun: 0,
    sourceRequests: 0,
    rawCandidates: 0,
    dedupedCandidates: 0,
    candidateLimit,
    deadlineMs,
    timedOut: false,
    reason:
      "Bu sayı canlı oturum limiti, süre bütçesi ve kaynakların döndürdüğü parsellenebilir sonuçlarla sınırlı. Google/Yandex ölçeği için SPIDER Index crawler kümesi gerekir."
  };

  const batches = chunk(queries, batchSizeForDepth(options.scanDepth));
  for (const batch of batches) {
    if (Date.now() - startedAt > deadlineMs) {
      diagnostics.timedOut = true;
      diagnostics.reason = `${diagnostics.reason} Bu çalışmada süre bütçesi dolduğu için kalan sorgular kesildi.`;
      break;
    }

    const settledBatch = await Promise.allSettled(
      batch.map(async (query) => {
        const searches = await Promise.allSettled([
          searchBingHtml(query, options),
          searchDuckDuckGoHtml(query)
        ]);
        diagnostics.queriesRun += 1;
        diagnostics.sourceRequests += 2;

        return searches.flatMap((search) => (search.status === "fulfilled" ? search.value : []));
      })
    );

    for (const settled of settledBatch) {
      if (settled.status === "fulfilled") {
        rawResults.push(...settled.value);
      }
    }

    if (rawResults.length >= candidateLimit * 2) {
      break;
    }
  }

  const deduped = dedupeByUrl(rawResults);
  diagnostics.rawCandidates = rawResults.length;
  diagnostics.dedupedCandidates = deduped.length;
  diagnostics.durationMs = Date.now() - startedAt;

  return {
    results: deduped.slice(0, candidateLimit),
    diagnostics
  };
}

function buildSelfMadeQueries(subject, options) {
  const baseQueries = buildSearchQueries(subject, {
    ...options,
    scanDepth: options.scanDepth === "maximum" ? "wide" : options.scanDepth
  });
  const directQueries = [];

  if (subject.email) {
    directQueries.push(`"${subject.email}"`);
    const [local, domain] = subject.email.split("@");
    if (local) directQueries.push(`"${local}" "${domain}"`);
  }
  if (subject.phone?.digits) {
    for (const variant of (subject.phone.variants || []).slice(0, 4)) {
      directQueries.push(`"${variant}"`);
    }
    directQueries.push(`"${subject.phone.digits}"`);
  }
  if (subject.fullName) {
    directQueries.push(`"${subject.fullName}"`);
    if (subject.email) directQueries.push(`"${subject.fullName}" "${subject.email}"`);
    if (subject.phone?.digits) directQueries.push(`"${subject.fullName}" "${subject.phone.digits}"`);
    if (subject.username) directQueries.push(`"${subject.fullName}" "${subject.username}"`);
  }
  if (subject.username) {
    directQueries.push(`"${subject.username}"`);
    directQueries.push(`"@${subject.username}"`);
  }

  const maxQueries = options.scanDepth === "maximum" ? 640 : options.scanDepth === "wide" ? 320 : 140;
  return [...new Set([...directQueries, ...baseQueries])].slice(0, maxQueries);
}

async function searchBingHtml(query, options) {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("setlang", "tr-TR");
  url.searchParams.set("cc", "TR");
  url.searchParams.set("adlt", options.includeSensitiveSources === true ? "off" : "strict");

  const html = await fetchText(url);
  const items = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || [];

  return items.map((item) => {
    const link = matchFirst(item, /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    const snippet = matchFirst(item, /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    const fallbackSnippet = matchFirst(item, /<div class="b_caption"[^>]*>([\s\S]*?)<\/div>/i);
    const rawUrl = decodeHtml(link?.[1] || "");

    return {
      provider: "SPIDER Live",
      sourceType: "self-made-live",
      title: cleanText(link?.[2] || ""),
      url: normalizeBingUrl(rawUrl),
      snippet: cleanText(snippet?.[1] || fallbackSnippet?.[1] || ""),
      query,
      fetchedAt: new Date().toISOString()
    };
  }).filter((result) => result.url && result.title);
}

async function searchDuckDuckGoHtml(query) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const html = await fetchText(url);
  const items = html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g) || [];

  return items.map((item) => {
    const link = matchFirst(
      item,
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    );
    const snippet = matchFirst(
      item,
      /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i
    );

    return {
      provider: "SPIDER Live",
      sourceType: "self-made-live",
      title: cleanText(link?.[2] || ""),
      url: normalizeDuckDuckGoUrl(decodeHtml(link?.[1] || "")),
      snippet: cleanText(snippet?.[1] || snippet?.[2] || ""),
      query,
      fetchedAt: new Date().toISOString()
    };
  }).filter((result) => result.url && result.title);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(4_500)
  });

  if (!response.ok) {
    throw new Error(`Live fetch failed with ${response.status}`);
  }

  return response.text();
}

function normalizeBingUrl(url) {
  try {
    const parsed = new URL(url);
    const encoded = parsed.searchParams.get("u");
    if (parsed.hostname.endsWith("bing.com") && encoded) {
      const normalized = encoded.startsWith("a1") ? encoded.slice(2) : encoded;
      return Buffer.from(normalized.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      );
    }
  } catch {
    return url;
  }

  return url;
}

function normalizeDuckDuckGoUrl(url) {
  try {
    const parsed = new URL(url);
    const uddg = parsed.searchParams.get("uddg");
    return uddg || url;
  } catch {
    return url;
  }
}

function matchFirst(value, regex) {
  return regex.exec(value);
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
    .replace(/&#32;/g, " ")
    .replace(/&#0183;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function dedupeByUrl(results) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    deduped.push(result);
  }

  return deduped;
}

function candidateLimitForDepth(scanDepth) {
  if (scanDepth === "maximum") return 420;
  if (scanDepth === "wide") return 260;
  return 120;
}

function deadlineForDepth(scanDepth) {
  if (scanDepth === "maximum") return 90_000;
  if (scanDepth === "wide") return 50_000;
  return 28_000;
}

function batchSizeForDepth(scanDepth) {
  if (scanDepth === "maximum") return 12;
  if (scanDepth === "wide") return 8;
  return 5;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
