import { config } from "../config.js";

const GH_API = "https://api.github.com";

export async function searchGitHub(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "github-rest-api",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0,
    authenticated: Boolean(config.githubToken)
  };

  const queries = pickQueries(subject);
  diagnostics.queriesPlanned = queries.length;
  const results = [];

  for (const query of queries) {
    if (Date.now() - startedAt > 12_000) break;

    try {
      const [users, repos, code] = await Promise.allSettled([
        fetchGH(`/search/users?q=${encodeURIComponent(query)}&per_page=${limit}`, "user", query),
        fetchGH(`/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}`, "repo", query),
        config.githubToken
          ? fetchGH(`/search/commits?q=${encodeURIComponent(query)}&per_page=${limit}`, "commit", query)
          : Promise.resolve([])
      ]);
      diagnostics.queriesRun += 1;
      const hits = [
        ...(users.status === "fulfilled" ? users.value : []),
        ...(repos.status === "fulfilled" ? repos.value : []),
        ...(code.status === "fulfilled" ? code.value : [])
      ];
      diagnostics.rawCandidates += hits.length;
      results.push(...hits);
    } catch {
      // ignore
    }
  }

  if (subject.username) {
    try {
      const profile = await fetchGHProfile(subject.username);
      if (profile) {
        diagnostics.rawCandidates += 1;
        results.push(profile);
      }
    } catch {
      // ignore
    }
  }

  const deduped = dedupeByUrl(results).slice(0, limit * 3);
  diagnostics.dedupedCandidates = deduped.length;
  diagnostics.durationMs = Date.now() - startedAt;

  return { results: deduped, diagnostics };
}

function pickQueries(subject) {
  const queries = [];
  if (subject.email) queries.push(subject.email);
  if (subject.username) queries.push(subject.username);
  if (subject.fullName) queries.push(subject.fullName);
  return [...new Set(queries)].slice(0, 4);
}

async function fetchGH(path, type, query) {
  const url = `${GH_API}${path}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SpiderAIBrowser/0.2"
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  if (type === "commit") headers.Accept = "application/vnd.github.cloak-preview+json";

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(7_000) });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  const data = await response.json();
  const items = data?.items || [];

  return items.map((item) => mapItem(item, type, query)).filter(Boolean);
}

function mapItem(item, type, query) {
  if (type === "user") {
    return {
      provider: "GitHub",
      sourceType: "developer",
      title: `@${item.login}${item.name ? ` — ${item.name}` : ""}`,
      url: item.html_url,
      snippet: item.bio || `GitHub kullanıcısı: ${item.login}`,
      query,
      fetchedAt: new Date().toISOString()
    };
  }
  if (type === "repo") {
    return {
      provider: "GitHub",
      sourceType: "developer",
      title: item.full_name,
      url: item.html_url,
      snippet: (item.description || "").slice(0, 280),
      query,
      fetchedAt: new Date().toISOString()
    };
  }
  if (type === "commit") {
    return {
      provider: "GitHub",
      sourceType: "developer",
      title: `Commit: ${item.repository?.full_name || ""}`,
      url: item.html_url,
      snippet: (item.commit?.message || "").slice(0, 280),
      query,
      fetchedAt: new Date().toISOString()
    };
  }
  return null;
}

async function fetchGHProfile(username) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SpiderAIBrowser/0.2"
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;

  const response = await fetch(`${GH_API}/users/${encodeURIComponent(username)}`, {
    headers, signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) return null;
  const data = await response.json();
  return {
    provider: "GitHub",
    sourceType: "developer",
    title: `@${data.login}${data.name ? ` — ${data.name}` : ""}`,
    url: data.html_url,
    snippet: data.bio || `Kayıt: ${data.created_at?.slice(0, 10) || "?"}, repo: ${data.public_repos ?? 0}`,
    query: `direct:${username}`,
    fetchedAt: new Date().toISOString()
  };
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
