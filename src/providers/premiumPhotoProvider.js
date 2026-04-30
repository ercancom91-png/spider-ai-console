const USER_AGENT = "SpiderAIBrowser/0.2 (premium-photo-audit)";
const CDX_API = "https://web.archive.org/cdx/search/cdx";
const WAYBACK_BASE = "https://web.archive.org/web";

/**
 * Premium-only: 3-katmanlı silinmiş foto kaynak araması.
 * 1) Wayback Machine arşivinden snapshot HTML çekip <img> taglarını çıkar
 * 2) Bing/Google cache linklerini üret (kullanıcı tarayıcıda açar)
 * 3) Beyaz listedeki açık arşiv siteleri (GitHub Gist, Pastebin search)
 *
 * Çıktı: { url, sourceUrl, source, capturedAt } — hiçbir görsel yüz doğrulama
 * geçmeden kullanıcıya gösterilmez (faceVerification.js bu işi yapar).
 */
export async function searchDeletedPhotos(subject, options = {}) {
  const startedAt = Date.now();
  const candidates = [];
  const diagnostics = {
    waybackCaptures: 0,
    waybackImages: 0,
    cacheLinks: 0,
    archiveHits: 0,
    durationMs: 0
  };

  try {
    const captures = await fetchWaybackCaptures(subject);
    diagnostics.waybackCaptures = captures.length;
    for (const cap of captures.slice(0, 12)) {
      if (Date.now() - startedAt > 25_000) break;
      try {
        const images = await extractImagesFromSnapshot(cap);
        diagnostics.waybackImages += images.length;
        candidates.push(...images);
      } catch {
        // ignore per-snapshot
      }
    }
  } catch {
    // ignore
  }

  const cacheLinks = buildCacheLinks(subject);
  diagnostics.cacheLinks = cacheLinks.length;
  candidates.push(...cacheLinks);

  try {
    const archiveHits = await fetchArchiveSites(subject);
    diagnostics.archiveHits = archiveHits.length;
    candidates.push(...archiveHits);
  } catch {
    // ignore
  }

  diagnostics.durationMs = Date.now() - startedAt;
  return dedupe(candidates).slice(0, options.maxResults || 60);
}

async function fetchWaybackCaptures(subject) {
  const probes = buildWaybackProbes(subject);
  const captures = [];
  for (const probe of probes.slice(0, 8)) {
    try {
      const url = new URL(CDX_API);
      url.searchParams.set("url", probe);
      url.searchParams.set("matchType", "url");
      url.searchParams.set("limit", "8");
      url.searchParams.set("output", "json");
      url.searchParams.set("filter", "statuscode:200");
      url.searchParams.set("collapse", "urlkey");

      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(7_000)
      });
      if (!response.ok) continue;
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length < 2) continue;

      for (const row of rows.slice(1)) {
        const [, timestamp, original] = row;
        captures.push({ timestamp, original });
      }
    } catch {
      // ignore
    }
  }
  return captures;
}

function buildWaybackProbes(subject) {
  const probes = [];
  const platforms = [
    "twitter.com", "x.com", "instagram.com", "facebook.com",
    "github.com", "linkedin.com/in", "tiktok.com/@", "reddit.com/user"
  ];
  if (subject.username) {
    for (const platform of platforms) {
      probes.push(`${platform}/${subject.username}*`);
    }
  }
  if (subject.email) probes.push(`*${encodeURIComponent(subject.email)}*`);
  return probes;
}

async function extractImagesFromSnapshot({ timestamp, original }) {
  const snapshotUrl = `${WAYBACK_BASE}/${timestamp}/${original}`;
  const response = await fetch(snapshotUrl, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return [];
  const html = await response.text();

  const matches = [...html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)];
  return matches.slice(0, 20).map((m) => {
    const raw = m[1];
    const absolute = raw.startsWith("http") ? raw : `${WAYBACK_BASE}/${timestamp}im_/${raw}`;
    return {
      url: absolute,
      sourceUrl: snapshotUrl,
      source: "wayback",
      capturedAt: formatTimestamp(timestamp)
    };
  }).filter((img) => /\.(jpg|jpeg|png|webp|gif)/i.test(img.url));
}

function buildCacheLinks(subject) {
  const links = [];
  const queries = [];
  if (subject.email) queries.push(subject.email);
  if (subject.username) queries.push(subject.username);
  if (subject.fullName) queries.push(subject.fullName);

  for (const q of queries.slice(0, 3)) {
    links.push({
      url: `https://www.google.com/search?q=${encodeURIComponent(`cache:${q}`)}&tbm=isch`,
      sourceUrl: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      source: "google-cache",
      capturedAt: null,
      note: "Google önbellek arama linki — kullanıcı tarayıcıda açar."
    });
    links.push({
      url: `https://www.bing.com/images/search?q=${encodeURIComponent(q)}`,
      sourceUrl: `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
      source: "bing-images",
      capturedAt: null
    });
  }
  return links;
}

async function fetchArchiveSites(subject) {
  const out = [];
  if (!subject.username && !subject.email) return out;
  const term = subject.username || subject.email;

  // GitHub Gist search via web (simplest free path)
  try {
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(term)}+in:file&per_page=8`;
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(6_000)
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.items || [];
      for (const item of items) {
        if (item.html_url?.includes("gist.")) {
          out.push({
            url: item.html_url,
            sourceUrl: item.html_url,
            source: "github-gist",
            capturedAt: null
          });
        }
      }
    }
  } catch {
    // ignore
  }

  return out;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function formatTimestamp(ts) {
  if (!ts || ts.length < 8) return ts;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}
