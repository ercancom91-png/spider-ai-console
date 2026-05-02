// Telefon numarasını libphonenumber-js ile parse edip ülke/operatör/hat tipi
// metadata'sı çıkar. PhoneInfoga'nın ilk aşamasının (libphonenumber parse)
// karşılığı; harici API isteği yok, tamamen yerel.

import { parsePhoneNumberFromString, getCountries } from "libphonenumber-js/max";

const TR_DIAL_PREFIX = "+90";

// Hat türü insan-okunur etiketler.
const TYPE_LABEL = {
  MOBILE: "Cep telefonu",
  FIXED_LINE: "Sabit hat",
  FIXED_LINE_OR_MOBILE: "Sabit hat veya cep",
  TOLL_FREE: "Ücretsiz hat (toll-free)",
  PREMIUM_RATE: "Premium ücretli hat",
  SHARED_COST: "Paylaşımlı maliyet hat",
  VOIP: "VoIP",
  PERSONAL_NUMBER: "Kişisel numara servisi",
  PAGER: "Çağrı cihazı",
  UAN: "UAN (kurumsal)",
  VOICEMAIL: "Sesli posta"
};

export function buildPhoneInsight(rawPhone, defaultCountry = "TR") {
  if (!rawPhone || typeof rawPhone !== "string") return null;

  // Verilmiş ham telefonun + ile başlayıp başlamamasına göre uygun parse stratejisi.
  // libphonenumber-js, "+90 555 ..." ile başlayan girişlerde defaultCountry'ye gerek
  // duymadan ülkeyi bulur. Aksi halde TR varsayalım (proje TR-merkezli).
  const trimmed = rawPhone.trim();
  const hasIntlPrefix = trimmed.startsWith("+");
  let parsed;
  try {
    parsed = parsePhoneNumberFromString(trimmed, hasIntlPrefix ? undefined : defaultCountry);
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // 10 haneli TR formatları (5XX...) için fallback
    const digits = trimmed.replace(/[^\d]/g, "");
    if (digits.length === 10 && digits.startsWith("5")) {
      try {
        parsed = parsePhoneNumberFromString(`+90${digits}`);
      } catch {
        parsed = null;
      }
    }
    if (!parsed) return null;
  }

  const isValid = typeof parsed.isValid === "function" ? parsed.isValid() : false;
  const type = typeof parsed.getType === "function" ? parsed.getType() : null;
  const country = parsed.country || null;
  const e164 = typeof parsed.format === "function" ? parsed.format("E.164") : "";
  const intl = typeof parsed.formatInternational === "function" ? parsed.formatInternational() : "";
  const national = typeof parsed.formatNational === "function" ? parsed.formatNational() : "";

  return {
    isValid,
    country,                         // ISO-3166-1 alpha-2 ("TR", "DE", ...)
    countryCallingCode: parsed.countryCallingCode ? `+${parsed.countryCallingCode}` : "",
    nationalNumber: parsed.nationalNumber || "",
    e164,
    international: intl,
    national,
    type: type || "UNKNOWN",
    typeLabel: TYPE_LABEL[type] || "Bilinmiyor",
    isMobile: type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE",
    isPossibleSpoof: !isValid,
    // PhoneInfoga'nın google-dork katmanı — buradan UI / arama provider'larına aktarılır.
    dorks: buildDorks(parsed, e164, national)
  };
}

function buildDorks(parsed, e164, national) {
  const variants = new Set();
  if (e164) variants.add(e164);
  if (national) variants.add(national);
  if (parsed.formatInternational) variants.add(parsed.formatInternational());
  // boşluksuz uluslararası
  if (e164) variants.add(e164.replace(/\s+/g, ""));

  const v = [...variants].filter(Boolean);
  const dorks = [];

  // Generic intext
  for (const variant of v) dorks.push(`intext:"${variant}"`);

  // Scam / lookup raporları (TR + intl)
  const lookupSites = [
    "telefonrehberi.org",
    "kimo.com.tr",
    "reverse-lookup.com.tr",
    "shouldianswer.com",
    "shouldianswer.net",
    "scamcallfighters.com",
    "spamcalls.net",
    "tellows.com",
    "tellows.de",
    "tellows.co.uk",
    "tellows.com.tr",
    "whocalled.us"
  ];
  for (const site of lookupSites) {
    if (v[0]) dorks.push(`site:${site} "${v[0]}"`);
  }

  // Sosyal medya site:operator dorks
  const socialSites = ["facebook.com", "linkedin.com", "twitter.com", "x.com", "instagram.com"];
  for (const site of socialSites) {
    if (v[0]) dorks.push(`site:${site} "${v[0]}"`);
  }

  return dorks.slice(0, 24);
}

export function isSupportedCountry(iso2) {
  return getCountries().includes(iso2);
}
