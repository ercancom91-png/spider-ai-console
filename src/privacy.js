import { config } from "./config.js";

const ALLOWED_AUTHORIZATIONS = new Set([
  "self",
  "legal_representative",
  "documented_authority"
]);

const ALLOWED_PURPOSES = new Set([
  "personal_audit",
  "security_review",
  "brand_protection",
  "legal_request"
]);

/**
 * Onboarding consent (default): tek seferlik kabul varsayılan değerlerle çalışır,
 * tüm checkbox doğrulamalarını atlar. Sadece subject geçerliliği zorunlu.
 *
 * Strict consent (eski mod): consent.mode === "strict" gönderilirse tüm alanlar
 * doğrulanır (eski davranış).
 */
export function validateConsent(consent = {}, subject) {
  const errors = [];
  const warnings = [];
  const mode = consent.mode === "strict" ? "strict" : "onboarded";

  const retentionDaysRaw = consent.retentionDays === undefined || consent.retentionDays === ""
    ? 0
    : Number(consent.retentionDays);

  const retentionDays = Number.isFinite(retentionDaysRaw)
    ? Math.min(Math.max(retentionDaysRaw, 0), config.retentionDaysLimit)
    : 0;

  if (mode === "strict") {
    if (!ALLOWED_AUTHORIZATIONS.has(consent.subjectAuthorization)) {
      errors.push("Arama türü seçilmeli.");
    }
    if (!ALLOWED_PURPOSES.has(consent.processingPurpose)) {
      errors.push("Kullanım amacı seçilmeli.");
    }
    if (consent.acceptedNotice !== true) {
      errors.push("Arama kapsamı onaylanmalı.");
    }
    if (consent.noSensitiveInference !== true) {
      errors.push("Sonuç modu kaynak, kategori ve kaldırma adımıyla sınırlı olmalı.");
    }
    if (consent.includeSensitiveSources === true && consent.acceptedSensitiveNotice !== true) {
      errors.push("Hassas kaynak kategorileri için özet gizleme onayı verilmeli.");
    }
    if (!Number.isFinite(retentionDaysRaw) || retentionDaysRaw < 0 || retentionDaysRaw > config.retentionDaysLimit) {
      errors.push(`Kayıt süresi 0-${config.retentionDaysLimit} gün arasında olmalı.`);
    }
  } else {
    // onboarded mode: silently apply safe defaults, no errors
    if (consent.includeSensitiveSources === true && consent.acceptedSensitiveNotice !== true) {
      warnings.push("Hassas kaynaklar varsayılan olarak kapalı tutuldu.");
    }
  }

  // Tek anlamlı hata mesajı stratejisi:
  //   - Hiç geçerli kimlik yoksa: tek net mesaj. Format hatalarını
  //     ayrıca gösterme — kullanıcıyı boğmasın.
  //   - En az bir geçerli kimlik varsa ve diğer alanlardan biri yanlış
  //     formatta dolu (ör. "abc" e-posta alanına yazıldı) o zaman
  //     o alan-spesifik hatayı göster.
  const validIdentifiers = subject.identifiers.filter(
    (identifier) => identifier.valid && identifier.type !== "photoHash"
  );

  if (validIdentifiers.length === 0) {
    errors.push(
      "Aramayı başlatmak için bir geçerli kimlik bilgisi girin: e-posta, telefon, kullanıcı adı (≥3 karakter) veya iki kelimelik isim soyisim."
    );
  } else {
    // Sadece kullanıcının açıkça doldurduğu invalid alanlar için format hatası göster.
    // type === "username" ise canonical değer formatı tipsiz auto-derive olabilir,
    // o yüzden user-input ile uyuşmuyorsa atla.
    const invalidIdentifiers = subject.identifiers.filter((identifier) => !identifier.valid);
    for (const identifier of invalidIdentifiers) {
      errors.push(`${identifier.label} formatı geçerli değil.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    retentionDays,
    mode
  };
}

export function publicSubjectView(subject) {
  return {
    fullName: subject.fullName,
    username: subject.username,
    email: subject.email,
    phone: subject.phone.digits,
    hasPhotoHash: Boolean(subject.photoHash),
    hasVisualFingerprint: Boolean(subject.visualFingerprint)
  };
}
