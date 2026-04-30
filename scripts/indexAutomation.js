#!/usr/bin/env node
/*
 * SPIDER AI — Bağımsız İndeks Otomasyonu
 *
 * Web sunucusundan bağımsız çalışır. Düzenli aralıklarla küratörlü seed
 * bankasından bir alt küme seçer, knockCrawler ile çekip yerel SQLite FTS
 * indekse yazar. Her tur öncesi çalışan toplam belge sayısını günceller,
 * stdout + data/automation-status.json üzerine sağlık raporu döker.
 *
 * Çalıştırma:
 *   node scripts/indexAutomation.js                  # default: 30dk döngü, 24 sayfa/tur
 *   AUTO_INTERVAL_MIN=15 AUTO_PAGES=40 node scripts/indexAutomation.js
 *   node scripts/indexAutomation.js --once           # tek tur çalıştır
 *
 * Ortam değişkenleri:
 *   AUTO_INTERVAL_MIN   tur arası dakika              (default 30)
 *   AUTO_PAGES          tur başına maksimum sayfa     (default 24)
 *   AUTO_DEPTH          link derinliği                (default 1)
 *   AUTO_BATCH          tur başına seed sayısı        (default 6)
 *   AUTO_SEED_FILE      seed bankası                  (default data/seed-bank.json)
 *   AUTO_STATUS_FILE    durum çıktı dosyası           (default data/automation-status.json)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crawlAndIndex } from "../src/knockCrawler.js";
import { getIndexStatus } from "../src/knockIndex.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");

const config = {
  intervalMs: Number(process.env.AUTO_INTERVAL_MIN || 30) * 60_000,
  maxPages: Number(process.env.AUTO_PAGES || 24),
  maxDepth: Number(process.env.AUTO_DEPTH || 1),
  batchSize: Number(process.env.AUTO_BATCH || 6),
  seedFile: process.env.AUTO_SEED_FILE || join(projectRoot, "data", "seed-bank.json"),
  statusFile: process.env.AUTO_STATUS_FILE || join(projectRoot, "data", "automation-status.json"),
  cursorFile: join(projectRoot, "data", "automation-cursor.json")
};

const onceMode = process.argv.includes("--once");

const SEED_BANK_FALLBACK = [
  // Açık kaynak / topluluk dizinleri — public, robots.txt'ye saygılı
  "https://github.com/explore",
  "https://github.com/trending",
  "https://news.ycombinator.com/",
  "https://news.ycombinator.com/show",
  "https://news.ycombinator.com/jobs",
  "https://lobste.rs/",
  "https://dev.to/",
  "https://hashnode.com/n/general",
  "https://www.producthunt.com/",
  "https://www.indiehackers.com/products",
  "https://stackoverflow.com/tags",
  "https://serverfault.com/tags",
  "https://askubuntu.com/tags",
  "https://news.ycombinator.com/best",

  // Kimlik / portfolyo hub'ları
  "https://about.me/",
  "https://linktr.ee/",
  "https://bio.link/",

  // Sürüm / paket dizinleri
  "https://www.npmjs.com/",
  "https://pypi.org/",
  "https://packagist.org/",
  "https://crates.io/",
  "https://rubygems.org/",
  "https://huggingface.co/models",
  "https://huggingface.co/datasets",
  "https://huggingface.co/spaces",

  // Akademik
  "https://arxiv.org/",
  "https://www.semanticscholar.org/",
  "https://scholar.google.com/",
  "https://orcid.org/",

  // TR yerel topluluk dizinleri
  "https://forum.donanimhaber.com/",
  "https://eksisozluk.com/basliklar/populer",
  "https://www.technopat.net/sosyal/",
  "https://r10.net/",

  // Federe sosyal ağlar (public timeline)
  "https://mastodon.social/explore",
  "https://mastodon.online/explore",
  "https://lemmy.world/communities",
  "https://kbin.social/",
  "https://bsky.app/",

  // Kod / dosya paylaşım dizinleri
  "https://gist.github.com/discover",
  "https://codeberg.org/explore/repos",
  "https://gitlab.com/explore",
  "https://gitea.com/explore/repos",

  // Kreatif / portfolyo
  "https://www.behance.net/galleries",
  "https://dribbble.com/shots",
  "https://www.deviantart.com/",
  "https://www.artstation.com/",

  // Müzik / video / oyun
  "https://soundcloud.com/discover",
  "https://bandcamp.com/discover",
  "https://letterboxd.com/members/popular/",
  "https://lichess.org/player",
  "https://www.chess.com/players",

  // Açık kaynak istihbarat dizinleri (kişi olmayan, indeks dizinleri)
  "https://wikitech.wikimedia.org/wiki/Special:RecentChanges",
  "https://en.wikipedia.org/wiki/Special:RecentChanges"
];

ensureDataDir();
const seedBank = loadSeedBank();
const cursor = loadCursor();

logHeader();

if (onceMode) {
  await runRound();
  process.exit(0);
}

await runRound();
setInterval(runRound, config.intervalMs);

// Sinyal yakalama — temiz çıkış
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log(`▌ ${sig} alındı, otomasyon durduruluyor.`);
    saveCursor();
    process.exit(0);
  });
}

// ============================================================

async function runRound() {
  const startedAt = new Date();
  const batch = nextBatch();
  log(`▶ Tur başladı  ·  ${startedAt.toISOString()}  ·  ${batch.length} seed`);

  let result;
  try {
    result = await crawlAndIndex({
      seeds: batch,
      maxPages: config.maxPages,
      maxDepth: config.maxDepth
    });
  } catch (error) {
    log(`✗ Tur hatası: ${error.message}`);
    writeStatus({
      lastRoundAt: startedAt.toISOString(),
      lastRoundOk: false,
      lastError: error.message,
      seedBatch: batch
    });
    return;
  }

  const indexNow = getIndexStatus();
  const finishedAt = new Date();
  const durationSec = ((finishedAt - startedAt) / 1000).toFixed(1);

  log(
    `✓ Tur bitti     ·  +${result.indexed} doküman  ·  ` +
    `toplam ${indexNow.documents}  ·  ${durationSec}s  ·  ` +
    `atlanan ${result.skipped.length}`
  );
  if (result.skipped.length) {
    for (const item of result.skipped.slice(0, 4)) {
      log(`  ↳ atlanan: ${item.url} — ${item.reason}`);
    }
  }

  writeStatus({
    lastRoundAt: startedAt.toISOString(),
    lastRoundFinishedAt: finishedAt.toISOString(),
    lastRoundDurationSec: Number(durationSec),
    lastRoundOk: true,
    lastIndexed: result.indexed,
    lastSkipped: result.skipped.length,
    seedBatch: batch,
    indexDocuments: indexNow.documents,
    indexLatestAt: indexNow.latestIndexedAt,
    intervalMin: config.intervalMs / 60_000,
    cursor: cursor.position,
    totalSeeds: seedBank.length
  });

  saveCursor();

  if (!onceMode) {
    const nextRoundAt = new Date(Date.now() + config.intervalMs);
    log(`⏭ Sonraki tur:  ${nextRoundAt.toISOString()}\n`);
  }
}

function nextBatch() {
  const batch = [];
  for (let i = 0; i < config.batchSize; i += 1) {
    batch.push(seedBank[cursor.position % seedBank.length]);
    cursor.position = (cursor.position + 1) % seedBank.length;
  }
  return batch;
}

function loadSeedBank() {
  if (existsSync(config.seedFile)) {
    try {
      const data = JSON.parse(readFileSync(config.seedFile, "utf8"));
      if (Array.isArray(data) && data.length > 0) return data;
      if (Array.isArray(data?.seeds) && data.seeds.length > 0) return data.seeds;
    } catch (error) {
      log(`! seed-bank okunamadı, fallback kullanılıyor: ${error.message}`);
    }
  } else {
    // İlk çalıştırmada fallback bankasını diske yaz
    try {
      ensureDataDir();
      writeFileSync(
        config.seedFile,
        JSON.stringify({ seeds: SEED_BANK_FALLBACK }, null, 2),
        "utf8"
      );
      log(`+ seed-bank oluşturuldu: ${config.seedFile} (${SEED_BANK_FALLBACK.length} kayıt)`);
    } catch (error) {
      log(`! seed-bank yazılamadı: ${error.message}`);
    }
  }
  return SEED_BANK_FALLBACK;
}

function loadCursor() {
  if (existsSync(config.cursorFile)) {
    try {
      const data = JSON.parse(readFileSync(config.cursorFile, "utf8"));
      if (Number.isFinite(data?.position)) return { position: data.position };
    } catch {
      // ignore
    }
  }
  return { position: 0 };
}

function saveCursor() {
  try {
    writeFileSync(config.cursorFile, JSON.stringify(cursor), "utf8");
  } catch {
    // ignore
  }
}

function writeStatus(payload) {
  try {
    writeFileSync(
      config.statusFile,
      JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }, null, 2),
      "utf8"
    );
  } catch (error) {
    log(`! durum dosyası yazılamadı: ${error.message}`);
  }
}

function ensureDataDir() {
  const dir = dirname(config.statusFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function log(message) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[${stamp}] ${message}`);
}

function logHeader() {
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SPIDER AI — Bağımsız İndeks Otomasyonu");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Tur aralığı   : ${config.intervalMs / 60_000} dk`);
  console.log(`  Tur başına    : ${config.maxPages} sayfa, derinlik ${config.maxDepth}`);
  console.log(`  Seed bankası  : ${seedBank.length} kayıt`);
  console.log(`  Tur batch'i   : ${config.batchSize} seed`);
  console.log(`  Mod           : ${onceMode ? "tek-tur" : "sürekli"}`);
  console.log(`  Durum çıktısı : ${config.statusFile}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
}
