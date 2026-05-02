#!/usr/bin/env node
//
// WMN platform self-test (canary check).
//
// Maigret pattern: her platform için iki probe at —
//   1) known[0] handle ile → exists döndürmeli
//   2) garantili olmayan random handle ile → missing döndürmeli (false positive yok)
//
// İki taraflı kontrolü geçemeyen platformlar `data/wmn/wmn-disabled.json`'a
// yazılır; getWmnPlatforms() runtime'da onları otomatik atlar.
//
// Tipik kullanım:
//   node scripts/wmnSelfTest.js              # tam tarama, ~10-15 dk
//   node scripts/wmnSelfTest.js --limit 50   # ilk 50 site (sanity check)
//   node scripts/wmnSelfTest.js --offset 200 --limit 100   # sayfalı

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { getWmnPlatforms, runWmnProbe } from "../src/providers/wmnCatalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DISABLED_PATH = join(__dirname, "..", "data", "wmn", "wmn-disabled.json");
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 12;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: Infinity, offset: 0, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit") opts.limit = Number(args[++i]);
    else if (args[i] === "--offset") opts.offset = Number(args[++i]);
    else if (args[i] === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
];

function ua() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function fetchImpl(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init.method || "GET",
      headers: {
        "User-Agent": ua(),
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(init.headers || {})
      },
      body: init.body,
      redirect: "follow",
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");
    return { status: response.status, text };
  } catch {
    return { status: 0, text: "" };
  } finally {
    clearTimeout(timer);
  }
}

function randomNonexistent() {
  return `xqz_${randomBytes(8).toString("hex")}`;
}

async function testPlatform(platform) {
  const knownHandle = platform.known?.[0];
  if (!knownHandle) {
    return { key: platform.key, name: platform.name, status: "no-known", reason: "Bilinen test handle yok" };
  }
  const ghostHandle = randomNonexistent();

  const [knownOutcome, ghostOutcome] = await Promise.all([
    runWmnProbe(platform, knownHandle, fetchImpl),
    runWmnProbe(platform, ghostHandle, fetchImpl)
  ]);

  if (knownOutcome.state !== "exists") {
    return {
      key: platform.key,
      name: platform.name,
      status: "broken-known",
      reason: `known=${knownHandle} → ${knownOutcome.state} (status ${knownOutcome.status})`
    };
  }
  if (ghostOutcome.state === "exists") {
    return {
      key: platform.key,
      name: platform.name,
      status: "false-positive",
      reason: `random=${ghostHandle} sahte hesap "exists" döndü (status ${ghostOutcome.status})`
    };
  }
  return {
    key: platform.key,
    name: platform.name,
    status: "healthy",
    reason: `known→exists, random→${ghostOutcome.state}`
  };
}

async function runWithConcurrency(items, fn, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
      done++;
      if (done % 10 === 0) {
        process.stdout.write(`  ${done}/${items.length}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const opts = parseArgs();
  const all = getWmnPlatforms();
  const slice = all.slice(opts.offset, opts.offset + opts.limit);
  console.log(`Self-test başlıyor: ${slice.length} / ${all.length} platform (offset ${opts.offset})\n`);

  const t0 = Date.now();
  const results = await runWithConcurrency(slice, testPlatform, CONCURRENCY);
  console.log(""); // newline after progress

  const healthy = results.filter((r) => r.status === "healthy");
  const broken = results.filter((r) => r.status === "broken-known");
  const fp = results.filter((r) => r.status === "false-positive");
  const noKnown = results.filter((r) => r.status === "no-known");

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nSüre: ${elapsed}s`);
  console.log(`Sağlam:        ${healthy.length}`);
  console.log(`Known kırık:   ${broken.length}`);
  console.log(`Yanlış pozitif:${fp.length}`);
  console.log(`Test handle yok:${noKnown.length}`);

  if (broken.length || fp.length) {
    console.log("\n--- Devre dışı bırakılacak (önerilen) ---");
    for (const r of [...broken, ...fp]) {
      console.log(`  ${r.name.padEnd(30)} ${r.status.padEnd(20)} ${r.reason}`);
    }
  }

  // Önceki disabled listesini oku, yeni problemleri ekle.
  let disabled = new Set();
  if (existsSync(DISABLED_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(DISABLED_PATH, "utf-8"));
      if (Array.isArray(prev?.disabled)) {
        for (const k of prev.disabled) disabled.add(k);
      }
    } catch {}
  }

  // Bu turda sağlam çıkanları çıkar, broken+fp olanları ekle.
  for (const r of healthy) disabled.delete(r.key);
  for (const r of [...broken, ...fp]) disabled.add(r.key);

  const payload = {
    generatedAt: new Date().toISOString(),
    disabled: [...disabled].sort(),
    summary: { healthy: healthy.length, broken: broken.length, falsePositive: fp.length, noKnown: noKnown.length }
  };

  if (opts.dryRun) {
    console.log("\n[dry-run] disabled list yazılmıyor.");
    console.log(payload);
  } else {
    writeFileSync(DISABLED_PATH, JSON.stringify(payload, null, 2));
    console.log(`\nDisabled list yazıldı: ${DISABLED_PATH} (${disabled.size} platform)`);
  }
}

main().catch((err) => {
  console.error("Self-test hatası:", err);
  process.exit(1);
});
