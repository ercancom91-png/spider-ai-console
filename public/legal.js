/* SPIDER AI — Çerez Bandı + Hukuki Modal Yönetimi
 * - Çerez tercihleri yerel depolamada tutulur (üçüncü taraf yok).
 * - Hukuki belgeler modal içinde sunulur, harici bağımlılık yok.
 */

const COOKIE_KEY = "spider.cookie.v1";
const PREFS_KEY = "spider.prefs.v1";

const banner = document.getElementById("cookie-banner");
const acceptAllBtn = document.getElementById("cookie-accept");
const rejectBtn = document.getElementById("cookie-reject");
const customizeBtn = document.getElementById("cookie-customize");
const openPrefsBtn = document.getElementById("open-cookie-prefs");
const prefsDialog = document.getElementById("cookie-prefs-dialog");
const prefsSaveBtn = document.getElementById("cookie-prefs-save");
const prefsPreference = document.getElementById("pref-preference");
const prefsStats = document.getElementById("pref-stats");

const legalDialog = document.getElementById("legal-dialog");
const legalEyebrow = document.getElementById("legal-eyebrow");
const legalTitle = document.getElementById("legal-title");
const legalContent = document.getElementById("legal-content");

// ---------- Cookie banner ----------
const stored = readCookieDecision();
if (!stored) {
  banner.hidden = false;
  requestAnimationFrame(() => banner.classList.add("visible"));
}

acceptAllBtn?.addEventListener("click", () => {
  saveCookieDecision({ status: "accepted-all", preference: true, stats: true });
  hideBanner();
});

rejectBtn?.addEventListener("click", () => {
  saveCookieDecision({ status: "essential-only", preference: false, stats: false });
  hideBanner();
});

customizeBtn?.addEventListener("click", () => {
  hideBanner();
  openPrefs();
});

openPrefsBtn?.addEventListener("click", openPrefs);

prefsDialog?.addEventListener("close", () => {
  if (prefsDialog.returnValue === "save") {
    saveCookieDecision({
      status: "customized",
      preference: !!prefsPreference?.checked,
      stats: !!prefsStats?.checked
    });
  }
});

function openPrefs() {
  if (!prefsDialog) return;
  const current = readCookieDecision() || { preference: true, stats: false };
  if (prefsPreference) prefsPreference.checked = current.preference !== false;
  if (prefsStats) prefsStats.checked = current.stats === true;
  prefsDialog.showModal();
}

function hideBanner() {
  if (!banner) return;
  banner.classList.remove("visible");
  setTimeout(() => {
    banner.hidden = true;
  }, 280);
}

function saveCookieDecision(decision) {
  try {
    localStorage.setItem(
      COOKIE_KEY,
      JSON.stringify({ ...decision, decidedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore */
  }
}

function readCookieDecision() {
  try {
    return JSON.parse(localStorage.getItem(COOKIE_KEY) || "null");
  } catch {
    return null;
  }
}

// ---------- Legal documents ----------
const LEGAL_DOCS = {
  privacy: {
    eyebrow: "Hukuki Belge",
    title: "Gizlilik Politikası",
    sections: [
      {
        h: "1. Veri Sorumlusu",
        p:
          "SPIDER AI, kullanıcının yetkili olduğu kimlikler için açık kaynaklarda dijital iz tespit etmeye yarayan, " +
          "yerel olarak çalışan bir istihbarat aracıdır. Veri sorumlusu, platformu çalıştıran kullanıcının " +
          "kendisidir; SPIDER AI sunucu tarafında kişisel veri toplamaz."
      },
      {
        h: "2. İşlenen Veri Kategorileri",
        p:
          "Arama formuna girilen kimlik bilgileri (ad, e-posta, telefon, kullanıcı adı) yalnızca o oturum süresince " +
          "işlenir; sunucu disk loguna kaydedilmez. Yüklenen referans görseller tarayıcıda algısal hash'e dönüştürülür; " +
          "ham dosya sunucuya gönderilmez."
      },
      {
        h: "3. Yerel Depolama",
        p:
          "Yerel SQLite (FTS5) indeksi, tarafınızca seed verilen açık sayfaların görünür metnini bu cihazda tutar. " +
          "Hiçbir veri uzak bir hizmete iletilmez. Yerel indeksi `data/knock-index.sqlite` dosyasını silerek " +
          "tamamen sıfırlayabilirsiniz."
      },
      {
        h: "4. Hassas Kategoriler",
        p:
          "Yetişkin / sızıntı kaynakları varsayılan olarak devre dışıdır. Bu kaynakların dahil edilmesi açık ve " +
          "yenilenebilir bir onay gerektirir."
      },
      {
        h: "5. Haklarınız (KVKK m.11 / GDPR m.15-22)",
        p:
          "Verilerinize erişim, düzeltme, silme, işlemeyi sınırlama, taşınabilirlik ve itiraz haklarınız saklıdır. " +
          "Talepleriniz için legal@spider-ai.local adresine başvurabilirsiniz."
      }
    ]
  },
  terms: {
    eyebrow: "Hukuki Belge",
    title: "Kullanım Şartları",
    sections: [
      {
        h: "1. Hizmetin Kapsamı",
        p:
          "SPIDER AI, açık kaynaklarda dijital iz tespiti yapan bir araçtır. Hizmet yalnızca; (a) kullanıcının kendi " +
          "dijital varlığını denetlemesi, (b) yazılı yetki sahibi olduğu üçüncü kişi adına analiz yapması, " +
          "(c) veri kaldırma / itibar yönetimi süreçlerini planlaması amaçlarıyla kullanılabilir."
      },
      {
        h: "2. Yasaklı Kullanım",
        p:
          "Kullanıcı; yetkisiz takip, taciz, ifşa, doxxing, finansal dolandırıcılık, kimlik hırsızlığı veya benzeri " +
          "hukuka aykırı amaçlarla SPIDER AI'yi kullanamaz. Bu kullanım her tür sorumluluğu kullanıcıya yükler."
      },
      {
        h: "3. Kanıt Zorunluluğu",
        p:
          "Platform, en az bir tanımlayıcının birebir eşleşmediği sonuçları otomatik olarak dışlar. Sonuçların " +
          "yorumlanması ve aksiyona dönüştürülmesinden kullanıcı sorumludur."
      },
      {
        h: "4. Sorumluluk Reddi",
        p:
          "Platform “olduğu gibi” sunulur. Üçüncü taraf arama motorlarının erişilebilirliği, veri tutarlılığı veya " +
          "indeks bütünlüğü garanti edilmez. Yanlış pozitif / yanlış negatif sonuçlar olabilir."
      },
      {
        h: "5. Değişiklikler",
        p:
          "Şartlar zaman içinde güncellenebilir. Önemli değişikliklerde uygulama içinde bildirim yapılır."
      }
    ]
  },
  kvkk: {
    eyebrow: "6698 Sayılı Kanun",
    title: "KVKK Aydınlatma Metni",
    sections: [
      {
        h: "1. Veri Sorumlusunun Kimliği",
        p:
          "SPIDER AI yerel kurulumlu bir araç olduğu için, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında " +
          "veri sorumlusu, kurulumu yapan ve kullanan gerçek/tüzel kişidir."
      },
      {
        h: "2. Kişisel Verilerin İşlenme Amaçları",
        p:
          "Aramaya konu kimliğin sahibi olan veri ilgilisinin (i) açık rızası, (ii) hukuki yükümlülüklerin yerine " +
          "getirilmesi veya (iii) meşru menfaat çerçevesinde, dijital varlık denetimi ve kaldırma süreçlerinin " +
          "planlanması amacıyla işlenir."
      },
      {
        h: "3. Aktarım",
        p:
          "Platform; kişisel verileri yurt içinde veya yurt dışında üçüncü kişilere aktarmaz. Tüm işlem yerel cihazda " +
          "gerçekleşir. Açık web sorguları (Bing, Brave, Yandex vb.) yalnızca seçilen tanımlayıcıları kapsar; " +
          "ek hassas veri iletilmez."
      },
      {
        h: "4. Toplama Yöntemi ve Hukuki Sebep",
        p:
          "Kişisel veriler, kullanıcının arama formuna gönüllü olarak girdiği bilgilerden ve tarayıcıda işlenen " +
          "görsellerden ibarettir. Hukuki sebep KVKK m.5/2 (a, ç, e, f) bentleri kapsamında değerlendirilir."
      },
      {
        h: "5. KVKK m.11 Hakları",
        p:
          "İlgili kişi; verilerinin işlenip işlenmediğini öğrenme, amaca uygun kullanılıp kullanılmadığını sorgulama, " +
          "düzeltme/silme talep etme, işlemeye itiraz etme haklarına sahiptir. Başvurular legal@spider-ai.local " +
          "adresine yapılır; 30 gün içinde yanıtlanır."
      }
    ]
  },
  cookies: {
    eyebrow: "Çerez & Yerel Depolama",
    title: "Çerez Politikası",
    sections: [
      {
        h: "1. Üçüncü Taraf Yok",
        p:
          "SPIDER AI, üçüncü taraf izleme çerezi, reklam piksel'i veya benzeri uzaktan izleme yöntemleri kullanmaz. " +
          "Tüm depolama tarayıcının yerel deposunda gerçekleşir."
      },
      {
        h: "2. Kullanılan Yerel Anahtarlar",
        p:
          "spider.onboarded, spider.licenseKey, spider.licenseCache, spider.cookie.v1, spider.prefs.v1 anahtarları " +
          "yalnızca uygulamanın doğru çalışması ve kullanıcı tercihlerinin saklanması için kullanılır."
      },
      {
        h: "3. Kategoriler",
        p:
          "(a) Zorunlu — devre dışı bırakılamaz, oturumu ve onay durumunu yönetir. (b) Tercih — son kullanılan " +
          "filtre, sıralama, tema gibi kullanıcı seçimleri. (c) İstatistik — yalnızca yerel sayaçlar; harici " +
          "sunucuya gönderilmez. (d) Pazarlama / İzleme — bu platformda kullanılmaz."
      },
      {
        h: "4. Tercihlerin Yönetimi",
        p:
          "Footer üzerinden “Çerez Tercihleri” bağlantısı ile dilediğiniz an seçimlerinizi güncelleyebilirsiniz. " +
          "Tarayıcının yerel depolamasını temizlemek tüm anahtarları siler."
      }
    ]
  }
};

document.querySelectorAll("[data-legal]").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    const key = btn.getAttribute("data-legal");
    openLegal(key);
  });
});

document.querySelectorAll("[data-close-legal]").forEach((btn) => {
  btn.addEventListener("click", () => legalDialog?.close());
});

function openLegal(key) {
  const doc = LEGAL_DOCS[key];
  if (!doc || !legalDialog) return;
  legalEyebrow.textContent = doc.eyebrow;
  legalTitle.textContent = doc.title;
  legalContent.innerHTML = doc.sections
    .map((s) => `<section><h3>${escapeHtml(s.h)}</h3><p>${escapeHtml(s.p)}</p></section>`)
    .join("");
  legalDialog.showModal();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
