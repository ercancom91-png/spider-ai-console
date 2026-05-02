import { rankResults, sourceHost } from "./matching.js";
import { publicSubjectView } from "./privacy.js";
import { buildResultRemediation } from "./remediation.js";
import { buildCategorySummary, classifyResult, publicSearchSources } from "./taxonomy.js";
import { buildPhoneInsight } from "./phoneInsight.js";

export function buildAuditReport({
  subject,
  rawResults,
  warnings,
  searchOptions = {},
  providerStatus = [],
  realSearchAvailable = false
}) {
  const dedupedRaw = dedupeRawResults(rawResults);
  const ranked = rankResults(dedupedRaw, subject.identifiers).map((result) => {
    const classification = classifyResult(result);
    const remediation = buildResultRemediation({ ...result, classification });

    return redactResultForDisplay({
      ...result,
      classification,
      remediation
    });
  });
  const sources = new Map();

  for (const result of ranked) {
    const host = sourceHost(result.url);
    sources.set(host, (sources.get(host) || 0) + 1);
  }

  const confirmed = ranked.filter((result) => result.matchLevel === "confirmed").length;
  const strong = ranked.filter((result) => result.matchLevel === "strong").length;
  const review = ranked.filter((result) => result.matchLevel === "review").length;

  const tiers = {
    direct: ranked.filter((r) => r.matchTier === "direct").length,
    strong: ranked.filter((r) => r.matchTier === "strong").length,
    mention: ranked.filter((r) => r.matchTier === "mention").length
  };

  const verifiedCount = ranked.filter((r) => r.verified).length;

  return {
    auditId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    subject: publicSubjectView(subject),
    summary: {
      totalCandidates: rawResults.length,
      dedupedCandidates: dedupedRaw.length,
      exactEvidenceResults: ranked.length,
      confirmed,
      strong,
      review,
      verified: verifiedCount,
      tiers,
      uniqueSources: sources.size,
      discardedCandidates: Math.max(dedupedRaw.length - ranked.length, 0),
      scanDepth: searchOptions.scanDepth || "balanced",
      includesSensitiveSources: searchOptions.includeSensitiveSources === true,
      realSearchAvailable,
      liveCandidateReason: buildLiveCandidateReason(providerStatus, rawResults.length, ranked.length)
    },
    guardrails: [
      "Rapor ekranı ham sayfa kopyası göstermez; kaynak linki, kısa özet, kategori ve eşleşme etiketi gösterir.",
      "SPIDER Index seed verilen açık sayfaların görünür metnini bu makinedeki lokal SQLite indexe yazar; uzak bir servise göndermez.",
      "Sonuçlar kaynak, kategori ve kaldırma adımıyla sınırlıdır; kişi hakkında yeni profil veya davranış çıkarımı üretilmez.",
      "Fotoğraf dosyası sunucuya yüklenmez; tarayıcıda görsel fingerprint üretilir ve public görsel sonuçlarıyla birlikte gösterilir.",
      "Açık erişimli kaynaklar sınıflandırılır; giriş, captcha veya ödeme duvarı aşma yapılmaz."
    ],
    sources: [...sources.entries()].map(([host, count]) => ({ host, count })),
    categories: buildCategorySummary(ranked),
    providers: providerStatus,
    searchSources: publicSearchSources(searchOptions),
    visualSearch: buildVisualSearch({ subject, results: ranked }),
    phoneInsight: subject.phone?.raw ? buildPhoneInsight(subject.phone.raw) : null,
    scannedCandidates: buildScannedCandidates(dedupedRaw),
    results: ranked,
    warnings
  };
}

// UI'da "İncelenen Kaynaklar" listesi için ham aday URL'leri çıkar.
// Eşleşme akışı 0 sonuç verse bile kullanıcı tarama izini görebilsin.
function buildScannedCandidates(dedupedRaw) {
  if (!Array.isArray(dedupedRaw)) return [];
  return dedupedRaw
    .map((r) => ({
      url: r?.url || "",
      host: sourceHost(r?.url || ""),
      title: typeof r?.title === "string" ? r.title.slice(0, 220) : "",
      provider: r?.provider || "",
      sourceType: r?.sourceType || ""
    }))
    .filter((r) => r.url);
}

function dedupeRawResults(results = []) {
  const seen = new Map();
  for (const result of results) {
    const key = canonicalUrlKey(result?.url);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, result);
      continue;
    }
    // prefer richer record (longer snippet/title, profile-probe over generic)
    const existingScore = recordRichness(existing);
    const incomingScore = recordRichness(result);
    if (incomingScore > existingScore) seen.set(key, result);
  }
  return [...seen.values()];
}

function canonicalUrlKey(url) {
  if (typeof url !== "string" || !url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.host.replace(/^www\./, "").toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function recordRichness(result) {
  let score = 0;
  if (result?.sourceType === "profile-probe") score += 4;
  if (result?.sourceType === "self-made-live") score += 2;
  if (result?.snippet) score += Math.min(result.snippet.length / 80, 3);
  if (result?.images?.length) score += 1;
  if (result?.title) score += Math.min(result.title.length / 40, 1);
  return score;
}

function buildLiveCandidateReason(providerStatus, candidateCount, evidenceCount) {
  const knockLive = providerStatus.find((provider) => provider.kind === "self-made-live");
  const diagnostics = knockLive?.diagnostics;

  if (!diagnostics) {
    return "";
  }

  if (evidenceCount > 0) {
    return `${candidateCount} canlı sonuç tarandı; ${evidenceCount} kaynak eşleşme kuralını geçti. E-posta, telefon, kullanıcı adı veya isimden en az biri uyuşmadan sonuç kartı açılmaz.`;
  }

  return `${candidateCount} canlı sonuç tarandı; hiçbiri e-posta, telefon, kullanıcı adı veya isim soyisim için yeterli eşleşme taşımadığı için sonuç listesine alınmadı. Limit nedeni: ${diagnostics.reason}`;
}

function redactResultForDisplay(result) {
  if (result.classification.sensitivity === "adult") {
    return {
      ...result,
      snippet:
        "Bu sonuç hassas kaynak kategorisinde. Kısa özet gizlendi; kaynak linki, kategori ve kaldırma adımları gösteriliyor.",
      snippetRedacted: true
    };
  }

  if (result.classification.sensitivity === "high-risk") {
    return {
      ...result,
      snippet:
        "Bu sonuç riskli yayın veya sızıntı kategorisinde. Gereksiz yayılımı azaltmak için ayrıntılı özet gizlendi.",
      snippetRedacted: true
    };
  }

  return result;
}

function buildVisualSearch({ subject, results }) {
  const queryImage = subject.visualFingerprint
    ? {
        dimensions:
          subject.visualFingerprint.width && subject.visualFingerprint.height
            ? `${subject.visualFingerprint.width}x${subject.visualFingerprint.height}`
            : "boyut bilinmiyor",
        averageHashPrefix: subject.visualFingerprint.averageHash.slice(0, 8),
        colorSignature: subject.visualFingerprint.colorSignature,
        matchBasis: "aHash + renk imzası"
      }
    : null;
  const visualResults = [];

  for (const result of results) {
    for (const image of normalizeResultImages(result.images)) {
      const visualMatch = describeVisualMatch({ image, result, subject });
      visualResults.push({
        title: result.title || sourceHost(result.url),
        pageUrl: result.url,
        imageUrl: image.url,
        alt: image.alt,
        source: sourceHost(result.url),
        matchType: visualMatch.matchType,
        confidence: visualMatch.confidence
      });
    }
  }

  return {
    queryImage,
    results: dedupeVisualResults(visualResults)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 18)
  };
}

function normalizeResultImages(images = []) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => ({
      url: typeof image.url === "string" ? image.url : "",
      alt: typeof image.alt === "string" ? image.alt : "",
      kind: typeof image.kind === "string" ? image.kind : "page-image"
    }))
    .filter((image) => isDisplayableImageUrl(image.url))
    .slice(0, 8);
}

function isDisplayableImageUrl(url) {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/");
}

function describeVisualMatch({ image, result, subject }) {
  const haystack = [image.alt, image.url, result.title, result.snippet].join(" ").toLocaleLowerCase("tr");
  const nameHit = subject.fullName && haystack.includes(subject.fullName.toLocaleLowerCase("tr"));
  const usernameHit = subject.username && haystack.includes(subject.username.toLocaleLowerCase("tr"));
  const exactHashHit = subject.photoHash && haystack.includes(subject.photoHash.toLocaleLowerCase("tr"));

  if (exactHashHit) {
    return { matchType: "Aynı dosya hash izi", confidence: 0.98 };
  }

  if (image.kind === "profile-avatar" && (nameHit || usernameHit)) {
    return { matchType: "Profil görseli + isim sinyali", confidence: 0.78 };
  }

  if (image.kind === "profile-avatar") {
    return { matchType: "Profil/avatar görseli", confidence: 0.68 };
  }

  if (nameHit || usernameHit) {
    return { matchType: "Görsel metadata eşleşmesi", confidence: 0.64 };
  }

  return { matchType: "Eşleşen kaynağa bağlı görsel", confidence: 0.52 };
}

function dedupeVisualResults(results) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    if (seen.has(result.imageUrl)) continue;
    seen.add(result.imageUrl);
    deduped.push(result);
  }

  return deduped;
}
