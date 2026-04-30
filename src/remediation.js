import { sourceHost } from "./matching.js";

const GOOGLE_PERSONAL_INFO_URL = "https://support.google.com/websearch/answer/9673730?hl=tr";
const GOOGLE_OUTDATED_CONTENT_URL =
  "https://search.google.com/search-console/remove-outdated-content";
const BING_REPORT_URL =
  "https://support.microsoft.com/en-us/topic/how-to-report-a-concern-or-contact-bing-1831f0fe-3c4d-46ae-8e57-16c487715729";

const PLATFORM_GUIDES = [
  {
    hosts: ["facebook.com"],
    name: "Facebook",
    actions: [
      {
        title: "Facebook hesap silme akışını kontrol et",
        description:
          "Sonuç bir Facebook hesabına veya sayfasına bağlıysa önce hesap, profil görünürlüğü veya içerik ayarlarından kaldırmayı dene.",
        url: "https://www.facebook.com/help/delete_account"
      }
    ]
  },
  {
    hosts: ["instagram.com"],
    name: "Instagram",
    actions: [
      {
        title: "Instagram hesap silme/gizleme akışını kontrol et",
        description:
          "Profil herkese açıksa hesabı gizli yapma, gönderiyi kaldırma veya hesabı silme seçeneklerini değerlendir.",
        url: "https://help.instagram.com/139886812848894"
      }
    ]
  },
  {
    hosts: ["x.com", "twitter.com"],
    name: "X",
    actions: [
      {
        title: "X hesabını devre dışı bırakma/silme akışını kontrol et",
        description:
          "Sonuç profil veya gönderi kaynaklıysa önce gönderiyi kaldır, profil verilerini değiştir veya hesap devre dışı bırakma akışını kullan.",
        url: "https://help.x.com/articles/20170743-"
      }
    ]
  },
  {
    hosts: ["github.com"],
    name: "GitHub",
    actions: [
      {
        title: "GitHub hesap ve profil verilerini gözden geçir",
        description:
          "E-posta commit geçmişinde görünüyorsa commit e-postası, profil alanları ve hesap silme etkilerini ayrıca kontrol et.",
        url: "https://docs.github.com/en/account-and-profile/how-tos/account-management/deleting-your-personal-account"
      }
    ]
  },
  {
    hosts: ["tiktok.com"],
    name: "TikTok",
    actions: [
      {
        title: "TikTok hesap silme veya devre dışı bırakma akışını kontrol et",
        description:
          "Profil ya da içerik kaynaklı görünürlük varsa önce içerik gizleme/kaldırma, sonra hesap silme seçeneklerini değerlendir.",
        url: "https://support.tiktok.com/en/account-and-privacy/deleting-an-account/"
      }
    ]
  }
];

export function buildResultRemediation(result) {
  const host = sourceHost(result.url);
  const dataActions = buildDataActions(result.evidence);
  const platform = findPlatformGuide(host);
  const actions = [
    {
      kind: "source",
      priority: "high",
      title: "Önce kaynağı kaldır veya düzelt",
      description:
        "Arama motorundan kaldırmak tek başına yetmez. Veri bu sayfada duruyorsa kaynak linkinden hesabı, profili, gönderiyi veya sayfa sahibini hedefle.",
      url: result.url
    }
  ];

  if (platform) {
    for (const action of platform.actions) {
      actions.push({
        ...action,
        kind: "account",
        priority: "high",
        platform: platform.name
      });
    }
  }

  if (result.classification?.categoryId === "data-broker") {
    actions.push({
      kind: "opt-out",
      priority: "high",
      title: "Veri brokeri opt-out kanalını ara",
      description:
        "People-search veya rehber sitesi ise gizlilik, opt-out, remove my info veya KVKK/GDPR talep kanalını kullan; kimlik doğrulaması istenirse gereğinden fazla belge paylaşma.",
      url: result.url
    });
  }

  if (result.classification?.sensitivity === "adult") {
    actions.push({
      kind: "sensitive",
      priority: "high",
      title: "Hassas kaynak için platform bildirimi yap",
      description:
        "Profil veya içerik sana ait değilse kimlik taklidi, rıza dışı paylaşım veya telif/gizlilik ihlali başlığıyla platformun abuse/privacy kanalına başvur.",
      url: result.url
    });
  }

  actions.push(
    {
      kind: "request",
      priority: "high",
      title: "Siteye kaldırma/anonimleştirme talebi gönder",
      description:
        "Sayfada iletişim, privacy, KVKK, GDPR, support veya abuse kanalı varsa aynı URL ve kanıt türleriyle kısa bir kaldırma talebi gönder.",
      url: result.url
    },
    {
      kind: "search",
      priority: "medium",
      title: "Google sonucunu kaldırma veya yeniletme",
      description:
        "Veri telefon, e-posta, adres gibi kişisel iletişim bilgisi ise Google kaldırma talebi; kaynak değiştiyse eski içerik yenileme aracı uygundur.",
      url: GOOGLE_PERSONAL_INFO_URL,
      secondaryUrl: GOOGLE_OUTDATED_CONTENT_URL
    },
    {
      kind: "search",
      priority: "medium",
      title: "Bing sonucunu bildir",
      description:
        "Bing/Microsoft, belirli URL'ler için endişe bildirimi alır. Kaynak siteden kaldırma talebi yine önceliklidir.",
      url: BING_REPORT_URL
    }
  );

  if (hasThreatRisk(result)) {
    actions.unshift({
      kind: "safety",
      priority: "urgent",
      title: "Şantaj veya tehdit varsa kanıtı güvenli sakla",
      description:
        "Ödeme yapmadan ve içeriği yaymadan URL, tarih, kullanıcı adı ve mesaj kayıtlarını sakla; yerel hukuki destek veya kolluk başvurusu için hazır tut.",
      url: result.url
    });
  }

  return {
    host,
    exposedData: dataActions,
    actions,
    requestTemplate: buildRequestTemplate({ host, url: result.url, evidence: result.evidence })
  };
}

function buildDataActions(evidence) {
  const uniqueTypes = [...new Set(evidence.map((item) => item.type))];

  return uniqueTypes.map((type) => {
    if (type === "email") {
      return {
        type,
        label: "E-posta",
        action:
          "Kaynak sayfada e-postanın silinmesini veya maskelemesini iste. Aynı adres kritik hesaplarda kullanılıyorsa parolaları yenile ve iki adımlı doğrulamayı aç."
      };
    }

    if (type === "phone") {
      return {
        type,
        label: "Telefon",
        action:
          "Telefonun kaldırılmasını veya iletişim formuyla değiştirilmesini iste. Operatörde numara taşıma/SIM değişim korumasını ve mesajlaşma uygulaması gizlilik ayarlarını kontrol et."
      };
    }

    if (type === "name") {
      return {
        type,
        label: "İsim soyisim",
        action:
          "Yalnız isim her zaman kaldırılmayabilir; hesap, etkinlik, okul, iş veya liste sayfasıysa profil görünürlüğü, indeksleme ve anonimleştirme talep et."
      };
    }

    return {
      type,
      label: "Veri",
      action: "Kaynakta bu verinin kaldırılmasını, anonimleştirilmesini veya erişime kapatılmasını iste."
    };
  });
}

function buildRequestTemplate({ host, url, evidence }) {
  const evidenceLabels = evidence.map((item) => item.label).join(", ");

  return [
    "Merhaba,",
    "",
    `${host} üzerindeki aşağıdaki URL'de bana ait kişisel veri görünüyor:`,
    url,
    "",
    `Tespit edilen veri türleri: ${evidenceLabels || "kişisel veri"}.`,
    "",
    "Bu verinin yayında kalmasını istemiyorum. KVKK/GDPR kapsamındaki haklarım çerçevesinde ilgili verinin silinmesini, anonimleştirilmesini veya erişime kapatılmasını; işlem tamamlandıktan sonra arama motoru önbelleğinin yenilenmesini rica ederim.",
    "",
    "Kimlik veya yetki doğrulaması gerekiyorsa lütfen güvenli bir doğrulama kanalı paylaşın.",
    "",
    "Teşekkürler."
  ].join("\n");
}

function findPlatformGuide(host) {
  return PLATFORM_GUIDES.find((platform) =>
    platform.hosts.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))
  );
}

function hasThreatRisk(result) {
  const text = `${result.title || ""} ${result.snippet || ""}`.toLocaleLowerCase("tr");
  return ["şantaj", "tehdit", "dox", "doxxing", "ifşa", "extortion", "blackmail"].some((term) =>
    text.includes(term)
  );
}
