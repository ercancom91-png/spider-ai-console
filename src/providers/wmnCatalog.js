// WhatsMyName katalog adaptörü.
// Veri kaynağı: https://github.com/WebBreacher/WhatsMyName (data/wmn/wmn-data.json)
// Lisans: MIT — kataloğu doğrudan paketleyip kullanmamıza izin veriyor.
//
// WMN şeması (per site):
//   { name, uri_check, e_code, e_string, m_code, m_string, known, cat,
//     uri_pretty?, protection?, post_body?, headers?, strip_bad_char? }
//
// Bu modül kataloğu yükler, mevcut PLATFORMS dizisine eşdeğer şekle çevirir
// (method: "wmn"), ve probe çalıştırıcısı sağlar.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WMN_PATH = join(__dirname, "..", "..", "data", "wmn", "wmn-data.json");

let cache = null;

function loadCatalog() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(readFileSync(WMN_PATH, "utf-8"));
    cache = Array.isArray(raw?.sites) ? raw.sites : [];
  } catch {
    cache = [];
  }
  return cache;
}

// WMN kategorilerini bizim taxonomy bucket'larına eşle.
const CATEGORY_MAP = {
  social: "social",
  blog: "social",
  dating: "social",
  "social-network": "social",
  coding: "developer",
  tech: "developer",
  programming: "developer",
  hacker: "developer",
  business: "professional",
  finance: "professional",
  professional: "professional",
  hobby: "creator",
  music: "creator",
  art: "design",
  design: "design",
  photo: "design",
  video: "creator",
  gaming: "gaming",
  games: "gaming",
  health: "creator",
  shopping: "commerce",
  news: "creator",
  archived: "creator",
  political: "creator",
  sport: "creator",
  travel: "creator"
};

function mapCategory(wmnCat) {
  if (!wmnCat) return "identity";
  return CATEGORY_MAP[wmnCat.toLowerCase()] || "identity";
}

// Hand-tuned API platformlarıyla overlap'ı önlemek için hostname blacklist.
// Bu host'ları içeren WMN girdileri atlanır.
const SKIP_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "news.ycombinator.com",
  "keybase.io",
  "gravatar.com",
  "en.gravatar.com",
  "lichess.org",
  "codeforces.com",
  "kick.com",
  "huggingface.co",
  "modrinth.com",
  "bsky.app",
  "namemc.com",
  "api.mojang.com"
]);

function hostFromUrl(url) {
  try {
    return new URL(url.replace(/\{account\}/g, "x")).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getWmnPlatforms() {
  const sites = loadCatalog();
  const out = [];

  for (const site of sites) {
    if (site.valid === false) continue;
    if (!site.uri_check || !site.e_string || !site.m_string) continue;

    const host = hostFromUrl(site.uri_check);
    if (!host) continue;
    if (SKIP_HOSTS.has(host)) continue;

    out.push({
      key: `wmn:${site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: site.name,
      category: mapCategory(site.cat),
      method: "wmn",
      // WMN-specific
      uriCheck: site.uri_check,
      uriPretty: site.uri_pretty || site.uri_check,
      eCode: site.e_code,
      eString: site.e_string,
      mCode: site.m_code,
      mString: site.m_string,
      protection: site.protection || null,
      postBody: site.post_body || null,
      customHeaders: site.headers || null,
      stripBadChar: site.strip_bad_char || null,
      known: Array.isArray(site.known) ? site.known : []
    });
  }

  return out;
}

// Verilen kullanıcı adıyla bir WMN platformuna probe at; bulundu/bulunmadı/bilinmiyor sonucu döndür.
//
// Karar tablosu:
//   eCode + eString eşleşti  → exists (high confidence)
//   mCode + mString eşleşti  → missing (high confidence)
//   ne biri ne öbürü         → unknown (CDN/login wall — kataloğun "protection" flag'i de bunu işaretler)
//
// Geri dönüş: { state: "exists"|"missing"|"unknown", confidence, status, url }
export async function runWmnProbe(platform, username, fetchImpl) {
  let handle = username;
  if (platform.stripBadChar) {
    const re = new RegExp(`[${platform.stripBadChar.replace(/[\\^\]]/g, "\\$&")}]`, "g");
    handle = handle.replace(re, "");
  }
  const encoded = encodeURIComponent(handle);
  const url = platform.uriCheck.replace(/\{account\}/g, encoded);
  const prettyUrl = (platform.uriPretty || platform.uriCheck).replace(/\{account\}/g, encoded);

  const init = {
    method: platform.postBody ? "POST" : "GET",
    headers: platform.customHeaders || {},
    redirect: "follow"
  };
  if (platform.postBody) {
    init.body = platform.postBody.replace(/\{account\}/g, encoded);
  }

  const response = await fetchImpl(url, init);
  const status = response?.status ?? 0;
  const text = response?.text ?? "";

  const eCodeMatch = status === platform.eCode;
  const mCodeMatch = status === platform.mCode;
  const eStringMatch = platform.eString && text.includes(platform.eString);
  const mStringMatch = platform.mString && text.includes(platform.mString);

  // Two-sided check — both code and body must agree.
  if (eCodeMatch && eStringMatch) {
    return {
      state: "exists",
      confidence: platform.protection ? 0.7 : 0.92,
      status,
      url: prettyUrl
    };
  }
  if (mCodeMatch && mStringMatch) {
    return { state: "missing", confidence: 0.95, status, url: prettyUrl };
  }
  // Tek taraflı sinyal — emin değiliz.
  return { state: "unknown", confidence: 0.4, status, url: prettyUrl };
}
