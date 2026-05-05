import { buildSearchQueries } from "../normalizers.js";

// UA rotation: bot-revealing UA (eski "SpiderAIBrowser/0.1") → Bing/DDG anında
// CAPTCHA/blok cevabı dönüyordu ve provider 0 sonuçla kapanıyordu. Tarayıcı
// gibi görünen masaüstü UA havuzundan rastgele seçim yapıyoruz.
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36"
];
function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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
  // DDG HTML endpoint POST'u tercih ediyor; GET çoğu zaman bot interstitial
  // (anomaly page) döndürüyor. Form-encoded POST ile result__a listesini al.
  const url = new URL("https://html.duckduckgo.com/html/");
  const body = new URLSearchParams({ q: query, kl: "tr-tr" }).toString();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": randomUA(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7",
      Referer: "https://duckduckgo.com/",
      "Upgrade-Insecure-Requests": "1"
    },
    body,
    redirect: "follow",
    signal: AbortSignal.timeout(9_000)
  });
  if (!response.ok) return [];
  const html = await response.text();

  // DDG result item: <a class="result__a" href="..."> + sibling snippet div.
  // Yapı düzelt: tüm result__a ve result__snippet'i ayrı çıkar, sırayla zip et.
  const linkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/g;

  const links = [];
  let m;
  while ((m = linkPattern.exec(html))) {
    links.push({ url: decodeHtml(m[1] || ""), title: cleanText(m[2] || "") });
  }
  const snippets = [];
  while ((m = snippetPattern.exec(html))) {
    snippets.push(cleanText(m[1] || ""));
  }

  return links
    .map((entry, i) => ({
      provider: "SPIDER Live",
      sourceType: "self-made-live",
      title: entry.title,
      url: normalizeDuckDuckGoUrl(entry.url),
      snippet: snippets[i] || "",
      query,
      fetchedAt: new Date().toISOString()
    }))
    .filter((result) => result.url && result.title && result.url.startsWith("http"));
}

async function fetchText(url) {
  // 4.5 sn → 9 sn: Bing/DDG search ilk yanıtta çoğu zaman 5+ sn bekliyor
  // (özellikle Render Frankfurt → US edge). Çok kısa timeout = boş sonuç.
  const response = await fetch(url, {
    headers: {
      "User-Agent": randomUA(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Upgrade-Insecure-Requests": "1"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(9_000)
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
