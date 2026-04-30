import { foldText } from "../normalizers.js";

const USER_AGENT =
  "Mozilla/5.0 SPIDERAIVisualSearch/0.1 (+https://localhost; public image search)";

export async function searchVisualImages(subject, options = {}) {
  const queries = buildVisualQueries(subject, options);
  const results = [];
  const diagnostics = {
    mode: "public-image-search",
    queriesPlanned: queries.length,
    queriesRun: 0,
    imageCandidates: 0,
    reason:
      "Public image search sonuçları tarandı; yüklenen görsel web'e gönderilmedi, sadece metin sorguları ve eşleşen kaynak bağlantıları kullanıldı."
  };

  for (const query of queries) {
    try {
      const items = await searchBingImagesHtml(query, options);
      diagnostics.queriesRun += 1;
      diagnostics.imageCandidates += items.length;
      results.push(...items);
    } catch {
      // Image search is best-effort; text providers still carry the report.
    }

    if (results.length >= visualResultLimit(options.scanDepth) * 2) {
      break;
    }
  }

  return {
    results: dedupeByImageUrl(results).slice(0, visualResultLimit(options.scanDepth)),
    diagnostics
  };
}

function buildVisualQueries(subject, options) {
  const terms = [];
  if (subject.fullName) {
    terms.push(`"${subject.fullName}"`);
    const foldedName = foldText(subject.fullName);
    if (foldedName !== subject.fullName.toLocaleLowerCase("tr")) {
      terms.push(`"${foldedName}"`);
    }
  }
  if (subject.username) terms.push(`"${subject.username}"`);
  if (subject.email) terms.push(`"${subject.email}"`);

  const platforms = [
    "instagram",
    "facebook",
    "x twitter",
    "tiktok",
    "telegram",
    "linkedin",
    "youtube",
    "reddit",
    "profile photo",
    "avatar"
  ];

  if (options.includeSensitiveSources === true) {
    platforms.push("onlyfans", "fansly", "creator profile");
  }

  const queries = [];
  for (const term of terms.slice(0, 3)) {
    queries.push(`${term} image`);
    for (const platform of platforms) {
      queries.push(`${term} ${platform}`);
    }
  }

  return [...new Set(queries)].slice(0, options.scanDepth === "maximum" ? 32 : 18);
}

async function searchBingImagesHtml(query, options) {
  const url = new URL("https://www.bing.com/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("setlang", "tr-TR");
  url.searchParams.set("cc", "TR");
  url.searchParams.set("adlt", options.includeSensitiveSources === true ? "off" : "strict");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(8_000)
  });

  if (!response.ok) {
    throw new Error(`Image search failed with ${response.status}`);
  }

  const html = await response.text();
  const items = [];
  const regex = /m="({&quot;[\s\S]*?&quot;})"/g;
  let match;

  while ((match = regex.exec(html))) {
    const payload = parseImagePayload(match[1]);
    if (!payload?.murl || !payload?.purl) continue;

    const realTitle = payload.t || payload.pt || "";
    items.push({
      provider: "SPIDER Images",
      sourceType: "visual-image-search",
      title: realTitle || "Görsel sonucu",
      url: payload.purl,
      snippet: realTitle,
      searchableText: realTitle,
      images: [
        {
          url: payload.murl,
          alt: payload.t || payload.pt || query,
          kind: "image-search-result"
        }
      ],
      query,
      fetchedAt: new Date().toISOString()
    });
  }

  return items;
}

function parseImagePayload(value) {
  try {
    return JSON.parse(decodeHtml(value));
  } catch {
    return null;
  }
}

function decodeHtml(value = "") {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function visualResultLimit(scanDepth) {
  if (scanDepth === "maximum") return 80;
  if (scanDepth === "wide") return 48;
  return 28;
}

function dedupeByImageUrl(results) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    const imageUrl = result.images?.[0]?.url;
    if (!imageUrl || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    deduped.push(result);
  }

  return deduped;
}
