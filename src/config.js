import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

loadLocalEnv();

export const config = {
  port: Number(process.env.PORT || 4173),
  maxResultsPerProvider: Number(process.env.MAX_RESULTS_PER_PROVIDER || 8),
  maxSearchQueries: Number(process.env.MAX_SEARCH_QUERIES || 240),
  retentionDaysLimit: Number(process.env.RETENTION_DAYS_LIMIT || 30),
  useDemoProvider: process.env.USE_DEMO_PROVIDER !== "false",
  bingSearchKey: process.env.BING_SEARCH_KEY || "",
  bingSearchEndpoint:
    process.env.BING_SEARCH_ENDPOINT ||
    "https://api.bing.microsoft.com/v7.0/search",
  braveApiKey: process.env.BRAVE_API_KEY || "",
  githubToken: process.env.GITHUB_TOKEN || "",
  searxBaseUrl: process.env.SEARX_BASE_URL || "",
  licenseSecret: process.env.LICENSE_SECRET || "",
  enableBackgroundCrawl: process.env.ENABLE_BG_CRAWL === "true",
  providerConcurrency: Number(process.env.PROVIDER_CONCURRENCY || 6)
};

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function enabledProviders() {
  const providers = [];

  if (config.useDemoProvider) {
    providers.push({ id: "demo", name: "Demo Source", status: "enabled", kind: "fixture" });
  }

  providers.push({ id: "knock-index", name: "SPIDER Index", status: "enabled", kind: "self-hosted-index" });
  providers.push({ id: "knock-live", name: "SPIDER Live", status: "enabled", kind: "self-made-live" });
  providers.push({ id: "profile-probe", name: "Profile Probe", status: "enabled", kind: "profile-probe" });
  providers.push({ id: "spider-images", name: "SPIDER Images", status: "enabled", kind: "visual-image-search" });

  providers.push({
    id: "bing",
    name: "Bing Web",
    status: config.bingSearchKey ? "enabled" : "needsCredential",
    kind: "web-search"
  });

  providers.push({
    id: "brave",
    name: "Brave Search",
    status: config.braveApiKey ? "enabled" : "needsCredential",
    kind: "web-search"
  });

  providers.push({ id: "yandex", name: "Yandex", status: "enabled", kind: "web-search" });
  providers.push({ id: "mojeek", name: "Mojeek", status: "enabled", kind: "web-search" });

  providers.push({
    id: "searx",
    name: "SearX (meta)",
    status: config.searxBaseUrl ? "enabled" : "needsCredential",
    kind: "web-search"
  });

  providers.push({ id: "github", name: "GitHub", status: "enabled", kind: "developer" });
  providers.push({ id: "stackoverflow", name: "Stack Overflow", status: "enabled", kind: "developer" });
  providers.push({ id: "reddit", name: "Reddit", status: "enabled", kind: "community-forum" });
  providers.push({ id: "hackernews", name: "Hacker News", status: "enabled", kind: "community-forum" });
  providers.push({ id: "wayback", name: "Wayback Machine", status: "enabled", kind: "archive" });
  providers.push({ id: "wikipedia", name: "Wikipedia / Wikidata", status: "enabled", kind: "knowledge-base" });

  return providers;
}
