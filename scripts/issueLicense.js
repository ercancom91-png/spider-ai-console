#!/usr/bin/env node
import { generateLicense, validateLicense } from "../src/license.js";

const [, , tier = "premium", daysArg = "30"] = process.argv;
const days = Number(daysArg);

if (!["free", "premium"].includes(tier)) {
  console.error("Kullanım: node scripts/issueLicense.js <free|premium> <days>");
  process.exit(1);
}

const key = generateLicense({ tier, days: Number.isFinite(days) ? days : 30 });
const verification = validateLicense(key);

console.log("Yeni lisans key üretildi:");
console.log("");
console.log(`   ${key}`);
console.log("");
console.log("Doğrulama:");
console.log(JSON.stringify(verification, null, 2));
console.log("");
console.log("Notlar:");
console.log("- LICENSE_SECRET env değişkeni production'da MUTLAKA tanımlanmalı.");
console.log("- Aynı secret olmadan üretilen key başka makinede doğrulanamaz.");
