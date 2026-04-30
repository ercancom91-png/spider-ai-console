export async function getLocalAiStatus() {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(900)
    });

    if (!response.ok) {
      return { available: false, provider: "ollama", reason: `HTTP ${response.status}` };
    }

    const payload = await response.json();
    return {
      available: true,
      provider: "ollama",
      models: (payload.models || []).map((model) => model.name)
    };
  } catch {
    return {
      available: false,
      provider: "ollama",
      reason: "Ollama yerelde çalışmıyor."
    };
  }
}

export async function buildLocalAiBrief(report) {
  const status = await getLocalAiStatus();

  if (!status.available) {
    return {
      available: true,
      provider: "knock-local-rules",
      model: "deterministic-brief",
      fallback: true,
      reason: status.reason || "Yerel model hazır değil.",
      text: buildDeterministicBrief(report)
    };
  }

  const model = process.env.LOCAL_AI_MODEL || status.models?.[0] || "llama3";
  const messages = buildMessages(report);

  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 110
        }
      }),
      signal: AbortSignal.timeout(8_000)
    });

    if (!response.ok) {
      return localFallback(report, model, `HTTP ${response.status}`);
    }

    const payload = await response.json();
    const text = cleanBrief(payload.message?.content || payload.response);
    if (!isUsableBrief(text)) {
      return localFallback(report, model, "Yerel model çıktısı kalite kapısından geçmedi.");
    }

    return {
      available: true,
      provider: "ollama",
      model,
      text
    };
  } catch (error) {
    return localFallback(report, model, error.message || "Yerel model yanıt vermedi.");
  }
}

function buildMessages(report) {
  const categories = (report.categories || [])
    .map((category) => `${category.label}: ${category.count}`)
    .join(", ");
  const topResults = (report.results || [])
    .slice(0, 5)
    .map(
      (result) =>
        `${result.classification.categoryLabel}/${result.classification.subcategoryLabel} - ${result.matchLevel} - ${safeHost(result.url)}`
    )
    .join("\n");

  return [
    {
      role: "system",
      content:
        "Turkce yaz. Sadece kullaniciya gosterilecek nihai metni ver. Promptu tekrar etme. Kisi hakkinda tahmin, karakter yorumu veya hassas cikarim yapma. 3 kisa cumle yaz."
    },
    {
      role: "user",
      content: [
        `Taranan sonuc: ${report.summary.totalCandidates}`,
        `Eslesen kaynak: ${report.summary.exactEvidenceResults}`,
        `Dogrulanmis: ${report.summary.confirmed}`,
        `Guclu: ${report.summary.strong}`,
        `Inceleme: ${report.summary.review}`,
        `Kategoriler: ${categories || "yok"}`,
        `Ilk sonuclar: ${topResults || "Birebir eslesen sonuc yok."}`,
        "Ozetle: ne bulundu, ne kadar guvenilir, ilk pratik adim ne?"
      ].join("\n")
    }
  ];
}

function cleanBrief(value = "") {
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

function isUsableBrief(text) {
  if (!text || text.length < 70) return false;
  if (text.endsWith("...")) return false;
  if (/sen knock|prompt|nihai metni|kisa cumle|cümle yaz|cumle yaz|aşağıdaki|asagidaki/i.test(text)) {
    return false;
  }
  if (/adayın|adayin|online varlığını|online varligini|bakılması gerekir|bakilmasi gerekir/i.test(text)) {
    return false;
  }
  if (/^here are|the individual|verified results|likely to|their profile/i.test(text)) {
    return false;
  }
  if (!/(kaynak|kanıt|kanit|eşleş|esles|tarandı|tarandi|kaldır|kaldir|gizle|sil)/i.test(text)) {
    return false;
  }
  return true;
}

function localFallback(report, model, reason) {
  return {
    available: true,
    provider: "knock-local-rules",
    model,
    fallback: true,
    reason,
    text: buildDeterministicBrief(report)
  };
}

function buildDeterministicBrief(report) {
  const evidence = report.summary.exactEvidenceResults;
  const candidates = report.summary.totalCandidates;
  const topCategory = report.categories?.[0];
  const firstResult = report.results?.[0];
  const source = firstResult ? safeHost(firstResult.url) : "";

  if (!evidence) {
    return `${candidates} sonuç tarandı; eşleşme veren kaynak çıkmadı. Bu, webde hiçbir iz yok demek değil; yalnızca bu çalışmada e-posta, telefon, kullanıcı adı veya isim için yeterli eşleşme bulunmadı. Daha geniş kapsam için SPIDER Index'e yeni açık seed kaynakları ekleyip tekrar arama yap.`;
  }

  const categoryText = topCategory
    ? `${topCategory.label} / ${topCategory.subcategories?.[0]?.label || "Genel"}`
    : "Genel web";
  const levelText =
    report.summary.confirmed > 0
      ? "doğrulanmış"
      : report.summary.strong > 0
        ? "güçlü"
        : "inceleme gereken";
  const sourceText = source ? ` İlk kaynak ${source}.` : "";

  return `${candidates} sonuç tarandı; ${evidence} kaynak eşleşme verdi. En yoğun eşleşme ${categoryText} alanında ve güven seviyesi ${levelText}.${sourceText} İlk adım kaynağı açıp profil/veri görünürlüğünü kapatmak; olmazsa karttaki support, abuse veya arama sonucu kaldırma bağlantılarını kullanmak.`;
}

function safeHost(url = "") {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "bilinmeyen kaynak";
  }
}
