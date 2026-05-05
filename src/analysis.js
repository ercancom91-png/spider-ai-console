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

  // Toplam denenen kaynak sayısı: profile-probe katalog + email-probe modülleri
  // + her web search engine. UI bunu "X kaynak denendi" başlığında gösteriyor.
  let totalAttempted = 0;
  for (const provider of providerStatus || []) {
    if (provider.kind === "profile-probe") {
      totalAttempted += provider.diagnostics?.platformsTotal || 0;
    } else if (provider.kind === "email-probe") {
      totalAttempted += provider.diagnostics?.modulesTotal || 0;
    } else {
      totalAttempted += 1;
    }
  }

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
      totalAttempted,
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
    attemptedSources: buildAttemptedSources(providerStatus, dedupedRaw),
    results: ranked,
    warnings
  };
}

// Profile-probe + email-probe + WMN katalog: tüm denenmiş platformların
// hit/miss durumunu UI'a aktar. Kullanıcı "750 site denendi" gerçeğini her
// satırda görsün — yeşil nokta = profil bulundu, gri = bulunamadı, sarı =
// CDN/login wall yüzünden belirsiz. Ayrıca web search engine'lerin per-engine
// sonuç sayısını da ekler.
function buildAttemptedSources(providerStatus, dedupedRaw) {
  if (!Array.isArray(providerStatus)) return [];
  const hitUrls = new Set((dedupedRaw || []).map((r) => r?.url).filter(Boolean));
  const hitHosts = new Set();
  for (const url of hitUrls) {
    try {
      hitHosts.add(new URL(url).host.replace(/^www\./, ""));
    } catch {
      /* skip */
    }
  }

  const out = [];

  for (const provider of providerStatus) {
    // Profile probe — denenen tüm platformları açıkça listele.
    if (provider.kind === "profile-probe" && Array.isArray(provider.diagnostics?.probedPlatforms)) {
      const hitKeys = new Set(provider.diagnostics.hitPlatforms || []);
      for (const platform of provider.diagnostics.probedPlatforms) {
        const host = (platform.host || "").replace(/^www\./, "");
        const isHit = hitHosts.has(host) || (platform.key && hitKeys.has(platform.key));
        out.push({
          name: platform.name,
          host,
          category: platform.category,
          source: platform.source || "probe",
          providerName: provider.name,
          status: isHit ? "hit" : "miss"
        });
      }
      continue;
    }

    // Email probe — denenen tüm modülleri listele.
    if (provider.kind === "email-probe" && Array.isArray(provider.diagnostics?.probedModules)) {
      const hits = new Set(provider.diagnostics.hitModules || []);
      for (const moduleEntry of provider.diagnostics.probedModules) {
        out.push({
          name: moduleEntry.name,
          host: moduleEntry.host || moduleEntry.name,
          category: "email-probe",
          source: "email-probe",
          providerName: provider.name,
          status: hits.has(moduleEntry.name) ? "hit" : "miss"
        });
      }
      continue;
    }

    // Web search engine'ler — fulfilled / failed / skipped + sonuç sayısı.
    if (["web-search", "self-made-live", "self-hosted-index", "developer", "community-forum", "archive", "knowledge-base"].includes(provider.kind)) {
      out.push({
        name: provider.name,
        host: provider.name,
        category: provider.kind,
        source: "search-engine",
        providerName: provider.name,
        status: provider.status === "fulfilled"
          ? (provider.resultCount > 0 ? "hit" : "miss")
          : provider.status === "skipped" ? "skipped" : "failed",
        resultCount: provider.resultCount || 0,
        reason: provider.reason || null
      });
    }
  }

  return out;
}

// Search engine indekslerinde bazen 404 / hata sayfalarına çıkan URL'ler kalır.
// Filtreden geçen sonuçlarda kullanıcı bu linklere tıklayınca boş sayfa gelir.
// Sonucu listeye almadan önce URL'in açıkça "ölü" örüntüye sahip olup
// olmadığını kontrol et — daha derin liveness check için HEAD pahalı, bu basit
// pattern filtresi en yaygın sahte sonuçları eliyor.
function looksLikeDeadUrl(url) {
  if (typeof url !== "string" || !url) return true;
  const lowered = url.toLowerCase();
  // Path-level "not found" işaretleri
  if (/\/(404|not[-_]?found|page[-_]?not[-_]?found|gone|errors?|missing|deleted)(?:[/?#]|$)/.test(lowered)) {
    return true;
  }
  // Query string'te hata kodu
  if (/[?&](?:error|err|code|status)=(?:404|410|451|deleted|removed|notfound)\b/.test(lowered)) {
    return true;
  }
  // Bazı sosyal platformların "user does not exist" yönlendirme deseni
  if (/\/_\/(?:gone|deactivated|deleted)/.test(lowered)) return true;
  return false;
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
    if (looksLikeDeadUrl(result?.url)) continue;
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
