import { config } from "../config.js";
import { buildSearchQueries } from "../normalizers.js";

export async function searchBingWeb(subject, options = {}) {
  if (!config.bingSearchKey) {
    return [];
  }

  const queries = buildSearchQueries(subject, options);
  const limit = options.maxResultsPerProvider || config.maxResultsPerProvider;
  const results = [];

  for (const query of queries) {
    const url = new URL(config.bingSearchEndpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(limit, 10)));
    url.searchParams.set("responseFilter", "Webpages");
    url.searchParams.set("safeSearch", options.includeSensitiveSources === true ? "Off" : "Strict");
    url.searchParams.set("textDecorations", "false");
    url.searchParams.set("textFormat", "Raw");

    const response = await fetch(url, {
      headers: {
        "Ocp-Apim-Subscription-Key": config.bingSearchKey
      }
    });

    if (!response.ok) {
      throw new Error(`Bing Web Search failed with ${response.status}`);
    }

    const payload = await response.json();
    const webPages = payload.webPages?.value || [];

    for (const page of webPages) {
      results.push({
        provider: "Bing Web Search",
        sourceType: "web-search",
        title: page.name || "",
        url: page.url || "",
        snippet: page.snippet || "",
        query,
        fetchedAt: new Date().toISOString()
      });
    }
  }

  return dedupeByUrl(results).slice(0, limit * Math.max(queries.length, 1));
}

function dedupeByUrl(results) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    if (!result.url || seen.has(result.url)) {
      continue;
    }

    seen.add(result.url);
    deduped.push(result);
  }

  return deduped;
}
