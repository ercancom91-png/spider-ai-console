# SPIDER AI

> İzin tabanlı dijital varlık istihbarat platformu. Kanıt tabanlı, çok‑kanıt birleşmeli kimlik eşleştirme.

SPIDER AI; bir bireyin yalnızca kendi veya yetkili olduğu kimlikler için, **açık kaynaklarda** bıraktığı izleri tespit eder. 14+ arama motoru, 60+ profil sondası ve yerel SQLite FTS indeksi üzerinden kanıt tabanlı bir eşleştirme katmanı sunar; doğrulanmamış hiçbir sonuç sunulmaz.

---

## Özellikler

- **Çok‑kanıt birleşmesi.** Aynı kişide kesişen e‑posta + telefon + isim + kullanıcı adı sinyalleri, sonucu `direct` (tam eşleşme) kademesine taşır.
- **Profil sondaları (60+).** GitHub, GitLab, Codeberg, HuggingFace, Codeforces, LeetCode, Bluesky, Mastodon, Lichess, Spotify, Letterboxd, Linktree, Ekşi Sözlük, Donanım Haber, Strava, Pixiv ve daha fazlası — JSON API veya katı imza eşleştirme ile **gerçek 1:1** doğrulama.
- **Yerel indeks (SPIDER Index).** Kullanıcı tarafından seed edilen sayfalar, bu cihazdaki SQLite FTS5 deposuna yazılır. Hiçbir veri üçüncü tarafa aktarılmaz.
- **Bağımsız indeks otomasyonu.** Web sunucusundan ayrı çalışan döngüsel servis; küratörlü seed bankasını rotasyonla çekip indeksi sürekli güçlendirir.
- **İzin kapısı.** Yetkili olunmayan kimlik için arama yapılmaz; KVKK / GDPR çerçevesi.
- **Hassas kaynak gating.** Yetişkin / sızıntı kaynakları varsayılan olarak devre dışı; ayrı onay gerektirir.
- **Premium yüz doğrulama.** face‑api varsa embedding, yoksa algısal hash; yalnızca yüksek benzerlik doğrulananlar gösterilir.

## Kurulum

```bash
git clone <repo-url>
cd "SPIDER AI"
cp .env.example .env
npm start
```

Tarayıcıda `http://localhost:4173/` adresini açın.

### Opsiyonel API anahtarları

Daha geniş web kapsamı için `.env` üzerinden:

```
BING_SEARCH_KEY=
BRAVE_API_KEY=
GITHUB_TOKEN=
SEARX_BASE_URL=https://your-searx.example/
LICENSE_SECRET=...
```

## Komutlar

| Komut                    | Açıklama                                                      |
| ------------------------ | ------------------------------------------------------------- |
| `npm start`              | Web sunucusunu başlatır (`http://localhost:4173/`).           |
| `npm run dev`            | `--watch` modunda otomatik yeniden başlatma.                  |
| `npm test`               | Birim test paketini çalıştırır (37 test).                     |
| `npm run index:auto`     | Bağımsız indeks otomasyonunu sürekli modda başlatır.          |
| `npm run index:once`     | Otomasyondan tek tur çalıştırır.                              |

### Otomasyon Yapılandırması

```
AUTO_INTERVAL_MIN=30   # tur arası dakika
AUTO_PAGES=24          # tur başına maksimum sayfa
AUTO_DEPTH=1           # link derinliği
AUTO_BATCH=6           # tur başına seed sayısı
AUTO_SEED_FILE=data/seed-bank.json
AUTO_STATUS_FILE=data/automation-status.json
```

Durum dosyası (`data/automation-status.json`), her turdan sonra güncellenir ve indeks sağlığını izlemek için kullanılabilir.

## Mimari

```
public/                Tarayıcı UI (HTML / CSS / app.js — single page)
scripts/
  indexAutomation.js   Bağımsız indeks otomasyonu
  issueLicense.js      Lisans anahtarı üretimi
src/
  server.js            HTTP API + statik dosya
  matching.js          Çok‑kanıt birleşmeli skorlama, tier hesaplama
  analysis.js          URL dedup, tier özeti, redaksiyon
  normalizers.js       İsim / e‑posta / telefon / kullanıcı adı normalizasyon + sorgu üretimi
  knockIndex.js        SQLite FTS5 indeks
  knockCrawler.js      robots.txt + per‑host bütçeli crawler
  taxonomy.js          Kategori ağacı + scoping domain'leri
  privacy.js           İzin / consent doğrulama
  license.js           HMAC tabanlı lisans
  faceVerification.js  Yüz hash karşılaştırma
  providers/           14 arama / 60+ profil sondası
data/                  Yerel SQLite + automation runtime (git'lenmiyor)
test/                  Birim testler (node:test)
```

## Eşleşme Kademeleri

| Kademe        | Anlam                                                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| `direct`      | E‑posta veya telefon birebir geçti **veya** doğrulanmış API profil sondası eşleşti **veya** ≥3 bağımsız sinyal kesişti. |
| `strong`      | İsim + kullanıcı adı veya isim + e‑posta birlikte eşleşti.                             |
| `mention`     | Tek bir zayıf sinyal (yalnız isim veya yalnız kullanıcı adı, fuzzy eşleşme).           |

**Verified rozet** ek olarak; e‑posta+telefon birleşimi, e‑posta/telefon+isim birleşimi veya doğrulanmış probe + isim eşleşmesinde `verified: true` döner.

## Veri Sahipliği ve Güvenlik

- Yerel SQLite indeksi `data/knock-index.sqlite` altında tutulur ve **git'lenmez**.
- `.env` dosyası **git'lenmez**; örnekleri `.env.example` ile paylaşın.
- Görsel dosyalar tarayıcıda işlenir; sunucuya yalnızca `sha256` ve `aHash` özetleri iletilir.
- HTTP yanıtlarında varsayılan güvenlik başlıkları: `CSP`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`.

## Sorumluluk Reddi

SPIDER AI yalnızca; (a) kendi dijital varlığınızı denetlemek, (b) yazılı yetki sahibi olduğunuz bir kimliği analiz etmek, (c) veri kaldırma / itibar yönetimi süreçlerinizi planlamak için tasarlanmıştır. Her tür yetkisiz kullanım kullanıcının sorumluluğundadır.

## Lisans

Özel — tüm hakları saklıdır.
