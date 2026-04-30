const CDX_API = "https://web.archive.org/cdx/search/cdx";

export async function searchWayback(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "wayback-cdx",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0
  };

  const probes = buildProbes(subject);
  diagnostics.queriesPlanned = probes.length;
  const results = [];

  for (const probe of probes) {
    if (Date.now() - startedAt > 12_000) break;

    try {
      const captures = await fetchCdx(probe, limit);
      diagnostics.queriesRun += 1;
      diagnostics.rawCandidates += captures.length;
      results.push(...captures);
    } catch {
      // ignore per-probe
    }
  }

  const deduped = dedupeByUrl(results).slice(0, limit * 3);
  diagnostics.dedupedCandidates = deduped.length;
  diagnostics.durationMs = Date.now() - startedAt;

  return { results: deduped, diagnostics };
}

function buildProbes(subject) {
  const probes = [];
  const platforms = [
    "twitter.com", "x.com", "instagram.com", "facebook.com",
    "github.com", "linkedin.com/in", "tiktok.com/@", "reddit.com/user"
  ];

  if (subject.username) {
    for (const platform of platforms) {
      const sep = platform.includes("@") || platform.endsWith("/in") || platform.endsWith("/user")
        ? "/" : "/";
      probes.push(`${platform}${sep}${subject.username}*`);
    }
  }

  if (subject.email) {
    probes.push(`*${encodeURIComponent(subject.email)}*`);
  }

  if (subject.fullName && !subject.email && !subject.username) {
    probes.push(`*${encodeURIComponent(subject.fullName)}*`);
  }

  return probes.slice(0, 12);
}

async function fetchCdx(probe, limit) {
  const url = new URL(CDX_API);
  url.searchParams.set("url", probe);
  url.searchParams.set("matchType", "url");
  url.searchParams.set("limit", String(Math.min(limit * 2, 25)));
  url.searchParams.set("output", "json");
  url.searchParams.set("filter", "statuscode:200");
  url.searchParams.set("collapse", "urlkey");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(7_000),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Wayback ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < 2) return [];

  const [, ...records] = rows;
  return records.map((row) => {
    const [, timestamp, original] = row;
    const archiveUrl = `https://web.archive.org/web/${timestamp}/${original}`;
    return {
      provider: "Wayback Machine",
      sourceType: "archive",
      title: `Arşiv: ${truncate(original, 80)}`,
      url: archiveUrl,
      snippet: `Internet Archive snapshot — ${formatTimestamp(timestamp)} — kaynak silinmiş veya değişmiş olabilir.`,
      query: probe,
      fetchedAt: new Date().toISOString()
    };
  });
}

function formatTimestamp(ts) {
  if (!ts || ts.length < 8) return ts;
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
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
