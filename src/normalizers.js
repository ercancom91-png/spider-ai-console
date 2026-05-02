import { config } from "./config.js";
import { searchScopeDomains } from "./taxonomy.js";
import { buildPhoneInsight } from "./phoneInsight.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

export function normalizeName(name = "") {
  return name.trim().replace(/\s+/g, " ");
}

export function foldText(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i");
}

export function normalizePhone(phone = "") {
  const raw = phone.trim();
  const digits = raw.replace(/[^\d]/g, "");

  return {
    raw,
    digits,
    variants: buildPhoneVariants(raw, digits)
  };
}

function buildPhoneVariants(raw, digits) {
  const variants = new Set();
  const compactRaw = raw.replace(/\s+/g, " ").trim();

  if (compactRaw) {
    variants.add(compactRaw);
  }

  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);

    if (digits.length === 10) {
      variants.add(`${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`);
    }

    if (digits.length === 12 && digits.startsWith("90")) {
      variants.add(`+90 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`);
      variants.add(`0${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`);
    }
  }

  return [...variants].filter(Boolean);
}

export function normalizeSubject(input = {}) {
  const primaryQuery = normalizeName(input.fullName);
  const primaryEmail = emailFromPrimaryQuery(primaryQuery);
  const primaryPhone = phoneFromPrimaryQuery(primaryQuery);
  const explicitUsername = normalizeUsername(input.username);
  const fullName = primaryEmail || primaryPhone ? "" : primaryQuery;
  const email = normalizeEmail(input.email || primaryEmail);
  const username =
    explicitUsername || usernameFromEmail(email) || usernameFromPrimaryQuery(primaryQuery, primaryEmail, primaryPhone);
  const phone = normalizePhone(input.phone || primaryPhone);
  const photoHash = typeof input.photoHash === "string" ? input.photoHash.trim() : "";
  const visualFingerprint = normalizeVisualFingerprint(input.visualFingerprint);
  const identifiers = [];

  if (email) {
    identifiers.push({
      type: "email",
      label: "E-posta",
      canonical: email,
      variants: [email],
      valid: EMAIL_PATTERN.test(email)
    });
  }

  if (username) {
    identifiers.push({
      type: "username",
      label: "Kullanıcı adı",
      canonical: username,
      variants: [username],
      valid: username.length >= 3
    });
  }

  if (phone.digits) {
    identifiers.push({
      type: "phone",
      label: "Telefon",
      canonical: phone.digits,
      variants: phone.variants,
      valid: phone.digits.length >= 7
    });
  }

  if (fullName) {
    identifiers.push({
      type: "name",
      label: "İsim soyisim",
      canonical: fullName,
      variants: [fullName],
      valid: fullName.split(" ").length >= 2
    });
  }

  if (photoHash) {
    identifiers.push({
      type: "photoHash",
      label: "Fotoğraf hash",
      canonical: photoHash,
      variants: [photoHash],
      valid: /^[a-f0-9]{64}$/i.test(photoHash)
    });
  }

  return {
    fullName,
    email,
    username,
    phone,
    photoHash,
    visualFingerprint,
    identifiers
  };
}

function normalizeVisualFingerprint(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const averageHash = typeof value.averageHash === "string" ? value.averageHash.trim().toLowerCase() : "";
  const colorSignature =
    typeof value.colorSignature === "string" ? value.colorSignature.trim().toLowerCase() : "";
  const sha256 = typeof value.sha256 === "string" ? value.sha256.trim().toLowerCase() : "";
  const width = Number(value.width);
  const height = Number(value.height);
  const aspectRatio = Number(value.aspectRatio);

  if (!/^[a-f0-9]{16}$/.test(averageHash)) {
    return null;
  }

  return {
    sha256: /^[a-f0-9]{64}$/.test(sha256) ? sha256 : "",
    averageHash,
    colorSignature: /^[a-f0-9]{6}$/.test(colorSignature) ? colorSignature : "",
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
    aspectRatio: Number.isFinite(aspectRatio) ? aspectRatio : 0
  };
}

export function buildSearchQueries(subject, options = {}) {
  const queries = [];
  const exactTerms = [];
  const scanDepth = normalizeScanDepth(options.scanDepth);

  for (const identifier of subject.identifiers) {
    if (!identifier.valid || identifier.type === "photoHash") {
      continue;
    }

    if (identifier.type === "email") {
      queries.push(`"${identifier.canonical}"`);
      exactTerms.push(identifier.canonical);
    }

    if (identifier.type === "username") {
      queries.push(`"${identifier.canonical}"`);
      exactTerms.push(identifier.canonical);
    }

    if (identifier.type === "phone") {
      for (const variant of identifier.variants.slice(0, 4)) {
        queries.push(`"${variant}"`);
      }
      exactTerms.push(identifier.variants[0] || identifier.canonical);
    }

    if (identifier.type === "name" && (subject.email || subject.phone.digits)) {
      queries.push(`"${identifier.canonical}" "${subject.email || subject.phone.digits}"`);
    }
  }

  if (subject.fullName) {
    const nameTerms = nameSearchTerms(subject.fullName);

    if (!subject.email && !subject.phone.digits) {
      for (const term of nameTerms) {
        queries.push(term.includes(" ") ? `"${term}"` : term);
      }
    }

    for (const term of nameTerms) {
      exactTerms.push(term);
    }
  }

  const scopedDomains = searchScopeDomains({
    includeSensitiveSources: options.includeSensitiveSources === true,
    scanDepth
  });

  const scopedTerms = exactTerms.slice(0, scanDepth === "maximum" ? 3 : 2);
  for (const domain of scopedDomains) {
    for (const term of scopedTerms) {
      queries.push(term.includes(" ") ? `site:${domain} "${term}"` : `site:${domain} ${term}`);
    }
  }

  // PhoneInfoga-style dork enrichment: telefon insight'i mevcutsa scam-report
  // ve direktorı sitelerine yönelik özel dork'ları sorgu listesine ekle.
  if (subject.phone?.raw) {
    const insight = buildPhoneInsight(subject.phone.raw);
    if (insight?.dorks?.length) {
      const dorkBudget = scanDepth === "maximum" ? 24 : scanDepth === "wide" ? 16 : 8;
      for (const dork of insight.dorks.slice(0, dorkBudget)) {
        queries.push(dork);
      }
    }
  }

  return [...new Set(queries)].slice(0, maxQueriesForDepth(scanDepth));
}

function nameSearchTerms(fullName) {
  const normalized = normalizeName(fullName);
  const folded = foldText(normalized);
  const compact = folded.replace(/[^a-z0-9]/g, "");
  const dotted = folded.replace(/\s+/g, ".");
  const dashed = folded.replace(/\s+/g, "-");
  const underscored = folded.replace(/\s+/g, "_");
  const reversed = folded.split(/\s+/).reverse().join(" ");
  const initialed = (() => {
    const parts = folded.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return "";
    return `${parts[0][0]}.${parts.slice(1).join(" ")}`;
  })();
  const terms = [normalized];

  if (folded && folded !== normalized.toLocaleLowerCase("tr")) {
    terms.push(folded);
  }

  if (compact && compact.length >= 5) {
    terms.push(compact);
  }

  if (dotted && dotted !== folded) terms.push(dotted);
  if (dashed && dashed !== folded) terms.push(dashed);
  if (underscored && underscored !== folded) terms.push(underscored);
  if (reversed && reversed !== folded) terms.push(reversed);
  if (initialed) terms.push(initialed);

  return [...new Set(terms)].slice(0, 8);
}

function usernameFromEmail(email) {
  const [user] = email.split("@");
  if (!user || user.length < 3) {
    return "";
  }

  return user.replace(/[^a-z0-9._-]/gi, "").toLowerCase();
}

function normalizeUsername(value = "") {
  return String(value)
    .trim()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]/gi, "")
    .toLowerCase();
}

function emailFromPrimaryQuery(value = "") {
  const email = normalizeEmail(value);
  return EMAIL_PATTERN.test(email) ? email : "";
}

function phoneFromPrimaryQuery(value = "") {
  if (/[a-zğüşöçıİĞÜŞÖÇ]/i.test(value)) {
    return "";
  }

  const digits = value.replace(/[^\d]/g, "");
  return digits.length >= 7 ? value : "";
}

function usernameFromPrimaryQuery(value = "", primaryEmail = "", primaryPhone = "") {
  if (!value || primaryEmail || primaryPhone || /\s/.test(value)) {
    return "";
  }

  const username = normalizeUsername(value);
  return username.length >= 3 ? username : "";
}

function normalizeScanDepth(scanDepth) {
  if (scanDepth === "wide" || scanDepth === "maximum") {
    return scanDepth;
  }

  return "balanced";
}

function maxQueriesForDepth(scanDepth) {
  if (scanDepth === "maximum") {
    return Math.max(config.maxSearchQueries, 640);
  }

  if (scanDepth === "wide") {
    return Math.max(Math.min(config.maxSearchQueries, 360), 220);
  }

  return Math.max(Math.min(config.maxSearchQueries, 160), 100);
}
