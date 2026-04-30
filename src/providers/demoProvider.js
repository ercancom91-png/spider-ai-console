const DEMO_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Crect width='240' height='240' fill='%23071a3d'/%3E%3Ccircle cx='120' cy='92' r='48' fill='%23f4f8ff'/%3E%3Cpath d='M42 218c16-54 54-82 78-82s62 28 78 82' fill='%23e11d2e'/%3E%3Cpath d='M54 42h132M42 120h156M64 188 176 52M176 188 64 52' stroke='%231263d8' stroke-width='8' opacity='.45'/%3E%3C/svg%3E";
const DEMO_EVENT_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 220'%3E%3Crect width='320' height='220' fill='%23fbfdff'/%3E%3Cpath d='M0 0h320v54H0z' fill='%23e11d2e'/%3E%3Cpath d='M24 92h272M24 136h220M24 180h180' stroke='%23050608' stroke-width='10'/%3E%3Ccircle cx='268' cy='148' r='38' fill='%231263d8'/%3E%3C/svg%3E";

export async function searchDemo(subject, options = {}) {
  if (!subject.email && !subject.phone.digits && !subject.fullName) {
    return [];
  }

  const isDemoSubject =
    subject.email === "ayse.demo@example.com" ||
    subject.phone.digits.endsWith("5551112233") ||
    subject.fullName.toLocaleLowerCase("tr") === "ayşe demir";

  if (!isDemoSubject) {
    return [];
  }

  const results = [
    {
      provider: "Demo public source set",
      sourceType: "fixture",
      title: "Ayşe Demir - Konferans konuşmacı profili",
      url: "https://example.com/events/ayse-demir",
      snippet:
        "Ayşe Demir, güvenlik ve gizlilik oturumunda konuşmacıdır. İletişim: ayse.demo@example.com",
      images: [{ url: DEMO_EVENT_IMAGE, alt: "Ayşe Demir konferans görseli", kind: "meta-preview" }],
      query: "demo fixture",
      fetchedAt: new Date().toISOString()
    },
    {
      provider: "Demo public source set",
      sourceType: "fixture",
      title: "Açık kaynak proje katkıcıları",
      url: "https://example.org/contributors/ayse-demir",
      snippet:
        "Katkıcı: Ayşe Demir. Kamuya açık ekip sayfasında +90 555 111 2233 numarası destek hattı olarak listelenmiştir.",
      query: "demo fixture",
      fetchedAt: new Date().toISOString()
    },
    {
      provider: "Demo public source set",
      sourceType: "fixture",
      title: "Ayşe Demir (@ayse.demo) - Instagram",
      url: "https://instagram.com/ayse.demo",
      snippet:
        "Ayşe Demir herkese açık profilinde ayse.demo@example.com e-posta adresini paylaşmıştır.",
      images: [{ url: DEMO_AVATAR, alt: "Ayşe Demir Instagram profil görseli", kind: "profile-avatar" }],
      query: "demo fixture",
      fetchedAt: new Date().toISOString()
    },
    {
      provider: "Demo public source set",
      sourceType: "fixture",
      title: "Ayşe Demir - GitHub",
      url: "https://github.com/aysedemo",
      snippet:
        "Public developer profile: Ayşe Demir. Contact: ayse.demo@example.com",
      images: [{ url: DEMO_AVATAR, alt: "Ayşe Demir GitHub avatar", kind: "profile-avatar" }],
      query: "demo fixture",
      fetchedAt: new Date().toISOString()
    },
    {
      provider: "Demo public source set",
      sourceType: "fixture",
      title: "Ayşe Demir - Etkinlik biletleri",
      url: "https://eventbrite.com/o/ayse-demir-demo",
      snippet:
        "Organizer profile for Ayşe Demir. Support line +90 555 111 2233.",
      query: "demo fixture",
      fetchedAt: new Date().toISOString()
    }
  ];

  if (options.includeSensitiveSources === true) {
    results.push(
      {
        provider: "Demo public source set",
        sourceType: "fixture",
        title: "Ayşe Demir contact dump - Pastebin",
        url: "https://pastebin.com/ayse-demo",
        snippet:
          "Ayşe Demir için ayse.demo@example.com bilgisinin izinsiz paylaşıldığı riskli paste kaydı.",
        query: "demo fixture",
        fetchedAt: new Date().toISOString()
      },
      {
        provider: "Demo public source set",
        sourceType: "fixture",
        title: "Ayşe Demir - creator profile",
        url: "https://onlyfans.com/ayse-demo",
        snippet:
          "Yetişkin içerik kategorisinde herkese açık görünen Ayşe Demir profil başlığı.",
        query: "demo fixture",
        fetchedAt: new Date().toISOString()
      }
    );
  }

  return results;
}
