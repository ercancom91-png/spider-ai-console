import { foldText } from "./normalizers.js";

export function scoreSearchResult(result, identifiers) {
  const searchableParts =
    typeof result.searchableText === "string"
      ? [result.searchableText, result.url]
      : [result.title, result.snippet, result.body, result.url];
  const combinedText = searchableParts.filter(Boolean).join(" ");
  const folded = foldText(combinedText);
  const digitsOnly = combinedText.replace(/[^\d]/g, "");
  const compactFolded = compactText(folded);
  const foldedTokens = tokenizeFolded(folded);
  const evidence = [];
  let score = 0;

  for (const identifier of identifiers) {
    if (!identifier.valid) {
      continue;
    }

    if (identifier.type === "email") {
      const matched = folded.includes(foldText(identifier.canonical));
      if (matched) {
        evidence.push({
          type: "email",
          label: "E-posta birebir geçti",
          value: identifier.canonical
        });
        score += 50;
      }
    }

    if (identifier.type === "phone") {
      const digitVariants = [
        identifier.canonical,
        ...(identifier.variants || []).map((variant) => variant.replace(/[^\d]/g, ""))
      ].filter((variant) => variant.length >= 7);
      const matched = digitVariants.some((variant) => digitsOnly.includes(variant));
      if (matched) {
        evidence.push({
          type: "phone",
          label: "Telefon rakamları birebir geçti",
          value: identifier.canonical
        });
        score += 45;
      }
    }

    if (identifier.type === "username") {
      const usernameMatch = matchUsername(identifier.canonical, folded, compactFolded, foldedTokens);
      if (usernameMatch.matched) {
        // Sayfada gerçekten eşleşen token (örn. "samil" girildi, "samilsaygili"
        // bulundu) varsa onu da göster — kullanıcı arada ne olduğunu görsün.
        const matched = usernameMatch.matchedToken;
        const isPrefixVariant = matched && matched !== identifier.canonical;
        evidence.push({
          type: "username",
          label:
            usernameMatch.kind === "fuzzy"
              ? "Kullanıcı adı yazım farkıyla eşleşti"
              : isPrefixVariant
                ? "Kullanıcı adı varyantı eşleşti"
                : "Kullanıcı adı eşleşti",
          value: isPrefixVariant
            ? `${identifier.canonical} → ${matched}`
            : identifier.canonical
        });
        // Username ikincil sinyaldir; isim/telefon/e-postayla yan yana geldiğinde
        // confidence'ı yükseltir, tek başına ise tier'ı yukarı çekemez.
        score += usernameMatch.kind === "fuzzy" ? 8 : 12;
      }
    }

    if (identifier.type === "name") {
      const nameMatch = matchName(identifier.canonical, folded, compactFolded, foldedTokens);
      if (nameMatch.matched) {
        evidence.push({
          type: "name",
          label:
            nameMatch.kind === "fuzzy"
              ? "İsim soyisim yazım farkıyla eşleşti"
              : nameMatch.kind === "compact"
                ? "İsim soyisim boşluk farkıyla eşleşti"
                : "İsim soyisim birebir geçti",
          value: identifier.canonical
        });
        score += nameMatch.kind === "fuzzy" ? 14 : 20;
      }
    }
  }

  const directProbeHit = result.sourceType === "profile-probe" && result.evidenceHint === "username-direct-probe";

  const emailEvidence = evidence.some((item) => item.type === "email");
  const phoneEvidence = evidence.some((item) => item.type === "phone");
  const highTrustEvidence = emailEvidence || phoneEvidence;
  const nameEvidence = evidence.some((item) => item.type === "name");
  const usernameEvidence = evidence.some((item) => item.type === "username");
  const fuzzyEvidence = evidence.some((item) =>
    item.label?.includes("yazım farkıyla") || item.label?.includes("boşluk farkıyla")
  );

  const nameIdentifier = identifiers.find((id) => id.type === "name" && id.valid);
  const hasFullName = !!nameIdentifier;
  const surnameConfirmed = hasFullName
    ? surnameTokensPresent(nameIdentifier.canonical, foldedTokens, compactFolded)
    : true;

  // Multi-evidence convergence: more independent identifiers hitting the same
  // source = exponentially higher trust. Pentagon-grade signal: only treat
  // "confirmed" tier when at least two independent strong identifiers agree.
  const evidenceTypes = new Set(evidence.map((item) => item.type));
  const independentSignals = evidenceTypes.size;
  if (independentSignals >= 2) {
    score += 8 * (independentSignals - 1);
  }
  if (emailEvidence && phoneEvidence) score += 12;
  if (highTrustEvidence && nameEvidence) score += 10;
  if (highTrustEvidence && usernameEvidence) score += 6;
  if (directProbeHit && (nameEvidence || emailEvidence)) score += 8;

  let matchLevel = "review";
  let confidence = 0.25;

  if ((emailEvidence && phoneEvidence) || (highTrustEvidence && nameEvidence && usernameEvidence)) {
    matchLevel = "confirmed";
    confidence = 0.97;
  } else if (highTrustEvidence && nameEvidence) {
    matchLevel = "confirmed";
    confidence = 0.93;
  } else if (highTrustEvidence) {
    matchLevel = "strong";
    confidence = 0.85;
  } else if (directProbeHit && nameEvidence) {
    matchLevel = "strong";
    confidence = 0.78;
  } else if (usernameEvidence && nameEvidence) {
    matchLevel = "strong";
    confidence = 0.72;
  } else if (directProbeHit) {
    matchLevel = "review";
    confidence = 0.55;
  } else if (usernameEvidence) {
    matchLevel = "review";
    confidence = 0.4;
  } else if (nameEvidence) {
    matchLevel = "review";
    confidence = 0.45;
  }

  const matchTier = computeMatchTier({
    highTrustEvidence,
    emailEvidence,
    phoneEvidence,
    nameEvidence,
    usernameEvidence,
    fuzzyEvidence,
    score,
    hasFullName,
    surnameConfirmed,
    directProbeHit,
    independentSignals
  });

  const verified =
    (emailEvidence && phoneEvidence) ||
    (highTrustEvidence && nameEvidence && !fuzzyEvidence) ||
    (directProbeHit && (nameEvidence || emailEvidence)) ||
    independentSignals >= 3;

  const privacyState = detectPrivacyState({ combinedText, host: sourceHost(result.url), directProbeHit });

  return {
    ...result,
    evidence,
    score,
    matchLevel,
    matchTier,
    confidence,
    verified,
    independentSignals,
    privacyState
  };
}

const PRIVACY_PATTERNS = [
  /this account is private/i,
  /bu hesap gizlidir/i,
  /bu hesap özel/i,
  /tweets are protected/i,
  /these tweets are protected/i,
  /protected tweets/i,
  /korumalı tweet/i,
  /this profile is private/i,
  /private profile/i,
  /korumal[ıi] hesap/i,
  /follow to see/i,
  /takip ederek g[öo]r/i,
  /private community/i,
  /restricted account/i,
  /access denied/i,
  /viewing this profile/i
];

function detectPrivacyState({ combinedText, host, directProbeHit }) {
  if (!combinedText) {
    return directProbeHit ? "verified" : "unknown";
  }
  for (const pattern of PRIVACY_PATTERNS) {
    if (pattern.test(combinedText)) return "private";
  }
  return directProbeHit ? "verified" : "public";
}

function computeMatchTier({
  highTrustEvidence,
  emailEvidence,
  phoneEvidence,
  nameEvidence,
  usernameEvidence,
  fuzzyEvidence,
  score,
  hasFullName,
  surnameConfirmed,
  directProbeHit,
  independentSignals
}) {
  // Önceliklendirme politikası:
  //   - "direct": en az bir primary identifier (e-posta/telefon) net eşleşti.
  //   - "strong": isim soyisim doğrulandı veya birden çok primary kanıt
  //     yakınsadı.
  //   - "mention": yalnızca username/profile-probe ipucu var ya da fuzzy.
  // Username (ve directProbeHit) tek başına tier'ı yukarı çekemez; isim,
  // telefon veya e-postayla yan yana geldiğinde primary sinyali güçlendirir.

  if (emailEvidence && phoneEvidence) return "direct";
  if (highTrustEvidence && nameEvidence) return "direct";
  if (highTrustEvidence) return "direct";

  // Surname guard: tam isim verildi ama soyad geçmiyorsa username-only / first-
  // name-only sonuçları "mention" seviyesine indir.
  if (hasFullName && !surnameConfirmed && !nameEvidence) return "mention";

  // Birden çok primary identifier birleştiyse "strong"; sadece username dahil
  // independentSignals sayısı şişiyorsa yetmemeli — primary olarak isim varsa
  // anlamlı.
  if (nameEvidence && !fuzzyEvidence && score >= 20) return "strong";
  if (independentSignals >= 3 && nameEvidence) return "strong";

  // Username + name (fuzzy değil) → "strong"; isim sinyali zaten yeterli.
  if (usernameEvidence && nameEvidence && !fuzzyEvidence) return "strong";

  // Username yalnız başına ya da profile-probe baseline → mention.
  return "mention";
}

function surnameTokensPresent(canonicalName, foldedTokens, compactFolded) {
  const tokens = foldText(canonicalName)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

  if (tokens.length < 2) return true;

  // last token == surname in Turkish name ordering; require it to appear
  const surname = tokens[tokens.length - 1];
  if (foldedTokens.includes(surname)) return true;
  if (surname.length >= 5 && compactFolded.includes(surname)) return true;
  return false;
}

const TIER_RANK = { direct: 3, strong: 2, mention: 1 };

export function rankResults(results, identifiers) {
  const hasPrimaryIdentifier = identifiers.some(
    (id) =>
      id.valid && (id.type === "name" || id.type === "email" || id.type === "phone")
  );

  return results
    .map((result) => scoreSearchResult(result, identifiers))
    .filter((result) => result.evidence.length > 0)
    .filter((result) => {
      // Username yardımcı parametre. Kullanıcı isim/telefon/e-posta'dan birini
      // bile girdiyse, sadece username eşleşen sonuçları listeden çıkar — bunlar
      // primary kanıt taşımıyor. Eğer user yalnız username verdiyse (primary
      // yok), o zaman fallback olarak username-only sonuçları geçirelim ki
      // tamamen boş ekran olmasın.
      if (!hasPrimaryIdentifier) return true;
      return result.evidence.some(
        (item) => item.type === "name" || item.type === "email" || item.type === "phone"
      );
    })
    .sort((a, b) => {
      const tierDiff = (TIER_RANK[b.matchTier] || 0) - (TIER_RANK[a.matchTier] || 0);
      if (tierDiff !== 0) return tierDiff;
      return b.score - a.score || b.confidence - a.confidence;
    });
}

export function sourceHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "bilinmeyen kaynak";
  }
}

function matchUsername(username, folded, compactFolded, foldedTokens) {
  const canonical = foldText(username);
  const compact = compactText(canonical);

  if (!compact || compact.length < 3) {
    return { matched: false, kind: "" };
  }

  if (folded.includes(canonical) || compactFolded.includes(compact)) {
    // Hangi token gerçekten eşleşti? Tam eşleşme veya prefix match olabilir
    // (kullanıcı "samil" girdiyse sayfada "samilsaygili" geçiyor olabilir).
    const matchedToken = findMatchedToken(canonical, foldedTokens);
    return { matched: true, kind: "exact", matchedToken };
  }

  if (compact.length < 5) {
    return { matched: false, kind: "" };
  }

  const fuzzyToken = foldedTokens.find((token) => isNearToken(compact, token, usernameMaxDistance(compact)));
  if (fuzzyToken) {
    return { matched: true, kind: "fuzzy", matchedToken: fuzzyToken };
  }
  return { matched: false, kind: "" };
}

// folded text içinde canonical username'in geçtiği gerçek kelimeyi döndür.
// Öncelik: tam eşleşme > prefix-match (samil → samilsaygili) > içerme.
function findMatchedToken(canonical, foldedTokens) {
  if (!canonical) return "";
  if (foldedTokens.includes(canonical)) return canonical;
  for (const token of foldedTokens) {
    if (token.startsWith(canonical) && token !== canonical) return token;
  }
  for (const token of foldedTokens) {
    if (token.includes(canonical) && token !== canonical) return token;
  }
  return canonical;
}

function matchName(name, folded, compactFolded, foldedTokens) {
  const canonical = foldText(name);
  const compact = compactText(canonical);
  const nameTokens = tokenizeFolded(canonical).filter((token) => token.length > 1);

  if (!compact || nameTokens.length < 2) {
    return { matched: false, kind: "" };
  }

  // Tier 1: Tam isim ifadesi geçiyor ("ahmet denizli"). En güçlü sinyal —
  // tokenler bitişik. Ancak soyadı "denizli" gibi yer adıysa ve sayfa
  // sürekli locative kullanıyorsa (Denizli'de, Denizli ili) gerçek bir kişi
  // referansı sayılmaz.
  if (folded.includes(canonical)) {
    if (looksLikeLocationOnly(nameTokens[nameTokens.length - 1], folded)) {
      return { matched: false, kind: "" };
    }
    return { matched: true, kind: "exact" };
  }

  if (compactFolded.includes(compact)) {
    if (looksLikeLocationOnly(nameTokens[nameTokens.length - 1], folded)) {
      return { matched: false, kind: "" };
    }
    return { matched: true, kind: "compact" };
  }

  if (isNearCompactPhrase(compact, compactFolded)) {
    if (looksLikeLocationOnly(nameTokens[nameTokens.length - 1], folded)) {
      return { matched: false, kind: "" };
    }
    return { matched: true, kind: "fuzzy" };
  }

  // Tier 2: Tüm name token'leri sayfada geçiyor. "ahmet" sayfada bir yerde,
  // "denizli" başka yerde geçiyorsa bu kişi-yer çakışması olabilir. Token
  // pozisyonlarının birbirine yakın olduğunu (≤4 slot) doğrula.
  const positions = nameTokens.map((nameToken) =>
    foldedTokens.findIndex((token) => isNearToken(nameToken, token, nameMaxDistance(nameToken)))
  );
  if (positions.some((p) => p < 0)) {
    return { matched: false, kind: "" };
  }

  const minPos = Math.min(...positions);
  const maxPos = Math.max(...positions);
  if (maxPos - minPos > 4) {
    // Tokenler dağınık → muhtemelen rastlantı (örn. ad bir yerde, soyad farklı
    // bağlamda geçiyor). Eşleşme olarak kabul etme.
    return { matched: false, kind: "" };
  }

  // Soyad locative-marked ise (Denizli'de tarzı), reddet.
  if (looksLikeLocationOnly(nameTokens[nameTokens.length - 1], folded)) {
    return { matched: false, kind: "" };
  }

  return { matched: true, kind: "fuzzy" };
}

// Soyad olarak verilen token'in sayfa metninde "şehir" anlamında baskın
// kullanılıp kullanılmadığını belirler. Türkçe locative işaretleri:
//   Denizli'de / Denizli'den / Denizli'ye / Denizli'nin (apostrofla)
//   Denizli ilinde / şehrinde / ilçesinde / ilinden (açıkça yer markerı)
// Apostrofla işaretli + city-marker'lı sayım toplam geçişin %70+'siyse,
// token kişi adı değil yer adı olarak kullanılıyor demektir.
function looksLikeLocationOnly(token, folded) {
  if (!token || token.length < 4) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const totalRe = new RegExp(`\\b${escaped}\\b`, "g");
  const totalMatches = folded.match(totalRe) || [];
  if (totalMatches.length < 2) return false; // tek geçiş için karar verme

  // Apostrof + Türkçe ek (de/den/ye/nin/nde/li) ile takip eden kullanımlar
  const apostropheRe = new RegExp(`\\b${escaped}[\\u0027\\u2018\\u2019]`, "g");
  const apostropheMatches = folded.match(apostropheRe) || [];

  // Açık city marker takibi
  const cityMarkerRe = new RegExp(
    `\\b${escaped}\\s+(?:ili|şehri|ilçesi|ilinde|şehrinde|ilçesinde|ilinden|şehrinden|merkezinde|civarında)\\b`,
    "g"
  );
  const cityMatches = folded.match(cityMarkerRe) || [];

  const locativeCount = apostropheMatches.length + cityMatches.length;
  const ratio = locativeCount / totalMatches.length;
  return locativeCount >= 2 && ratio >= 0.7;
}

function compactText(value) {
  return foldText(value).replace(/[^a-z0-9]/g, "");
}

function tokenizeFolded(value) {
  return foldText(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isNearCompactPhrase(needle, haystack) {
  if (needle.length < 7 || haystack.length < needle.length - 1) {
    return false;
  }

  const maxDistance = Math.max(1, Math.floor(needle.length * 0.18));
  const minLength = Math.max(needle.length - maxDistance, 1);
  const maxLength = needle.length + maxDistance;

  for (let length = minLength; length <= maxLength; length += 1) {
    for (let index = 0; index <= haystack.length - length; index += 1) {
      const candidate = haystack.slice(index, index + length);
      if (levenshteinDistance(needle, candidate, maxDistance) <= maxDistance) {
        return true;
      }
    }
  }

  return false;
}

function isNearToken(needle, token, maxDistance) {
  if (!needle || !token) {
    return false;
  }

  if (needle === token) {
    return true;
  }

  if (
    Math.min(needle.length, token.length) >= 5 &&
    (token.includes(needle) || needle.includes(token))
  ) {
    return true;
  }

  if (Math.abs(needle.length - token.length) > maxDistance) {
    return false;
  }

  return levenshteinDistance(needle, token, maxDistance) <= maxDistance;
}

function usernameMaxDistance(value) {
  if (value.length >= 10) return 2;
  return 1;
}

function nameMaxDistance(value) {
  if (value.length <= 3) return 0;
  if (value.length >= 8) return 2;
  return 1;
}

function levenshteinDistance(a, b, maxDistance = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    let rowMin = current[0];

    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost
      );
      current[column] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[b.length];
}
