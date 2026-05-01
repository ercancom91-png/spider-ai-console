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
        evidence.push({
          type: "username",
          label:
            usernameMatch.kind === "fuzzy"
              ? "Kullanıcı adı yazım farkıyla eşleşti"
              : "Kullanıcı adı eşleşti",
          value: identifier.canonical
        });
        score += usernameMatch.kind === "fuzzy" ? 18 : 25;
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

  // Profile-probe direkt platform API/HTML imzasıyla hesabın varlığını doğruladı.
  // Snippet/searchableText'te kullanıcının verdiği isim/e-posta yoksa (gizli /
  // korunan hesaplarda public yüzey daracık olur) klasik kanıt akışı boş döner
  // ve sonuç ranker tarafından elenir. Probe doğrulamasının kendisi başlı
  // başına kanıt — bu bilgiyi evidence olarak yansıt ki "gizli hesaplar" da
  // listelensin.
  if (directProbeHit && evidence.length === 0) {
    const usernameId = identifiers.find((id) => id.type === "username" && id.valid);
    evidence.push({
      type: "username",
      label: "Profil doğrulandı (gizli/korunan olabilir)",
      value: usernameId?.canonical || result.platformKey || ""
    });
    score += 12;
  }

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
  // direct: email/phone hit, two converging high-trust signals, or a verified
  // direct username probe on a platform with a hard 200/JSON success contract.
  if (emailEvidence && phoneEvidence) return "direct";
  if (highTrustEvidence) return "direct";
  if (directProbeHit) return "direct";

  // Multi-evidence convergence without high-trust still earns direct grade.
  if (independentSignals >= 3) return "direct";

  // Surname guard: when a full name is given but never appears, suppress
  // username-only / first-name-only hits to mention.
  if (hasFullName && !surnameConfirmed && !nameEvidence) return "mention";

  if (usernameEvidence && nameEvidence && !fuzzyEvidence) return "strong";
  if (nameEvidence && !fuzzyEvidence && score >= 20) return "strong";
  if (!hasFullName && usernameEvidence && !fuzzyEvidence && score >= 20) return "strong";

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
  return results
    .map((result) => scoreSearchResult(result, identifiers))
    .filter((result) => result.evidence.length > 0)
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
    return { matched: true, kind: "exact" };
  }

  if (compact.length < 5) {
    return { matched: false, kind: "" };
  }

  const matched = foldedTokens.some((token) => isNearToken(compact, token, usernameMaxDistance(compact)));
  return { matched, kind: matched ? "fuzzy" : "" };
}

function matchName(name, folded, compactFolded, foldedTokens) {
  const canonical = foldText(name);
  const compact = compactText(canonical);
  const nameTokens = tokenizeFolded(canonical).filter((token) => token.length > 1);

  if (!compact || nameTokens.length < 2) {
    return { matched: false, kind: "" };
  }

  if (folded.includes(canonical)) {
    return { matched: true, kind: "exact" };
  }

  if (compactFolded.includes(compact)) {
    return { matched: true, kind: "compact" };
  }

  if (isNearCompactPhrase(compact, compactFolded)) {
    return { matched: true, kind: "fuzzy" };
  }

  const matchedTokens = nameTokens.filter((nameToken) =>
    foldedTokens.some((token) => isNearToken(nameToken, token, nameMaxDistance(nameToken)))
  );

  return {
    matched: matchedTokens.length === nameTokens.length,
    kind: matchedTokens.length === nameTokens.length ? "fuzzy" : ""
  };
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
