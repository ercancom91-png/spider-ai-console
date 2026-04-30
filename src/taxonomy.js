export const CATEGORY_TREE = [
  {
    id: "social",
    label: "Sosyal medya",
    subcategories: [
      { id: "social.instagram", label: "Instagram", domains: ["instagram.com"] },
      { id: "social.facebook", label: "Facebook", domains: ["facebook.com", "fb.com"] },
      { id: "social.x", label: "X / Twitter", domains: ["x.com", "twitter.com"] },
      { id: "social.tiktok", label: "TikTok", domains: ["tiktok.com"] },
      { id: "social.linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
      { id: "social.youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
      { id: "social.reddit", label: "Reddit", domains: ["reddit.com"] },
      { id: "social.telegram", label: "Telegram", domains: ["t.me", "telegram.me", "telegram.org"] },
      { id: "social.messaging", label: "Mesajlaşma / topluluk profili", domains: ["discord.com", "discord.gg", "whatsapp.com", "signal.me"] },
      { id: "social.identity", label: "Kimlik / avatar profili", domains: ["gravatar.com", "en.gravatar.com"] },
      { id: "social.visual", label: "Görsel sosyal ağlar", domains: ["pinterest.com", "snapchat.com", "flickr.com", "behance.net", "dribbble.com"] },
      { id: "social.federated", label: "Federated / yeni ağlar", domains: ["threads.net", "bsky.app", "mastodon.social", "mastodon.online"] },
      { id: "social.legacy", label: "Eski veya niş sosyal ağlar", domains: ["myspace.com", "tumblr.com", "vk.com", "ok.ru", "weibo.com", "deviantart.com", "last.fm", "hi5.com", "ask.fm"] }
    ]
  },
  {
    id: "commerce",
    label: "Alışveriş ve pazar yerleri",
    subcategories: [
      { id: "commerce.global", label: "Global pazar yerleri", domains: ["amazon.com", "ebay.com", "etsy.com", "aliexpress.com", "temu.com"] },
      { id: "commerce.tr", label: "TR pazar yerleri", domains: ["trendyol.com", "hepsiburada.com", "n11.com", "sahibinden.com"] },
      { id: "commerce.local", label: "Küçük e-ticaret / ilan", keywords: ["shop", "store", "marketplace", "seller", "ilan", "sepet", "product"] }
    ]
  },
  {
    id: "entertainment",
    label: "Entertainment ve medya",
    subcategories: [
      { id: "entertainment.video", label: "Video / streaming", domains: ["netflix.com", "twitch.tv", "vimeo.com", "dailymotion.com"] },
      { id: "entertainment.music", label: "Müzik / podcast", domains: ["spotify.com", "soundcloud.com", "bandcamp.com", "podcasts.apple.com"] },
      { id: "entertainment.film", label: "Film / etkinlik", domains: ["imdb.com", "letterboxd.com", "eventbrite.com", "meetup.com"] },
      { id: "entertainment.news", label: "Haber / yayın", domains: ["medium.com", "substack.com"], keywords: ["news", "magazine", "podcast", "event", "concert"] }
    ]
  },
  {
    id: "community",
    label: "Forum ve topluluk",
    subcategories: [
      { id: "community.forum", label: "Forum", domains: ["quora.com", "stackoverflow.com", "stackexchange.com"], keywords: ["forum", "community", "topic", "thread"] },
      { id: "community.chat", label: "Sohbet / grup", domains: ["guilded.gg", "slack.com"], keywords: ["discord", "telegram", "group", "kanal"] },
      { id: "community.blog", label: "Blog / kişisel site", domains: ["wordpress.com", "blogspot.com", "wixsite.com", "notion.site"] }
    ]
  },
  {
    id: "professional",
    label: "Profesyonel ve akademik",
    subcategories: [
      { id: "professional.code", label: "Kod / geliştirici", domains: ["github.com", "gitlab.com", "bitbucket.org", "npmjs.com"] },
      { id: "professional.academic", label: "Akademik", domains: ["orcid.org", "researchgate.net", "academia.edu", "scholar.google.com"] },
      { id: "professional.company", label: "Şirket / ekip sayfası", keywords: ["team", "staff", "about", "speaker", "press", "bio"] }
    ]
  },
  {
    id: "data-broker",
    label: "Kişi arama / veri brokeri",
    subcategories: [
      { id: "data-broker.people-search", label: "People search", domains: ["whitepages.com", "spokeo.com", "beenverified.com", "truepeoplesearch.com", "fastpeoplesearch.com", "peoplefinders.com"] },
      { id: "data-broker.directory", label: "Rehber / firma listesi", keywords: ["directory", "phonebook", "rehber", "lookup", "contact"] }
    ]
  },
  {
    id: "exposure",
    label: "Sızıntı / paste / riskli yayın",
    subcategories: [
      { id: "exposure.paste", label: "Paste / dump", domains: ["pastebin.com", "ghostbin.co", "rentry.co"], keywords: ["paste", "dump", "leak", "breach"] },
      { id: "exposure.doxxing", label: "Doxxing / tehdit", keywords: ["dox", "doxxing", "ifsa", "ifşa", "santaj", "şantaj", "blackmail", "extortion"] }
    ]
  },
  {
    id: "adult-sensitive",
    label: "Yetişkin / hassas kaynak",
    subcategories: [
      { id: "adult-sensitive.creator", label: "Creator / abonelik", domains: ["onlyfans.com", "fansly.com", "manyvids.com", "justfor.fans", "fanvue.com", "loyalfans.com", "patreon.com"] },
      { id: "adult-sensitive.adult", label: "Yetişkin içerik sitesi", domains: ["pornhub.com", "xvideos.com", "xnxx.com", "redtube.com", "youporn.com", "spankbang.com", "xhamster.com", "erome.com"] },
      { id: "adult-sensitive.live", label: "Canlı yetişkin platform", domains: ["chaturbate.com", "stripchat.com", "bongacams.com", "cam4.com"] },
      { id: "adult-sensitive.dating", label: "Flört / yetişkin topluluk", domains: ["fetlife.com", "adultfriendfinder.com", "ashleymadison.com"] }
    ],
    sensitive: true
  },
  {
    id: "other-sites",
    label: "Diğer siteler",
    subcategories: [
      { id: "other-sites.generic", label: "Genel web", keywords: [] }
    ]
  }
];

const HIGH_RISK_CATEGORY_IDS = new Set(["exposure"]);
const SENSITIVE_CATEGORY_IDS = new Set(["adult-sensitive"]);
const EXTRA_SUBCATEGORY_DOMAINS = {
  "social.instagram": ["picuki.com", "dumpor.com", "imginn.com"],
  "social.facebook": ["m.facebook.com", "messenger.com"],
  "social.x": ["nitter.net", "twstalker.com"],
  "social.tiktok": ["vm.tiktok.com", "tiktokcdn.com"],
  "social.linkedin": ["lnkd.in", "slideshare.net"],
  "social.youtube": ["music.youtube.com", "youtube-nocookie.com"],
  "social.reddit": ["old.reddit.com", "redditmedia.com"],
  "social.telegram": ["telegra.ph"],
  "social.messaging": ["matrix.to", "revolt.chat", "teamspeak.com", "mumble.info"],
  "social.identity": ["about.me", "linktr.ee", "bio.link", "carrd.co", "beacons.ai", "allmylinks.com", "lnk.bio", "solo.to", "taplink.cc", "campsite.bio"],
  "social.visual": ["500px.com", "vsco.co", "imgur.com", "unsplash.com", "artstation.com", "pixiv.net"],
  "social.federated": ["mastodon.cloud", "mstdn.social", "pixelfed.social", "lemmy.world", "kbin.social", "misskey.io", "diasp.org", "friendica.social"],
  "social.legacy": ["minds.com", "gab.com", "gettr.com", "truthsocial.com", "plurk.com", "livejournal.com", "renren.com", "mixi.jp"],
  "commerce.global": ["walmart.com", "target.com", "bestbuy.com", "rakuten.com", "mercari.com", "poshmark.com", "depop.com", "vinted.com", "wish.com", "shein.com", "asos.com", "zalando.com", "stockx.com", "goat.com", "carousell.com", "lazada.com", "shopee.com", "tokopedia.com", "flipkart.com", "snapdeal.com", "olx.com", "craigslist.org", "shop.app", "shopify.com", "gumroad.com", "bigcartel.com", "storenvy.com", "newegg.com", "costco.com", "wayfair.com"],
  "commerce.tr": ["amazon.com.tr", "letgo.com", "dolap.com", "gardrops.com", "cimri.com", "akakce.com", "ciceksepeti.com", "pttavm.com", "teknosa.com", "mediamarkt.com.tr", "vatanbilgisayar.com", "lcwaikiki.com", "defacto.com.tr", "boyner.com.tr", "flo.com.tr", "gratis.com", "rossmann.com.tr", "migros.com.tr", "a101.com.tr", "bim.com.tr", "sokmarket.com.tr"],
  "commerce.local": ["opencart.com", "woocommerce.com", "squarespace.com", "ecwid.com", "wix.com", "weebly.com", "prestashop.com", "magento.com", "ticimax.com", "ikas.com", "ikas.com.tr", "ikas.shop"],
  "entertainment.video": ["hulu.com", "disneyplus.com", "primevideo.com", "max.com", "hbomax.com", "tv.apple.com", "paramountplus.com", "peacocktv.com", "mubi.com", "crunchyroll.com", "tubitv.com", "plex.tv", "kick.com", "trovo.live"],
  "entertainment.music": ["music.apple.com", "deezer.com", "tidal.com", "audiomack.com", "mixcloud.com", "reverbnation.com", "genius.com", "musixmatch.com", "setlist.fm", "bandsintown.com", "songkick.com", "shazam.com"],
  "entertainment.film": ["trakt.tv", "thetvdb.com", "rottentomatoes.com", "metacritic.com", "ticketmaster.com", "biletix.com", "passo.com.tr", "beyazperde.com", "sinemalar.com", "fandango.com", "ra.co"],
  "entertainment.news": ["goodreads.com", "wattpad.com", "archiveofourown.org", "fanfiction.net", "webtoons.com", "tapas.io", "mangadex.org", "steamcommunity.com", "store.steampowered.com", "epicgames.com", "roblox.com", "chess.com", "lichess.org", "ign.com", "kotaku.com", "polygon.com", "theverge.com", "wired.com"],
  "community.forum": ["superuser.com", "serverfault.com", "askubuntu.com", "mathoverflow.net", "news.ycombinator.com", "lobste.rs", "slashdot.org", "metafilter.com", "teamblind.com", "nextdoor.com", "mumsnet.com", "bodybuilding.com", "tripadvisor.com", "forumdonanimhaber.com", "donanimhaber.com", "technopat.net", "r10.net", "iyinet.com", "eksisozluk.com", "uludagsozluk.com", "kizlarsoruyor.com", "proboards.com", "boards.net", "forumfree.it"],
  "community.chat": ["groups.io", "groups.google.com", "zulip.com", "rocket.chat", "mattermost.com", "gitter.im", "irccloud.com", "matrix.org", "element.io"],
  "community.blog": ["medium.com", "substack.com", "dev.to", "hashnode.com", "ghost.org", "typepad.com", "livejournal.com", "dreamwidth.org", "micro.blog", "write.as", "teletype.in", "over-blog.com", "jimdosite.com", "webnode.com", "webflow.io", "webflow.com"],
  "professional.code": ["codepen.io", "codesandbox.io", "replit.com", "kaggle.com", "huggingface.co", "docker.com", "hub.docker.com", "pypi.org", "crates.io", "rubygems.org", "packagist.org", "sourceforge.net", "launchpad.net", "codeberg.org", "sourcehut.org", "gitee.com", "npm.io", "libraries.io", "grep.app", "sourcegraph.com"],
  "professional.academic": ["pubmed.ncbi.nlm.nih.gov", "semanticscholar.org", "arxiv.org", "ssrn.com", "dblp.org", "mendeley.com", "figshare.com", "zenodo.org", "osf.io", "biorxiv.org", "medrxiv.org", "hal.science", "openreview.net", "scopus.com", "webofscience.com"],
  "professional.company": ["crunchbase.com", "wellfound.com", "angel.co", "producthunt.com", "xing.com", "glassdoor.com", "indeed.com", "kariyer.net", "yenibiris.com", "eleman.net", "secretcv.com", "upwork.com", "freelancer.com", "fiverr.com", "toptal.com", "peopleperhour.com", "clutch.co", "g2.com", "capterra.com", "apollo.io"],
  "data-broker.people-search": ["intelius.com", "truthfinder.com", "ussearch.com", "mylife.com", "radaris.com", "peekyou.com", "pipl.com", "zabasearch.com", "familytreenow.com", "nuwber.com", "clustrmaps.com", "thatsthem.com", "anywho.com", "addresses.com", "411.com", "peoplelooker.com", "checkpeople.com", "searchpeoplefree.com", "cocofinder.com", "idcrawl.com"],
  "data-broker.directory": ["yellowpages.com", "yelp.com", "mapquest.com", "superpages.com", "manta.com", "zoominfo.com", "rocketreach.co", "apollo.io", "hunter.io", "signalhire.com", "lusha.com", "contactout.com", "clearbit.com", "snov.io", "bbb.org", "opencorporates.com", "find-and-update.company-information.service.gov.uk", "kompass.com", "europages.com", "chamberofcommerce.com", "infobel.com", "foursquare.com", "firmasec.com", "bulurum.com", "yellowpages.com.tr", "rehberlik.com"],
  "exposure.paste": ["justpaste.it", "paste.ee", "controlc.com", "hastebin.com", "privatebin.net", "0bin.net", "dpaste.org", "paste.rs", "slexy.org", "paste2.org", "paste.org.ru", "ideone.com", "codeshare.io", "jsfiddle.net", "codepen.io", "gist.github.com", "gitlab.com", "sourcehut.org", "replit.com", "archive.org", "webcache.googleusercontent.com", "publicwww.com", "grep.app", "searchcode.com", "sourcegraph.com", "leakix.net", "shodan.io", "censys.io", "urlscan.io"],
  "exposure.doxxing": ["haveibeenpwned.com", "monitor.firefox.com", "dehashed.com", "leakcheck.io", "breachdirectory.org", "intelx.io", "psbdmp.ws", "pastebin.pl", "rentry.org", "anonfiles.com", "gofile.io", "file.io", "mega.nz", "mediafire.com", "dropbox.com", "drive.google.com", "docs.google.com", "scribd.com", "docdroid.net"],
  "adult-sensitive.creator": ["fansly.com", "manyvids.com", "justfor.fans", "fanvue.com", "loyalfans.com", "patreon.com", "ko-fi.com", "admireme.vip", "ismygirl.com", "frisk.chat", "fancentro.com", "mym.fans", "unlockd.me", "avnstars.com"],
  "adult-sensitive.adult": ["spankbang.com", "xhamster.com", "erome.com", "tube8.com", "beeg.com", "tnaflix.com", "thumbzilla.com", "drtuber.com", "nuvid.com", "eporner.com", "fuq.com", "porntrex.com", "porndig.com", "hqporner.com", "motherless.com", "thisvid.com", "rule34.xxx", "gelbooru.com", "danbooru.donmai.us", "booru.org"],
  "adult-sensitive.live": ["bongacams.com", "cam4.com", "livejasmin.com", "myfreecams.com", "camsoda.com", "flirt4free.com", "streamate.com", "camwhores.tv", "camvideos.tv"],
  "adult-sensitive.dating": ["ashleymadison.com", "seeking.com", "alt.com", "benaughty.com", "flirt.com", "adultsearch.com", "doublelist.com", "locanto.com", "bedpage.com", "skokka.com", "megapersonals.eu"],
  "other-sites.generic": ["sites.google.com", "docs.google.com", "drive.google.com", "notion.site", "notion.so", "carrd.co", "about.me", "linktr.ee", "beacons.ai", "bio.site", "taplink.cc", "campsite.bio", "msha.ke", "solo.to", "contactinbio.com", "lnk.bio", "linkpop.com", "milkshake.app", "read.cv", "resume.io", "canva.site", "adobe.com", "behance.net", "dribbble.com", "issuu.com", "slideshare.net", "scribd.com", "academia.edu", "calendly.com", "cal.com", "typeform.com", "airtable.com", "forms.gle", "github.io", "gitlab.io", "vercel.app", "netlify.app", "pages.dev", "firebaseapp.com", "web.app", "herokuapp.com", "glitch.me", "weebly.com", "wixsite.com", "wordpress.com", "blogspot.com", "tumblr.com", "substack.com", "medium.com", "telegra.ph"]
};
const CORE_BALANCED_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "linkedin.com",
  "youtube.com",
  "reddit.com",
  "t.me",
  "telegram.me",
  "threads.net",
  "bsky.app",
  "pinterest.com",
  "snapchat.com",
  "gravatar.com",
  "github.com"
];
const CORE_SENSITIVE_DOMAINS = [
  "onlyfans.com",
  "fansly.com",
  "manyvids.com",
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "redtube.com",
  "youporn.com"
];
const CATEGORY_INDEX = buildCategoryIndex(CATEGORY_TREE);

export function classifyResult(result) {
  const host = hostFromUrl(result.url);
  const text = normalizeText([result.title, result.snippet, result.url].filter(Boolean).join(" "));
  const matched = matchCategory(host, text) || CATEGORY_INDEX.fallback;
  const riskTags = buildRiskTags({ category: matched.category, subcategory: matched.subcategory, text });
  const sensitivity = resolveSensitivity(matched.category, riskTags);

  return {
    host,
    categoryId: matched.category.id,
    categoryLabel: matched.category.label,
    subcategoryId: matched.subcategory.id,
    subcategoryLabel: matched.subcategory.label,
    platform: matched.platform || matched.subcategory.label,
    sensitivity,
    riskTags
  };
}

export function buildCategorySummary(results) {
  const summary = new Map();

  for (const result of results) {
    const classification = result.classification;
    if (!classification) continue;

    const current = summary.get(classification.categoryId) || {
      id: classification.categoryId,
      label: classification.categoryLabel,
      count: 0,
      subcategories: new Map()
    };

    current.count += 1;
    const sub = current.subcategories.get(classification.subcategoryId) || {
      id: classification.subcategoryId,
      label: classification.subcategoryLabel,
      count: 0
    };
    sub.count += 1;
    current.subcategories.set(classification.subcategoryId, sub);
    summary.set(classification.categoryId, current);
  }

  return [...summary.values()].map((category) => ({
    ...category,
    subcategories: [...category.subcategories.values()].sort((a, b) => b.count - a.count)
  }));
}

export function publicTaxonomy() {
  return CATEGORY_TREE.map((category) => ({
    id: category.id,
    label: category.label,
    sensitive: Boolean(category.sensitive),
    subcategories: category.subcategories.map((subcategory) => ({
      id: subcategory.id,
      label: subcategory.label
    }))
  }));
}

export function searchScopeDomains({ includeSensitiveSources = false, scanDepth = "balanced" } = {}) {
  const allDomains = allScopeDomains({ includeSensitiveSources });

  if (scanDepth === "balanced") {
    const core = includeSensitiveSources
      ? [...CORE_BALANCED_DOMAINS, ...CORE_SENSITIVE_DOMAINS]
      : CORE_BALANCED_DOMAINS;
    const rest = allDomains.filter((domain) => !core.includes(domain));
    return uniqueDomains([...core.filter((domain) => allDomains.includes(domain)), ...rest]);
  }

  return allDomains;
}

export function publicSearchSources(options = {}) {
  const activeDomains = new Set(searchScopeDomains(options));
  const categories = [];

  for (const category of CATEGORY_TREE) {
    const subcategories = [];

    for (const subcategory of category.subcategories) {
      const domains = domainsForSubcategory(subcategory).filter((domain) => activeDomains.has(domain));
      if (domains.length > 0) {
        subcategories.push({
          id: subcategory.id,
          label: subcategory.label,
          domains
        });
      }
    }

    if (subcategories.length > 0) {
      categories.push({
        id: category.id,
        label: category.label,
        sensitive: Boolean(category.sensitive),
        subcategories
      });
    }
  }

  return categories;
}

function allScopeDomains({ includeSensitiveSources = false } = {}) {
  const standardDomains = [];
  const sensitiveDomains = [];

  for (const category of CATEGORY_TREE) {
    for (const subcategory of category.subcategories) {
      const target = category.sensitive ? sensitiveDomains : standardDomains;
      target.push(...domainsForSubcategory(subcategory));
    }
  }

  return includeSensitiveSources
    ? uniqueDomains([...CORE_BALANCED_DOMAINS, ...CORE_SENSITIVE_DOMAINS, ...standardDomains, ...sensitiveDomains])
    : uniqueDomains(standardDomains);
}

function uniqueDomains(domains) {
  return [...new Set(domains)].filter(Boolean);
}

function matchCategory(host, text) {
  for (const candidate of CATEGORY_INDEX.domainMatchers) {
    if (host === candidate.domain || host.endsWith(`.${candidate.domain}`)) {
      return candidate;
    }
  }

  for (const candidate of CATEGORY_INDEX.keywordMatchers) {
    if (candidate.keywords.some((keyword) => text.includes(keyword))) {
      return candidate;
    }
  }

  return null;
}

function buildCategoryIndex(tree) {
  const domainMatchers = [];
  const keywordMatchers = [];
  let fallback;

  for (const category of tree) {
    for (const subcategory of category.subcategories) {
      const candidate = {
        category,
        subcategory,
        platform: subcategory.label
      };

      for (const domain of domainsForSubcategory(subcategory)) {
        domainMatchers.push({ ...candidate, domain });
      }

      if (subcategory.keywords?.length) {
        keywordMatchers.push({
          ...candidate,
          keywords: subcategory.keywords.map(normalizeText)
        });
      }

      if (subcategory.id === "other-sites.generic") {
        fallback = candidate;
      }
    }
  }

  return { domainMatchers, keywordMatchers, fallback };
}

function buildRiskTags({ category, subcategory, text }) {
  const tags = [];

  if (SENSITIVE_CATEGORY_IDS.has(category.id)) {
    tags.push("adult-sensitive");
  }

  if (HIGH_RISK_CATEGORY_IDS.has(category.id)) {
    tags.push("exposure-risk");
  }

  if (subcategory.id.includes("doxxing")) {
    tags.push("threat-or-doxxing");
  }

  if (["telefon", "phone", "email", "e-posta", "address", "adres"].some((term) => text.includes(term))) {
    tags.push("contact-data");
  }

  return [...new Set(tags)];
}

function domainsForSubcategory(subcategory) {
  return uniqueDomains([...(subcategory.domains || []), ...(EXTRA_SUBCATEGORY_DOMAINS[subcategory.id] || [])]);
}

function resolveSensitivity(category, riskTags) {
  if (SENSITIVE_CATEGORY_IDS.has(category.id)) {
    return "adult";
  }

  if (HIGH_RISK_CATEGORY_IDS.has(category.id) || riskTags.includes("threat-or-doxxing")) {
    return "high-risk";
  }

  return "standard";
}

function hostFromUrl(url = "") {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "bilinmeyen-kaynak";
  }
}

function normalizeText(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr");
}
