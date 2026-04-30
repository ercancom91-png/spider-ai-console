import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { crawlAndIndex } from "./knockCrawler.js";

const TICK_MS = 30 * 60 * 1000; // 30 dk
let timer = null;
let lastRun = null;
let lastResult = null;

export function startBackgroundCrawl() {
  if (!config.enableBackgroundCrawl) return { started: false, reason: "ENABLE_BG_CRAWL=false" };
  if (timer) return { started: true, reason: "already running" };

  // İlk tick'i 30 sn sonra at, sonra her TICK_MS aralıkla
  setTimeout(runOnce, 30_000);
  timer = setInterval(runOnce, TICK_MS);
  return { started: true, intervalMs: TICK_MS };
}

export function stopBackgroundCrawl() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function backgroundStatus() {
  return {
    enabled: config.enableBackgroundCrawl,
    running: Boolean(timer),
    lastRun,
    lastResult
  };
}

async function runOnce() {
  const seeds = readSeeds();
  if (!seeds.length) return;

  try {
    const result = await crawlAndIndex({ seeds, maxPages: 30, maxDepth: 2 });
    lastRun = new Date().toISOString();
    lastResult = {
      indexed: result.indexed,
      skipped: result.skipped.length,
      frontierRemaining: result.frontierRemaining
    };
  } catch (error) {
    lastRun = new Date().toISOString();
    lastResult = { error: error.message };
  }
}

function readSeeds() {
  const path = join(process.cwd(), "data", "seeds.txt");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
}
