// Holehe-style e-posta probe layer.
//
// Verilen bir e-posta adresinin belirli platformlarda kayıtlı bir hesapla
// ilişkili olup olmadığını, signup / forgot-password / availability endpoint'lerine
// hassas POST/GET istekleri atarak tespit eder. Hiçbir e-posta gönderilmez.
//
// Her modül bir nesne döndürür:
//   { used: true,  deletionUrl, snippet? }   → kayıtlı hesap bulundu
//   { used: false } veya null                → bulunamadı / belirsiz
//
// Modüller başarısız olursa null döndürür; framework asla throw etmez.
// Endpoint'ler zamanla bozulabilir; her modül kendi içinde graceful fail.

const PROBE_TIMEOUT_MS = 8_000;
const CONCURRENCY = 10;

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
];

function ua() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function safeFetch(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "User-Agent": ua(),
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        ...(init.headers || {})
      },
      signal: controller.signal,
      redirect: "follow"
    });
    const text = await response.text().catch(() => "");
    return { status: response.status, text, headers: response.headers };
  } catch {
    return null;
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

// ---------- modüller ----------
// Her modül: { name, category, run(email): Promise<hit | null> }

const MODULES = [
  {
    name: "Spotify",
    category: "creator",
    homepage: "https://www.spotify.com/",
    deletionUrl: "https://support.spotify.com/article/close-account/",
    async run(email) {
      const url = `https://spclient.wg.spotify.com/signup/public/v1/account?validate=1&email=${encodeURIComponent(email)}`;
      const r = await safeFetch(url, {
        headers: { Accept: "application/json" }
      });
      if (!r) return null;
      const data = safeJson(r.text);
      if (!data) return null;
      // status: 20 → email is invalid (not registered yet); status: 1 → ok (taken)
      // Modern Spotify: data.status === 20 means email already taken.
      if (data.status === 20 || data.statusCode === 20) {
        return {
          used: true,
          snippet: "Spotify hesabı bu e-posta üzerine kayıtlı (signup endpoint çakışma sinyali)."
        };
      }
      return null;
    }
  },
  {
    name: "Pinterest",
    category: "design",
    homepage: "https://www.pinterest.com/",
    deletionUrl: "https://help.pinterest.com/en/article/deactivate-or-close-your-account",
    async run(email) {
      const url = "https://www.pinterest.com/_ngjs/resource/EmailExistsResource/get/";
      const params = new URLSearchParams({
        source_url: "/",
        data: JSON.stringify({ options: { email }, context: {} })
      });
      const r = await safeFetch(`${url}?${params.toString()}`, {
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!r || r.status !== 200) return null;
      const data = safeJson(r.text);
      if (!data?.resource_response) return null;
      const exists = data.resource_response?.data === true;
      return exists
        ? {
            used: true,
            snippet: "Pinterest hesabı bu e-posta üzerine kayıtlı."
          }
        : null;
    }
  },
  {
    name: "Imgur",
    category: "design",
    homepage: "https://imgur.com/",
    deletionUrl: "https://help.imgur.com/hc/en-us/articles/208589726-How-to-Delete-Your-Account",
    async run(email) {
      const url = `https://imgur.com/signin/ajax_email_available?email=${encodeURIComponent(email)}`;
      const r = await safeFetch(url, {
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      if (!r) return null;
      const data = safeJson(r.text);
      if (data && data.data && data.data.available === false) {
        return {
          used: true,
          snippet: "Imgur hesabı bu e-posta üzerine kayıtlı."
        };
      }
      return null;
    }
  },
  {
    name: "Patreon",
    category: "creator",
    homepage: "https://www.patreon.com/",
    deletionUrl:
      "https://support.patreon.com/hc/en-us/articles/204606315-How-do-I-delete-my-account-",
    async run(email) {
      const url = `https://www.patreon.com/api/users?filter[email]=${encodeURIComponent(email)}`;
      const r = await safeFetch(url, {
        headers: { Accept: "application/vnd.api+json" }
      });
      if (!r) return null;
      const data = safeJson(r.text);
      if (Array.isArray(data?.data) && data.data.length > 0) {
        return {
          used: true,
          snippet: "Patreon API filter[email] bu adres için kullanıcı kaydı döndürdü."
        };
      }
      return null;
    }
  },
  {
    name: "Adobe",
    category: "design",
    homepage: "https://www.adobe.com/",
    deletionUrl: "https://helpx.adobe.com/manage-account/using/delete-account.html",
    async run(email) {
      const url = "https://adobeid-na1.services.adobe.com/ims/check/v1/account";
      const body = new URLSearchParams({
        client_id: "adobedotcom2",
        email
      });
      const r = await safeFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: body.toString()
      });
      if (!r) return null;
      const data = safeJson(r.text);
      // userStatus: 0 = unregistered, 1 = registered
      if (data && data.userStatus === 1) {
        return {
          used: true,
          snippet: "Adobe ID bu e-posta üzerine kayıtlı."
        };
      }
      return null;
    }
  },
  {
    name: "Anilist",
    category: "creator",
    homepage: "https://anilist.co/",
    deletionUrl: "https://anilist.co/forum/thread/4485",
    async run(email) {
      const url = "https://graphql.anilist.co/";
      const r = await safeFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          query: `query ($email:String){UserVerify(email:$email){available}}`,
          variables: { email }
        })
      });
      if (!r) return null;
      const data = safeJson(r.text);
      const available = data?.data?.UserVerify?.available;
      if (available === false) {
        return {
          used: true,
          snippet: "Anilist hesabı bu e-posta üzerine kayıtlı."
        };
      }
      return null;
    }
  }
];

export async function searchEmailProbes(subject) {
  const email = subject.email;
  if (!email || !email.includes("@")) {
    return {
      results: [],
      diagnostics: {
        mode: "email-probe",
        modulesProbed: 0,
        modulesTotal: MODULES.length,
        accountsFound: 0,
        reason: "Geçerli e-posta yok; e-posta probe atlandı."
      }
    };
  }

  const tasks = MODULES.map((mod) => async () => {
    try {
      const out = await mod.run(email);
      if (!out?.used) return null;
      return {
        result: {
          provider: "Email Probe",
          sourceType: "email-probe",
          title: `${mod.name} hesabı (e-posta üzerinde)`,
          url: mod.deletionUrl || mod.homepage,
          snippet: out.snippet,
          searchableText: `${mod.name} ${email} email hesap account`,
          platformKey: `email:${mod.name.toLowerCase()}`,
          platformCategory: mod.category,
          probeLabel: `e-posta kayıt sinyali`,
          probeConfidence: 0.92,
          evidenceHint: "email-direct-probe",
          query: `email-probe:${mod.name}:${email}`,
          fetchedAt: new Date().toISOString(),
          remediationUrlHint: mod.deletionUrl
        },
        module: mod
      };
    } catch {
      return null;
    }
  });

  const outcomes = await runWithConcurrency(tasks, CONCURRENCY);
  const hits = outcomes.filter(Boolean);

  return {
    results: hits.map((h) => h.result),
    diagnostics: {
      mode: "email-probe",
      modulesProbed: outcomes.length,
      modulesTotal: MODULES.length,
      accountsFound: hits.length,
      hitModules: hits.map((h) => h.module.name),
      reason: `${MODULES.length} platforma e-posta (${email}) ile kayıt sinyali probe atıldı; ${hits.length} kayıtlı hesap tespit edildi. Holehe pattern'i: signup/forgot-password çakışma cevabını okuma — e-posta gönderilmez.`
    }
  };
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
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}
