import { config } from "../config.js";
import { searchBingWeb } from "./bingWebSearchProvider.js";
import { searchBrave } from "./braveProvider.js";
import { searchDemo } from "./demoProvider.js";
import { searchGitHub } from "./githubProvider.js";
import { searchHackerNews } from "./hackerNewsProvider.js";
import { searchLocalIndex } from "./knockIndexProvider.js";
import { searchMojeek } from "./mojeekProvider.js";
import { searchProfileProbes } from "./profileProbeProvider.js";
import { searchReddit } from "./redditProvider.js";
import { searchSearx } from "./searxProvider.js";
import { searchSelfMade } from "./selfMadeProvider.js";
import { searchStartpage } from "./startpageProvider.js";
import { searchStackOverflow } from "./stackOverflowProvider.js";
import { searchWayback } from "./waybackProvider.js";
import { searchWikipedia } from "./wikipediaProvider.js";
import { searchYandex } from "./yandexProvider.js";

export async function runSearchProviders(subject, options = {}) {
  const providerCalls = [];
  const providerStatus = [];

  if (config.useDemoProvider) {
    providerCalls.push({ name: "Demo public source set", kind: "fixture", run: () => searchDemo(subject, options) });
  }

  providerCalls.push({ name: "SPIDER Index", kind: "self-hosted-index", run: () => searchLocalIndex(subject, options) });
  providerCalls.push({ name: "SPIDER Live", kind: "self-made-live", run: () => searchSelfMade(subject, options) });
  providerCalls.push({ name: "Startpage (Google)", kind: "web-search", run: () => searchStartpage(subject, options) });
  providerCalls.push({ name: "Profile Probe", kind: "profile-probe", run: () => searchProfileProbes(subject, options) });
  // SPIDER Images (visual-image-search) disabled; bulky noise results, premium/photo flow hidden.

  if (config.bingSearchKey) {
    providerCalls.push({
      name: "Bing Web Search",
      kind: "web-search",
      run: () => searchBingWeb(subject, {
        maxResultsPerProvider: config.maxResultsPerProvider,
        includeSensitiveSources: options.includeSensitiveSources === true,
        scanDepth: options.scanDepth
      })
    });
  } else {
    providerStatus.push({
      name: "Bing Web Search",
      kind: "web-search",
      status: "skipped",
      reason: "BING_SEARCH_KEY tanımlı değil."
    });
  }

  if (config.braveApiKey) {
    providerCalls.push({
      name: "Brave Search",
      kind: "web-search",
      run: () => searchBrave(subject, options)
    });
  } else {
    providerStatus.push({
      name: "Brave Search",
      kind: "web-search",
      status: "skipped",
      reason: "BRAVE_API_KEY tanımlı değil."
    });
  }

  providerCalls.push({ name: "Yandex", kind: "web-search", run: () => searchYandex(subject, options) });
  providerCalls.push({ name: "Mojeek", kind: "web-search", run: () => searchMojeek(subject, options) });

  if (config.searxBaseUrl) {
    providerCalls.push({ name: "SearX", kind: "web-search", run: () => searchSearx(subject, options) });
  } else {
    providerStatus.push({
      name: "SearX",
      kind: "web-search",
      status: "skipped",
      reason: "SEARX_BASE_URL tanımlı değil."
    });
  }

  providerCalls.push({ name: "GitHub", kind: "developer", run: () => searchGitHub(subject, options) });
  providerCalls.push({ name: "Stack Overflow", kind: "developer", run: () => searchStackOverflow(subject, options) });
  providerCalls.push({ name: "Reddit", kind: "community-forum", run: () => searchReddit(subject, options) });
  providerCalls.push({ name: "Hacker News", kind: "community-forum", run: () => searchHackerNews(subject, options) });
  providerCalls.push({ name: "Wayback Machine", kind: "archive", run: () => searchWayback(subject, options) });
  providerCalls.push({ name: "Wikipedia / Wikidata", kind: "knowledge-base", run: () => searchWikipedia(subject, options) });

  // Concurrency-limited execution
  const concurrency = Math.max(1, config.providerConcurrency);
  const settled = await runWithConcurrency(providerCalls, concurrency);

  const results = [];
  const warnings = [];

  settled.forEach((item, index) => {
    const providerName = providerCalls[index].name;
    const providerKind = providerCalls[index].kind;

    if (item.status === "fulfilled") {
      const value = item.value;
      const providerResults = Array.isArray(value) ? value : value?.results || [];
      const diagnostics = Array.isArray(value) ? undefined : value?.diagnostics;
      results.push(...providerResults);
      providerStatus.push({
        name: providerName,
        kind: providerKind,
        status: "fulfilled",
        resultCount: providerResults.length,
        diagnostics
      });
    } else {
      warnings.push(`${providerName}: ${item.reason?.message || "unknown error"}`);
      providerStatus.push({
        name: providerName,
        kind: providerKind,
        status: "failed",
        reason: item.reason?.message || "unknown error"
      });
    }
  });

  const realSearchAvailable = providerStatus.some(
    (provider) =>
      ((provider.kind === "web-search" || provider.kind === "self-made-live") &&
        provider.status === "fulfilled") ||
      (provider.kind === "self-hosted-index" &&
        provider.status === "fulfilled" &&
        provider.resultCount > 0) ||
      (provider.kind === "profile-probe" &&
        provider.status === "fulfilled" &&
        provider.resultCount > 0) ||
      (provider.kind === "visual-image-search" &&
        provider.status === "fulfilled" &&
        provider.resultCount > 0) ||
      (["developer", "community-forum", "archive", "knowledge-base"].includes(provider.kind) &&
        provider.status === "fulfilled" &&
        provider.resultCount > 0)
  );

  if (!realSearchAvailable) {
    warnings.unshift(
      "Canlı web keşfi tamamlanamadı. API key'leri (BRAVE_API_KEY, BING_SEARCH_KEY) bağlanırsa daha fazla web sağlayıcısı çalışır."
    );
  }

  return {
    results,
    warnings,
    providerStatus,
    realSearchAvailable
  };
}

async function runWithConcurrency(providers, concurrency) {
  const results = new Array(providers.length);
  let cursor = 0;

  async function worker() {
    while (cursor < providers.length) {
      const index = cursor;
      cursor += 1;
      const provider = providers[index];
      try {
        const value = await provider.run();
        results[index] = { status: "fulfilled", value };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, providers.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
