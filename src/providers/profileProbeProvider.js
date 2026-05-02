import { getWmnPlatforms, runWmnProbe } from "./wmnCatalog.js";

// UA rotasyonu — soft-block / fingerprint çekiminden kaçınmak için her isteğe
// güncel masaüstü tarayıcı UA'sından random biri seçilir.
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

const PROBE_TIMEOUT_MS = 7_000;
// Yüksek concurrency güvenli: her site farklı host, per-host basıncı yok.
const CONCURRENCY = 32;

// Each platform declares how to confirm the profile actually exists.
// method === "status": real hard-404 when username missing. Safe.
// method === "bodyContains": response body must match positive regex.
//   Used for platforms that return 200 + generic shell for missing users.
// method === "apiXxx": JSON API with unique success schema.
const PLATFORMS = [
  // --- API-backed, most reliable ---
  { key: "github", name: "GitHub", category: "developer", url: (u) => `https://api.github.com/users/${u}`, method: "apiGithub" },
  { key: "gravatar", name: "Gravatar", category: "identity", url: (u) => `https://en.gravatar.com/${u}.json`, method: "apiGravatar" },
  { key: "reddit", name: "Reddit", category: "forum", url: (u) => `https://www.reddit.com/user/${u}/about.json`, method: "apiReddit" },
  { key: "hackernews", name: "Hacker News", category: "forum", url: (u) => `https://hacker-news.firebaseio.com/v0/user/${u}.json`, method: "apiHackernews" },
  { key: "keybase", name: "Keybase", category: "identity", url: (u) => `https://keybase.io/_/api/1.0/user/lookup.json?usernames=${u}`, method: "apiKeybase" },

  // --- Hard 404 sites (status probe is reliable) ---
  { key: "gitlab", name: "GitLab", category: "developer", url: (u) => `https://gitlab.com/${u}`, method: "status" },
  { key: "bitbucket", name: "Bitbucket", category: "developer", url: (u) => `https://bitbucket.org/${u}/`, method: "status" },
  { key: "stackoverflow", name: "Stack Overflow", category: "developer", url: (u) => `https://stackoverflow.com/users/${u}`, method: "status" },
  { key: "devto", name: "DEV.to", category: "developer", url: (u) => `https://dev.to/${u}`, method: "status" },
  { key: "hashnode", name: "Hashnode", category: "developer", url: (u) => `https://hashnode.com/@${u}`, method: "status" },
  { key: "codepen", name: "CodePen", category: "developer", url: (u) => `https://codepen.io/${u}`, method: "status" },
  { key: "replit", name: "Replit", category: "developer", url: (u) => `https://replit.com/@${u}`, method: "status" },
  { key: "npm", name: "npm", category: "developer", url: (u) => `https://www.npmjs.com/~${u}`, method: "status" },
  { key: "pypi", name: "PyPI", category: "developer", url: (u) => `https://pypi.org/user/${u}/`, method: "status" },
  { key: "dockerhub", name: "Docker Hub", category: "developer", url: (u) => `https://hub.docker.com/u/${u}/`, method: "status" },

  { key: "medium", name: "Medium", category: "creator", url: (u) => `https://medium.com/@${u}`, method: "status" },
  { key: "wattpad", name: "Wattpad", category: "creator", url: (u) => `https://www.wattpad.com/user/${u}`, method: "status" },
  { key: "goodreads", name: "Goodreads", category: "creator", url: (u) => `https://www.goodreads.com/${u}`, method: "status" },
  { key: "patreon", name: "Patreon", category: "creator", url: (u) => `https://www.patreon.com/${u}`, method: "status" },
  { key: "kofi", name: "Ko-fi", category: "creator", url: (u) => `https://ko-fi.com/${u}`, method: "status" },
  { key: "buymeacoffee", name: "Buy Me a Coffee", category: "creator", url: (u) => `https://www.buymeacoffee.com/${u}`, method: "status" },

  { key: "dribbble", name: "Dribbble", category: "design", url: (u) => `https://dribbble.com/${u}`, method: "status" },
  { key: "behance", name: "Behance", category: "design", url: (u) => `https://www.behance.net/${u}`, method: "status" },
  { key: "deviantart", name: "DeviantArt", category: "design", url: (u) => `https://www.deviantart.com/${u}`, method: "status" },
  { key: "artstation", name: "ArtStation", category: "design", url: (u) => `https://www.artstation.com/${u}`, method: "status" },
  { key: "unsplash", name: "Unsplash", category: "design", url: (u) => `https://unsplash.com/@${u}`, method: "status" },
  { key: "500px", name: "500px", category: "design", url: (u) => `https://500px.com/${u}`, method: "status" },

  { key: "soundcloud", name: "SoundCloud", category: "music", url: (u) => `https://soundcloud.com/${u}`, method: "status" },
  { key: "bandcamp", name: "Bandcamp", category: "music", url: (u) => `https://${u}.bandcamp.com`, method: "status" },
  { key: "lastfm", name: "Last.fm", category: "music", url: (u) => `https://www.last.fm/user/${u}`, method: "status" },

  { key: "twitch", name: "Twitch", category: "video", url: (u) => `https://www.twitch.tv/${u}`, method: "bodyContains", positive: /"chanlet_identifier"|"broadcaster_login":"|tw-link js-page-nav-item/i },
  { key: "vimeo", name: "Vimeo", category: "video", url: (u) => `https://vimeo.com/${u}`, method: "status" },
  { key: "dailymotion", name: "Dailymotion", category: "video", url: (u) => `https://www.dailymotion.com/${u}`, method: "status" },
  { key: "kick", name: "Kick", category: "video", url: (u) => `https://kick.com/api/v2/channels/${u}`, method: "apiKick" },

  { key: "steam", name: "Steam", category: "gaming", url: (u) => `https://steamcommunity.com/id/${u}`, method: "bodyContains", positive: /profile_small_header_name|actual_persona_name/i },
  { key: "roblox", name: "Roblox", category: "gaming", url: (u) => `https://www.roblox.com/user.aspx?username=${u}`, method: "status" },
  { key: "chess", name: "Chess.com", category: "gaming", url: (u) => `https://www.chess.com/member/${u}`, method: "status" },

  { key: "quora", name: "Quora", category: "forum", url: (u) => `https://www.quora.com/profile/${u}`, method: "status" },
  { key: "mastodon", name: "Mastodon (mastodon.social)", category: "social", url: (u) => `https://mastodon.social/@${u}`, method: "status" },
  { key: "tumblr", name: "Tumblr", category: "social", url: (u) => `https://${u}.tumblr.com/`, method: "status" },
  { key: "vsco", name: "VSCO", category: "social", url: (u) => `https://vsco.co/${u}/gallery`, method: "status" },
  { key: "flickr", name: "Flickr", category: "social", url: (u) => `https://www.flickr.com/people/${u}/`, method: "bodyContains", positive: /"path_alias"|photos of|fotoğrafları/i },

  // --- Bot-blocked platforms: strict body pattern required, else skip ---
  // Instagram/Facebook/Threads/X/LinkedIn/Pinterest/TikTok return 200 with login walls
  // for non-existent usernames. We only flag when a strong profile-only signal appears.
  { key: "tiktok", name: "TikTok", category: "social", url: (u) => `https://www.tiktok.com/@${u}`, method: "bodyContains", positive: /"uniqueId":"[^"]+"|"userInfo":\{"user":\{/i },
  { key: "instagram", name: "Instagram", category: "social", url: (u) => `https://www.instagram.com/${u}/`, method: "bodyContains", positive: /"edge_owned_to_timeline_media"|"instapp:owner_user_id"|"profilePage_/i },
  { key: "threads", name: "Threads", category: "social", url: (u) => `https://www.threads.net/@${u}`, method: "bodyContains", positive: /"user_id":"[0-9]+"|"profile_context_facepile_users"/i },
  { key: "youtube", name: "YouTube", category: "video", url: (u) => `https://www.youtube.com/@${u}/about`, method: "bodyContains", positive: /"channelMetadataRenderer"|"externalId":"UC/i },

  // --- Extended developer / data ---
  { key: "huggingface", name: "Hugging Face", category: "developer", url: (u) => `https://huggingface.co/api/users/${u}/overview`, method: "apiHuggingface" },
  { key: "kaggle", name: "Kaggle", category: "developer", url: (u) => `https://www.kaggle.com/${u}`, method: "status" },
  { key: "codeforces", name: "Codeforces", category: "developer", url: (u) => `https://codeforces.com/api/user.info?handles=${u}`, method: "apiCodeforces" },
  { key: "leetcode", name: "LeetCode", category: "developer", url: (u) => `https://leetcode.com/${u}/`, method: "bodyContains", positive: /"username":"[^"]+"|user-detail-main-card|profile_user_/i },
  { key: "atcoder", name: "AtCoder", category: "developer", url: (u) => `https://atcoder.jp/users/${u}`, method: "status" },
  { key: "exercism", name: "Exercism", category: "developer", url: (u) => `https://exercism.org/profiles/${u}`, method: "status" },
  { key: "codeberg", name: "Codeberg", category: "developer", url: (u) => `https://codeberg.org/${u}`, method: "status" },
  { key: "gitea", name: "Gitea (gitea.com)", category: "developer", url: (u) => `https://gitea.com/${u}`, method: "status" },
  { key: "sourcehut", name: "Sourcehut", category: "developer", url: (u) => `https://git.sr.ht/~${u}`, method: "status" },
  { key: "rubygems", name: "RubyGems", category: "developer", url: (u) => `https://rubygems.org/profiles/${u}`, method: "status" },
  { key: "packagist", name: "Packagist", category: "developer", url: (u) => `https://packagist.org/users/${u}/`, method: "status" },
  { key: "cratesio", name: "crates.io", category: "developer", url: (u) => `https://crates.io/users/${u}`, method: "status" },
  { key: "modrinth", name: "Modrinth", category: "developer", url: (u) => `https://api.modrinth.com/v2/user/${u}`, method: "apiModrinth" },

  // --- Music / video / streaming ---
  { key: "spotify", name: "Spotify (open profile)", category: "music", url: (u) => `https://open.spotify.com/user/${u}`, method: "bodyContains", positive: /"profile":\{"name"|<title>[^<]+ \| Spotify<\/title>/i },
  { key: "audius", name: "Audius", category: "music", url: (u) => `https://audius.co/${u}`, method: "status" },
  { key: "letterboxd", name: "Letterboxd", category: "video", url: (u) => `https://letterboxd.com/${u}/`, method: "status" },
  { key: "imdb_user", name: "IMDb (user)", category: "video", url: (u) => `https://www.imdb.com/user/ur${u}/`, method: "status" },
  { key: "trakt", name: "Trakt.tv", category: "video", url: (u) => `https://trakt.tv/users/${u}`, method: "status" },
  { key: "myanimelist", name: "MyAnimeList", category: "creator", url: (u) => `https://myanimelist.net/profile/${u}`, method: "status" },
  { key: "anilist", name: "AniList", category: "creator", url: (u) => `https://anilist.co/user/${u}`, method: "status" },

  // --- Identity hubs / linktree-style ---
  { key: "aboutme", name: "About.me", category: "identity", url: (u) => `https://about.me/${u}`, method: "status" },
  { key: "linktree", name: "Linktree", category: "identity", url: (u) => `https://linktr.ee/${u}`, method: "bodyContains", positive: /"account":\{"username"|"profileTitle"|<title>@[^<]+ \| Linktree<\/title>/i },
  { key: "biolink", name: "bio.link", category: "identity", url: (u) => `https://bio.link/${u}`, method: "status" },
  { key: "carrd", name: "Carrd", category: "identity", url: (u) => `https://${u}.carrd.co`, method: "status" },
  { key: "beacons", name: "Beacons", category: "identity", url: (u) => `https://beacons.ai/${u}`, method: "status" },
  { key: "taplink", name: "Taplink", category: "identity", url: (u) => `https://taplink.cc/${u}`, method: "status" },
  { key: "solo", name: "solo.to", category: "identity", url: (u) => `https://solo.to/${u}`, method: "status" },
  { key: "linkbio", name: "lnk.bio", category: "identity", url: (u) => `https://lnk.bio/${u}`, method: "status" },

  // --- Forums / community ---
  { key: "lobsters", name: "Lobsters", category: "forum", url: (u) => `https://lobste.rs/u/${u}`, method: "status" },
  { key: "ycombinator", name: "Y Combinator (HN profile page)", category: "forum", url: (u) => `https://news.ycombinator.com/user?id=${u}`, method: "bodyContains", positive: /<a href="threads\?id=|<td valign="top">user:<\/td>/i },
  { key: "producthunt", name: "Product Hunt", category: "forum", url: (u) => `https://www.producthunt.com/@${u}`, method: "status" },
  { key: "indiehackers", name: "Indie Hackers", category: "forum", url: (u) => `https://www.indiehackers.com/${u}`, method: "status" },
  { key: "ekisozluk", name: "Ekşi Sözlük", category: "forum", url: (u) => `https://eksisozluk.com/biri/${u}`, method: "bodyContains", positive: /<h1 id="user-profile-title">|profil-istatistik/i },
  { key: "donanimhaber", name: "Donanım Haber", category: "forum", url: (u) => `https://forum.donanimhaber.com/profile/${u}`, method: "status" },

  // --- Federated / niche social ---
  { key: "bsky", name: "Bluesky", category: "social", url: (u) => `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${u}.bsky.social`, method: "apiBluesky" },
  { key: "lemmy", name: "Lemmy (lemmy.world)", category: "forum", url: (u) => `https://lemmy.world/u/${u}`, method: "status" },
  { key: "kbin", name: "Kbin (kbin.social)", category: "forum", url: (u) => `https://kbin.social/u/${u}`, method: "status" },
  { key: "pixelfed", name: "Pixelfed (pixelfed.social)", category: "social", url: (u) => `https://pixelfed.social/${u}`, method: "status" },
  { key: "mastodonOnline", name: "Mastodon (mastodon.online)", category: "social", url: (u) => `https://mastodon.online/@${u}`, method: "status" },
  { key: "diaspora", name: "diaspora* (diasp.org)", category: "social", url: (u) => `https://diasp.org/u/${u}`, method: "status" },

  // --- Sports & fitness ---
  { key: "strava", name: "Strava (athlete by handle)", category: "social", url: (u) => `https://www.strava.com/athletes/${u}`, method: "status" },
  { key: "garmin", name: "Garmin Connect", category: "social", url: (u) => `https://connect.garmin.com/modern/profile/${u}`, method: "status" },
  { key: "fitbit", name: "Fitbit", category: "social", url: (u) => `https://www.fitbit.com/user/${u}`, method: "status" },

  // --- Photo / design ---
  { key: "imgur", name: "Imgur", category: "design", url: (u) => `https://imgur.com/user/${u}`, method: "status" },
  { key: "pixiv", name: "Pixiv", category: "design", url: (u) => `https://www.pixiv.net/users/${u}`, method: "status" },
  { key: "pinterest", name: "Pinterest", category: "design", url: (u) => `https://www.pinterest.com/${u}/`, method: "bodyContains", positive: /"username":"[^"]+"|"resource_response":\{"data":\{"username"/i },

  // --- Gaming ---
  { key: "lichess", name: "Lichess", category: "gaming", url: (u) => `https://lichess.org/api/user/${u}`, method: "apiLichess" },
  { key: "epicgames", name: "Epic Games (Fortnite tracker)", category: "gaming", url: (u) => `https://fortnitetracker.com/profile/all/${u}`, method: "status" },
  { key: "minecraft", name: "Minecraft (Mojang UUID)", category: "gaming", url: (u) => `https://api.mojang.com/users/profiles/minecraft/${u}`, method: "apiMojang" },

  // --- Email-derived gravatar fallback ---
  { key: "gravatarHandle", name: "Gravatar (handle)", category: "identity", url: (u) => `https://gravatar.com/${u}`, method: "status" }
];

// WMN kataloğu lazy-load — her server start'ta tek kez okunur.
let cachedWmnPlatforms = null;
function wmnPlatforms() {
  if (cachedWmnPlatforms) return cachedWmnPlatforms;
  cachedWmnPlatforms = getWmnPlatforms();
  return cachedWmnPlatforms;
}

export async function searchProfileProbes(subject, options = {}) {
  const username = subject.username;
  if (!username || username.length < 3) {
    return {
      results: [],
      diagnostics: {
        mode: "profile-probe",
        platformsProbed: 0,
        platformsTotal: PLATFORMS.length + wmnPlatforms().length,
        profilesFound: 0,
        reason: "Geçerli bir kullanıcı adı yok; profil sondası atlandı."
      }
    };
  }

  const encoded = encodeURIComponent(username);
  const scanDepth = options.scanDepth || "balanced";
  // scanDepth politikası:
  //   balanced   → sadece hand-tuned (~150 platform, hızlı)
  //   wide       → hand-tuned + WMN protection-suz (~700 platform, ~60s)
  //   maximum    → hand-tuned + WMN tamamı (~750+ platform, ~90s)
  let wmn = [];
  if (scanDepth === "wide") {
    wmn = wmnPlatforms().filter((p) => !p.protection);
  } else if (scanDepth === "maximum") {
    wmn = wmnPlatforms();
  }

  // Hand-tuned API/HTML probes (yüksek güven)
  const apiTasks = PLATFORMS.map((platform) => async () => {
    try {
      return await probe(platform, username, encoded);
    } catch {
      return null;
    }
  });

  // WMN kataloğu — iki taraflı doğrulamalı, 700+ platform
  const wmnTasks = wmn.map((platform) => async () => {
    try {
      return await probeWmn(platform, username);
    } catch {
      return null;
    }
  });

  const outcomes = await runWithConcurrency([...apiTasks, ...wmnTasks], CONCURRENCY);
  const hits = outcomes.filter((outcome) => outcome?.result);

  // Aynı host'a hem hand-tuned hem WMN hit gelirse hand-tuned'i tercih et.
  const dedupedByHost = new Map();
  for (const hit of hits) {
    const host = hostOf(hit.result.url);
    const existing = dedupedByHost.get(host);
    if (!existing) {
      dedupedByHost.set(host, hit);
      continue;
    }
    // hand-tuned (key kategorisinde "wmn:" yok) öncelikli
    const existingIsWmn = existing.platform.key.startsWith("wmn:");
    const incomingIsWmn = hit.platform.key.startsWith("wmn:");
    if (existingIsWmn && !incomingIsWmn) {
      dedupedByHost.set(host, hit);
    }
  }

  const dedupedHits = [...dedupedByHost.values()];
  const results = dedupedHits.map((hit) => hit.result);

  // Kategori dağılımı — taranan platformların hangi kategorilere düştüğünü
  // UI'a aktar (transparency panel).
  const breakdown = {};
  for (const p of PLATFORMS) {
    breakdown[p.category] = (breakdown[p.category] || 0) + 1;
  }
  for (const p of wmn) {
    breakdown[p.category] = (breakdown[p.category] || 0) + 1;
  }

  return {
    results,
    diagnostics: {
      mode: "profile-probe",
      platformsProbed: outcomes.length,
      platformsTotal: PLATFORMS.length + wmn.length,
      handTunedCount: PLATFORMS.length,
      wmnCount: wmn.length,
      categoryBreakdown: breakdown,
      profilesFound: results.length,
      hitPlatforms: dedupedHits.map((hit) => hit.platform.key),
      // Frontend transparency kartı için tüm platform isim/host/cat listesi.
      probedPlatforms: [
        ...PLATFORMS.map((p) => ({
          name: p.name,
          host: hostOf(p.url("x")),
          category: p.category,
          source: "hand-tuned"
        })),
        ...wmn.map((p) => ({
          name: p.name,
          host: hostOf(p.uriCheck.replace(/\{account\}/g, "x")),
          category: p.category,
          source: "wmn"
        }))
      ],
      reason: `${PLATFORMS.length} hand-tuned + ${wmn.length} WhatsMyName katalog platformuna kullanıcı adı (${username}) probe atıldı; ${results.length} doğrulanmış profil bulundu. WMN için iki taraflı (e_string + m_string) doğrulama uygulandı.`
    }
  };
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function probeWmn(platform, username) {
  const fetchImpl = async (url, init) => {
    return await request(
      url,
      {
        "User-Agent": randomUA(),
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(init?.headers || {})
      },
      { method: init?.method || "GET", bodyLimit: 60_000, body: init?.body }
    );
  };

  const outcome = await runWmnProbe(platform, username, fetchImpl);
  if (outcome.state !== "exists") return null;

  return makeHit(platform, username, outcome.url, {
    probeLabel: `WMN iki-taraflı doğrulama (status ${outcome.status})`,
    confidence: outcome.confidence
  });
}

async function probe(platform, username, encoded) {
  const url = platform.url(encoded);
  const headers = {
    "User-Agent": randomUA(),
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
  };

  if (platform.method === "status") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 2_000 });
    if (response.status >= 200 && response.status < 400) {
      return makeHit(platform, username, url, { probeLabel: `HTTP ${response.status}` });
    }
    return null;
  }

  if (platform.method === "bodyContains") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 60_000 });
    if (response.status >= 400) return null;
    if (!platform.positive || !platform.positive.test(response.text)) return null;
    return makeHit(platform, username, url, { probeLabel: `profil imzası eşleşti` });
  }

  if (platform.method === "apiGithub") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.login) return null;
    return makeHit(platform, username, payload.html_url, {
      snippetExtra: payload.name ? `İsim: ${payload.name}` : null,
      image: payload.avatar_url
        ? { url: payload.avatar_url, alt: `${payload.name || payload.login} GitHub avatar`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiReddit") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    const data = payload?.data;
    if (!data?.name) return null;
    return makeHit(platform, username, `https://www.reddit.com/user/${encoded}`, {
      snippetExtra: `Karma: ${data.total_karma ?? data.link_karma ?? 0}`,
      image: data.icon_img ? { url: data.icon_img.split("?")[0], alt: `${data.name} Reddit avatar`, kind: "profile-avatar" } : null
    });
  }

  if (platform.method === "apiHackernews") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 8_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.id) return null;
    return makeHit(platform, username, `https://news.ycombinator.com/user?id=${encoded}`, {
      snippetExtra: `Karma: ${payload.karma ?? 0}`
    });
  }

  if (platform.method === "apiGravatar") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    const entry = payload?.entry?.[0];
    if (!entry?.profileUrl) return null;
    return makeHit(platform, username, entry.profileUrl, {
      snippetExtra: entry.displayName ? `İsim: ${entry.displayName}` : null,
      image: entry.thumbnailUrl
        ? { url: entry.thumbnailUrl, alt: `${entry.displayName || username} Gravatar avatar`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiKeybase") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    const user = payload?.them?.[0];
    if (!user?.basics?.username) return null;
    const display = user.profile?.full_name || user.basics.username;
    return makeHit(platform, username, `https://keybase.io/${encoded}`, {
      snippetExtra: user.profile?.full_name ? `İsim: ${user.profile.full_name}` : null,
      image: user.pictures?.primary?.url
        ? { url: user.pictures.primary.url, alt: `${display} Keybase avatar`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiKick") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.slug) return null;
    return makeHit(platform, username, `https://kick.com/${encoded}`, {
      snippetExtra: payload.user?.username ? `Kanal: ${payload.user.username}` : null
    });
  }

  if (platform.method === "apiHuggingface") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.user) return null;
    return makeHit(platform, username, `https://huggingface.co/${encoded}`, {
      snippetExtra: payload.fullname ? `İsim: ${payload.fullname}` : null,
      image: payload.avatarUrl
        ? { url: payload.avatarUrl, alt: `${payload.fullname || username} HF avatar`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiCodeforces") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    const handle = payload?.result?.[0];
    if (!handle?.handle) return null;
    return makeHit(platform, username, `https://codeforces.com/profile/${encoded}`, {
      snippetExtra: handle.rating ? `Rating: ${handle.rating} (${handle.rank || "—"})` : null,
      image: handle.titlePhoto
        ? { url: handle.titlePhoto.startsWith("//") ? `https:${handle.titlePhoto}` : handle.titlePhoto, alt: `${handle.handle} CF`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiModrinth") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.id) return null;
    return makeHit(platform, username, `https://modrinth.com/user/${encoded}`, {
      snippetExtra: payload.name ? `İsim: ${payload.name}` : null,
      image: payload.avatar_url
        ? { url: payload.avatar_url, alt: `${payload.username} Modrinth`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiBluesky") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.handle) return null;
    return makeHit(platform, username, `https://bsky.app/profile/${payload.handle}`, {
      snippetExtra: payload.displayName ? `İsim: ${payload.displayName}` : null,
      image: payload.avatar
        ? { url: payload.avatar, alt: `${payload.displayName || payload.handle} Bsky`, kind: "profile-avatar" }
        : null
    });
  }

  if (platform.method === "apiLichess") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 20_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.id) return null;
    return makeHit(platform, username, `https://lichess.org/@/${encoded}`, {
      snippetExtra: payload.profile?.country ? `Ülke: ${payload.profile.country}` : null
    });
  }

  if (platform.method === "apiMojang") {
    const response = await request(url, headers, { method: "GET", bodyLimit: 4_000 });
    if (response.status !== 200) return null;
    const payload = safeJson(response.text);
    if (!payload?.id) return null;
    return makeHit(platform, username, `https://namemc.com/profile/${payload.name}`, {
      snippetExtra: `UUID: ${payload.id}`
    });
  }

  return null;
}

function makeHit(platform, username, url, extras = {}) {
  const baseSnippet = `Aktif profil bulundu — kullanıcı adı @${username} ${platform.name} üzerinde kayıtlı.`;
  const snippet = extras.snippetExtra ? `${baseSnippet} ${extras.snippetExtra}.` : baseSnippet;

  return {
    result: {
      provider: "Profile Probe",
      sourceType: "profile-probe",
      title: `${platform.name} · @${username}`,
      url,
      snippet,
      searchableText: `${platform.name} ${username} profile profil hesap account`,
      images: extras.image ? [extras.image] : [],
      platformKey: platform.key,
      platformCategory: platform.category,
      probeLabel: extras.probeLabel,
      probeConfidence: extras.confidence ?? 0.95,
      evidenceHint: "username-direct-probe",
      query: `probe:${platform.key}:${username}`,
      fetchedAt: new Date().toISOString()
    },
    platform
  };
}

async function request(url, headers, { method = "GET", bodyLimit = 20_000, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: "follow",
      signal: controller.signal
    });

    let text = "";
    if (method === "GET") {
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          text += decoder.decode(value, { stream: true });
          if (total >= bodyLimit) {
            reader.cancel().catch(() => {});
            break;
          }
        }
      } else {
        text = await response.text();
      }
    }
    return { status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = await tasks[index]();
      } catch {
        results[index] = null;
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
