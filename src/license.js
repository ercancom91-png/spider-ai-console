import { createHmac, randomBytes } from "node:crypto";
import { config } from "./config.js";

const TIER_CODE = { free: "F", premium: "P" };
const CODE_TIER = { F: "free", P: "premium" };

function getSecret() {
  return config.licenseSecret || "spider-ai-default-dev-secret-change-me";
}

/**
 * License format: SPDR-<TIER><EXPIRY_BASE36>-<NONCE>-<SIG6>
 * - TIER: 1 char (F=free, P=premium)
 * - EXPIRY_BASE36: days-since-epoch in base36 (0 = no expiry)
 * - NONCE: 8 hex chars
 * - SIG6: first 6 hex chars of HMAC-SHA256
 */
export function generateLicense({ tier = "premium", days = 30 } = {}) {
  const tierCode = TIER_CODE[tier] || "F";
  const expiry = days > 0 ? Math.floor(Date.now() / 86_400_000) + days : 0;
  const expiryStr = expiry.toString(36).toUpperCase().padStart(4, "0");
  const nonce = randomBytes(4).toString("hex").toUpperCase();
  const payload = `${tierCode}${expiryStr}-${nonce}`;
  const sig = sign(payload);
  return `SPDR-${tierCode}${expiryStr}-${nonce}-${sig}`;
}

export function validateLicense(rawKey = "") {
  if (typeof rawKey !== "string") return invalid("Geçersiz format.");
  const key = rawKey.trim().toUpperCase();
  if (!key.startsWith("SPDR-")) return invalid("Anahtar SPDR- ile başlamalı.");

  const body = key.slice(5);
  const parts = body.split("-");
  if (parts.length !== 3) return invalid("Anahtar formatı bozuk.");

  const [head, nonce, sig] = parts;
  const tierCode = head[0];
  const expiryStr = head.slice(1);
  const tier = CODE_TIER[tierCode];
  if (!tier) return invalid("Bilinmeyen abonelik kademesi.");

  const expectedSig = sign(`${head}-${nonce}`);
  if (sig !== expectedSig) return invalid("İmza eşleşmiyor (sahte veya bozuk anahtar).");

  const expiryDays = parseInt(expiryStr, 36);
  if (!Number.isFinite(expiryDays)) return invalid("Geçersiz son kullanma alanı.");

  let expiresAt = null;
  let daysLeft = null;
  if (expiryDays > 0) {
    expiresAt = new Date(expiryDays * 86_400_000).toISOString();
    daysLeft = expiryDays - Math.floor(Date.now() / 86_400_000);
    if (daysLeft < 0) return invalid("Anahtar süresi doldu.");
  }

  return {
    valid: true,
    tier,
    expiresAt,
    daysLeft
  };
}

function sign(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("hex").slice(0, 6).toUpperCase();
}

function invalid(reason) {
  return { valid: false, tier: "free", reason };
}

export function readLicenseFromHeaders(headers = {}) {
  const raw = headers["x-license-key"] || headers["x-license"];
  if (!raw) return { valid: false, tier: "free" };
  return validateLicense(raw);
}
