const SE_API = "https://api.stackexchange.com/2.3";

export async function searchStackOverflow(subject, options = {}) {
  const limit = options.maxResultsPerProvider || 8;
  const startedAt = Date.now();
  const diagnostics = {
    mode: "stackexchange-api",
    queriesPlanned: 0,
    queriesRun: 0,
    rawCandidates: 0,
    dedupedCandidates: 0
  };

  const queries = pickQueries(subject);
  diagnostics.queriesPlanned = queries.length;
  const results = [];

  for (const query of queries) {
    if (Date.now() - startedAt > 10_000) break;

    try {
      const [users, questions] = await Promise.allSettled([
        fetchUsers(query, limit),
        fetchQuestions(query, limit)
      ]);
      diagnostics.queriesRun += 1;
      const hits = [
        ...(users.status === "fulfilled" ? users.value : []),
        ...(questions.status === "fulfilled" ? questions.value : [])
      ];
      diagnostics.rawCandidates += hits.length;
      results.push(...hits);
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
  if (subject.username) queries.push(subject.username);
  if (subject.fullName) queries.push(subject.fullName);
  return [...new Set(queries)].slice(0, 3);
}

async function fetchUsers(query, limit) {
  const url = new URL(`${SE_API}/users`);
  url.searchParams.set("inname", query);
  url.searchParams.set("site", "stackoverflow");
  url.searchParams.set("pagesize", String(Math.min(limit, 10)));
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "reputation");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_500),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`SE users ${response.status}`);
  const data = await response.json();
  const items = data?.items || [];

  return items.map((u) => ({
    provider: "Stack Overflow",
    sourceType: "developer",
    title: `${u.display_name} (rep: ${u.reputation})`,
    url: u.link,
    snippet: u.location ? `Konum: ${u.location}` : "Stack Overflow profili",
    query,
    fetchedAt: new Date().toISOString()
  }));
}

async function fetchQuestions(query, limit) {
  const url = new URL(`${SE_API}/search/advanced`);
  url.searchParams.set("q", query);
  url.searchParams.set("site", "stackoverflow");
  url.searchParams.set("pagesize", String(Math.min(limit, 10)));
  url.searchParams.set("order", "desc");
  url.searchParams.set("sort", "relevance");

  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_500),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`SE questions ${response.status}`);
  const data = await response.json();
  const items = data?.items || [];

  return items.map((q) => ({
    provider: "Stack Overflow",
    sourceType: "developer",
    title: decodeEntities(q.title),
    url: q.link,
    snippet: `Tags: ${(q.tags || []).join(", ")} — Yazar: ${q.owner?.display_name || "?"}`,
    query,
    fetchedAt: new Date().toISOString()
  }));
}

function decodeEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
