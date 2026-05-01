const ONBOARDED_KEY = "spider.onboarded";
const LICENSE_KEY_STORAGE = "spider.licenseKey";
const LICENSE_CACHE_KEY = "spider.licenseCache";

const form = document.querySelector("#search-form");
const fields = form.elements;
const formStatus = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-button");

const indexPill = document.querySelector("#index-pill");
const aiPill = document.querySelector("#ai-pill");
const licenseToggle = document.querySelector("#license-toggle");
const licenseLabel = document.querySelector("#license-label");

const progressPanel = document.querySelector("#progress-panel");
const progressTitle = document.querySelector("#progress-title");
const progressPercent = document.querySelector("#progress-percent");
const progressFill = document.querySelector("#progress-fill");
const progressEngines = document.querySelector("#progress-engines");

const resultsSection = document.querySelector("#results-section");
const resultTitleEl = document.querySelector("#result-title");
const resultSubtitleEl = document.querySelector("#result-subtitle");
const summaryMetricsEl = document.querySelector("#summary-metrics");
const aiBriefEl = document.querySelector("#ai-brief");
const filterBarEl = document.querySelector("#filter-bar");
const tierChipsEl = document.querySelector("#tier-chips");
const categoryChipsEl = document.querySelector("#category-chips");
const sortSelectEl = document.querySelector("#sort-select");
const resultsEl = document.querySelector("#results");
const resultsBody = document.querySelector(".results-body");
const subcategoryPanel = document.querySelector("#subcategory-panel");
const subcategoryList = document.querySelector("#subcategory-list");
const subcategoryTitle = document.querySelector("#subcategory-title");

const onboardingDialog = document.querySelector("#onboarding-dialog");
const licenseDialog = document.querySelector("#license-dialog");
const licenseForm = document.querySelector("#license-form");
const licenseKeyInput = document.querySelector("#license-key-input");
const licenseFeedback = document.querySelector("#license-feedback");
const licenseClearBtn = document.querySelector("#license-clear");

const premiumSection = document.querySelector("#premium-section");
const premiumStatusEl = document.querySelector("#premium-status");
const premiumBodyEl = document.querySelector("#premium-body");
const premiumPhotoDialog = document.querySelector("#premium-photo-dialog");
const premiumPhotoForm = document.querySelector("#premium-photo-form");
const referencePhotoInput = document.querySelector("#reference-photo");
const premiumPhotoFeedback = document.querySelector("#premium-photo-feedback");

const state = {
  report: null,
  photoHash: "",
  visualFingerprint: null,
  filterTier: "all",
  filterCategory: "all",
  filterSubcategory: "all",
  sort: "tier"
};

const TIER_LABEL = {
  direct: "Tam Eşleşme",
  strong: "Güçlü",
  mention: "Bahsediyor"
};

const ENGINE_LIST = [
  { id: "knock-live", name: "SPIDER Live" },
  { id: "knock-index", name: "SPIDER Index" },
  { id: "spider-images", name: "Görsel motoru" },
  { id: "profile-probe", name: "Profil probe" },
  { id: "brave", name: "Brave Search" },
  { id: "mojeek", name: "Mojeek" },
  { id: "yandex", name: "Yandex" },
  { id: "github", name: "GitHub" },
  { id: "stackoverflow", name: "Stack Overflow" },
  { id: "reddit", name: "Reddit" },
  { id: "hackernews", name: "Hacker News" },
  { id: "wayback", name: "Wayback" },
  { id: "wikipedia", name: "Wikipedia" },
  { id: "searx", name: "SearX" }
];

init();

function init() {
  if (!localStorage.getItem(ONBOARDED_KEY)) {
    onboardingDialog.showModal();
  }

  onboardingDialog.addEventListener("close", () => {
    localStorage.setItem(ONBOARDED_KEY, new Date().toISOString());
  });

  form.addEventListener("submit", handleSearch);
  fields.photo.addEventListener("change", handlePhotoChange);

  licenseToggle.addEventListener("click", openLicenseDialog);
  licenseForm.addEventListener("submit", handleLicenseSubmit);
  licenseClearBtn.addEventListener("click", handleLicenseClear);

  tierChipsEl.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-tier]");
    if (!chip) return;
    state.filterTier = chip.dataset.tier;
    renderFilters();
    renderResults();
  });

  categoryChipsEl.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (!chip) return;
    state.filterCategory = chip.dataset.category;
    state.filterSubcategory = "all";
    ensureTierStillSelectable();
    renderFilters();
    renderSubcategoryPanel();
    renderResults();
  });

  subcategoryList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-subcategory]");
    if (!btn) return;
    state.filterSubcategory = btn.dataset.subcategory;
    ensureTierStillSelectable();
    renderFilters();
    renderSubcategoryPanel();
    renderResults();
  });

  sortSelectEl.addEventListener("change", () => {
    state.sort = sortSelectEl.value;
    renderResults();
  });

  premiumSection.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-premium-action]");
    if (!trigger) return;
    if (trigger.dataset.premiumAction === "open-license") {
      openLicenseDialog();
    } else if (trigger.dataset.premiumAction === "run-photos") {
      premiumPhotoFeedback.textContent = "";
      premiumPhotoDialog.showModal();
    }
  });

  premiumPhotoForm.addEventListener("submit", handlePremiumPhotoSubmit);

  loadConfig();
  restoreLicense();
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    const config = await response.json();
    indexPill.textContent = `${config.index?.documents ?? 0} doküman`;
    aiPill.textContent = config.ai?.available ? "Local AI hazır" : "Local AI kural modu";
  } catch {
    indexPill.textContent = "index yok";
    aiPill.textContent = "AI yok";
  }
}

async function handlePhotoChange() {
  const [file] = fields.photo.files;
  state.photoHash = "";
  state.visualFingerprint = null;

  if (!file || !file.type.startsWith("image/")) {
    return;
  }

  try {
    state.photoHash = await sha256(file);
    state.visualFingerprint = await buildVisualFingerprint(file, state.photoHash);
    formStatus.textContent = `Görsel imza hazır (${state.visualFingerprint.averageHash.slice(0, 8)}).`;
  } catch (error) {
    formStatus.textContent = `Görsel okunamadı: ${error.message}`;
  }
}

async function handleSearch(event) {
  event.preventDefault();
  submitButton.disabled = true;
  formStatus.textContent = "";
  resultsSection.hidden = true;
  filterBarEl.hidden = true;
  startProgressSimulation();

  const includeSensitive = fields.includeSensitiveSources.value === "true";

  const payload = {
    subject: {
      fullName: fields.fullName.value,
      email: fields.email.value,
      phone: fields.phone.value,
      username: fields.username.value,
      photoHash: state.photoHash,
      visualFingerprint: state.visualFingerprint
    },
    consent: {
      includeSensitiveSources: includeSensitive,
      acceptedSensitiveNotice: includeSensitive
    },
    search: {
      scanDepth: fields.scanDepth.value
    }
  };

  try {
    const response = await fetch("/api/browser/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...licenseHeaders()
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    completeProgressSimulation();

    if (!response.ok) {
      renderErrors(data.errors || [data.error || "Arama başarısız."]);
      return;
    }

    state.report = data;
    state.filterTier = "all";
    state.filterCategory = "all";
    state.filterSubcategory = "all";
    state.sort = sortSelectEl.value || "tier";

    resultsSection.hidden = false;
    renderSummary();
    renderAiBrief();
    renderFilters();
    renderSubcategoryPanel();
    renderResults();
    formStatus.textContent = "Arama tamam.";
  } catch (error) {
    completeProgressSimulation();
    renderErrors([error.message]);
  } finally {
    submitButton.disabled = false;
  }
}

let progressTimer = null;

function startProgressSimulation() {
  progressPanel.hidden = false;
  progressTitle.textContent = "Motorlar çalışıyor";
  progressPercent.textContent = "0%";
  progressFill.style.width = "0%";

  progressEngines.innerHTML = ENGINE_LIST
    .map(
      (engine, index) =>
        `<li class="progress-engine" data-engine="${engine.id}" data-index="${index}">${escape(engine.name)}</li>`
    )
    .join("");

  let step = 0;
  const total = ENGINE_LIST.length;
  const activeEngines = new Set();
  clearInterval(progressTimer);

  progressTimer = setInterval(() => {
    const nextIndex = Math.min(step, total - 1);
    const engine = ENGINE_LIST[nextIndex];
    if (engine) {
      const el = progressEngines.querySelector(`[data-engine="${engine.id}"]`);
      if (el) {
        el.classList.add("active");
        activeEngines.add(engine.id);
      }
      if (step >= 2) {
        const finishedIndex = step - 2;
        const finished = ENGINE_LIST[finishedIndex];
        if (finished) {
          const finishedEl = progressEngines.querySelector(`[data-engine="${finished.id}"]`);
          finishedEl?.classList.remove("active");
          finishedEl?.classList.add("done");
        }
      }
    }
    step += 1;
    const pct = Math.min(Math.round(((step - 1) / total) * 92), 92);
    progressFill.style.width = `${pct}%`;
    progressPercent.textContent = `${pct}%`;

    if (step > total + 1) {
      clearInterval(progressTimer);
    }
  }, 450);
}

function completeProgressSimulation() {
  clearInterval(progressTimer);
  progressFill.style.width = "100%";
  progressPercent.textContent = "100%";
  progressTitle.textContent = "Tamamlandı";
  progressEngines.querySelectorAll(".progress-engine").forEach((el) => {
    el.classList.remove("active");
    el.classList.add("done");
  });
  setTimeout(() => {
    progressPanel.hidden = true;
  }, 650);
}

function renderSummary() {
  const { summary } = state.report;
  const tiers = summary.tiers || { direct: 0, strong: 0, mention: 0 };

  resultTitleEl.textContent =
    summary.exactEvidenceResults === 0
      ? `${summary.totalCandidates} sonuç tarandı, eşleşme yok`
      : `${summary.exactEvidenceResults} eşleşme bulundu`;

  resultSubtitleEl.textContent =
    summary.exactEvidenceResults === 0
      ? "Kanıt taşımayan sonuçlar listelenmez."
      : `${tiers.direct} tam · ${tiers.strong} güçlü · ${tiers.mention} bahsediyor`;

  summaryMetricsEl.innerHTML = [
    metric("Tam", tiers.direct, tiers.direct ? "direct" : ""),
    metric("Güçlü", tiers.strong, tiers.strong ? "strong-tier" : ""),
    metric("Bahsediyor", tiers.mention, ""),
    metric("Site", summary.uniqueSources, "")
  ].join("");
}

function metric(label, value, className) {
  return `<div class="metric ${className}"><strong>${value}</strong><span>${escape(label)}</span></div>`;
}

function renderAiBrief() {
  const brief = state.report?.aiBrief;
  if (!brief?.text) {
    aiBriefEl.classList.remove("visible");
    aiBriefEl.innerHTML = "";
    return;
  }
  aiBriefEl.classList.add("visible");
  aiBriefEl.innerHTML = `<strong>AI brief</strong><p>${escape(brief.text)}</p>`;
}

function renderFilters() {
  if (!state.report) {
    filterBarEl.hidden = true;
    return;
  }

  filterBarEl.hidden = false;
  const results = state.report.results || [];
  const total = results.length;

  const inCategory = results.filter(
    (r) =>
      (state.filterCategory === "all" || r.classification?.categoryId === state.filterCategory) &&
      (state.filterSubcategory === "all" ||
        r.classification?.subcategoryId === state.filterSubcategory)
  );
  const tierCounts = { direct: 0, strong: 0, mention: 0 };
  for (const r of inCategory) {
    if (tierCounts[r.matchTier] != null) tierCounts[r.matchTier] += 1;
  }

  tierChipsEl.innerHTML = [
    tierChip("all", "Tümü", inCategory.length),
    tierChip("direct", TIER_LABEL.direct, tierCounts.direct),
    tierChip("strong", TIER_LABEL.strong, tierCounts.strong),
    tierChip("mention", TIER_LABEL.mention, tierCounts.mention)
  ].join("");

  const categories = state.report.categories || [];
  const categoryChips = [
    categoryChip("all", "Tüm kategoriler", total),
    ...categories.map((c) => categoryChip(c.id, c.label, c.count))
  ];
  categoryChipsEl.innerHTML = categoryChips.join("");
}

function ensureTierStillSelectable() {
  if (!state.report || state.filterTier === "all") return;
  const results = state.report.results || [];
  const hasMatch = results.some(
    (r) =>
      r.matchTier === state.filterTier &&
      (state.filterCategory === "all" || r.classification?.categoryId === state.filterCategory) &&
      (state.filterSubcategory === "all" ||
        r.classification?.subcategoryId === state.filterSubcategory)
  );
  if (!hasMatch) state.filterTier = "all";
}

function renderSubcategoryPanel() {
  if (!state.report) return;
  const categories = state.report.categories || [];
  const activeCategory = categories.find((c) => c.id === state.filterCategory);

  if (!activeCategory || !activeCategory.subcategories?.length || activeCategory.subcategories.length < 2) {
    resultsBody.classList.remove("with-panel");
    subcategoryPanel.hidden = true;
    return;
  }

  resultsBody.classList.add("with-panel");
  subcategoryPanel.hidden = false;
  subcategoryTitle.textContent = activeCategory.label;

  const items = [
    {
      id: "all",
      label: `Tüm ${activeCategory.label}`,
      count: activeCategory.count
    },
    ...activeCategory.subcategories.map((s) => ({ id: s.id, label: s.label, count: s.count }))
  ];

  subcategoryList.innerHTML = items
    .map(
      (item) => `
      <li>
        <button type="button" data-subcategory="${escape(item.id)}" class="${state.filterSubcategory === item.id ? "active" : ""}">
          <span>${escape(item.label)}</span>
          <span class="count">${item.count}</span>
        </button>
      </li>`
    )
    .join("");
}

function tierChip(tier, label, count) {
  const active = state.filterTier === tier ? "active" : "";
  const tierClass = tier === "all" ? "" : `tier-${tier}`;
  return `<button type="button" class="chip ${tierClass} ${active}" data-tier="${tier}">
    ${escape(label)} <span class="count">${count}</span>
  </button>`;
}

function categoryChip(id, label, count) {
  const active = state.filterCategory === id ? "active" : "";
  return `<button type="button" class="chip ${active}" data-category="${escape(id)}">
    ${escape(label)} <span class="count">${count}</span>
  </button>`;
}

function renderResults() {
  if (!state.report) return;

  const filtered = (state.report.results || [])
    .filter((r) => state.filterTier === "all" || r.matchTier === state.filterTier)
    .filter(
      (r) => state.filterCategory === "all" || r.classification?.categoryId === state.filterCategory
    )
    .filter(
      (r) =>
        state.filterSubcategory === "all" ||
        r.classification?.subcategoryId === state.filterSubcategory
    );

  const sorted = sortResults(filtered, state.sort);

  if (sorted.length === 0) {
    resultsEl.innerHTML = `<li class="empty-state">
      <strong>Bu filtrelerde sonuç yok.</strong>
      <span>Kademe, kategori veya alt kategori filtresini genişlet.</span>
    </li>`;
    return;
  }

  resultsEl.innerHTML = sorted.map(renderResultCard).join("");
}

function sortResults(results, sort) {
  const copy = [...results];
  const tierRank = { direct: 3, strong: 2, mention: 1 };

  if (sort === "score") {
    copy.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (sort === "source") {
    copy.sort((a, b) => host(a.url).localeCompare(host(b.url)));
  } else if (sort === "recent") {
    copy.sort((a, b) => new Date(b.fetchedAt || 0) - new Date(a.fetchedAt || 0));
  } else {
    copy.sort((a, b) => {
      const tierDiff = (tierRank[b.matchTier] || 0) - (tierRank[a.matchTier] || 0);
      if (tierDiff !== 0) return tierDiff;
      return (b.score || 0) - (a.score || 0);
    });
  }

  return copy;
}

function renderResultCard(result) {
  const tier = result.matchTier || "mention";
  const tierLabel = TIER_LABEL[tier] || "—";
  const category = result.classification?.categoryLabel || "";
  const subcategory = result.classification?.subcategoryLabel || "";
  const sensitivity = result.classification?.sensitivity || "standard";
  const sensitivityTag =
    sensitivity === "adult" || sensitivity === "high-risk"
      ? `<span class="tag sensitive">${escape(sensitivityLabel(sensitivity))}</span>`
      : "";

  const evidenceTags = (result.evidence || [])
    .slice(0, 4)
    .map((e) => {
      const text = e.label ? (e.value ? `${e.label}: ${e.value}` : e.label) : String(e);
      return `<span class="tag ${tier === "direct" ? "copper" : ""}">${escape(text)}</span>`;
    })
    .join("");

  return `
    <li class="result-card tier-${tier}">
      <div class="result-head">
        <div class="result-title">
          <a href="${escape(result.url)}" target="_blank" rel="noreferrer">${escape(result.title || result.url)}</a>
          <div class="result-meta">
            <span>${escape(host(result.url))}</span>
            <span>·</span>
            <span>${escape(result.provider || "")}</span>
            ${result.score ? `<span>· skor ${Math.round(result.score)}</span>` : ""}
          </div>
        </div>
        <span class="tier-badge tier-${tier}">${escape(tierLabel)}</span>
      </div>
      ${result.snippet ? `<p class="snippet">${escape(result.snippet)}</p>` : ""}
      <div class="result-footer">
        ${category ? `<span class="tag">${escape(category)}</span>` : ""}
        ${subcategory ? `<span class="tag">${escape(subcategory)}</span>` : ""}
        ${sensitivityTag}
        ${evidenceTags}
      </div>
      ${renderRemediation(result.remediation)}
    </li>
  `;
}

function renderRemediation(remediation) {
  const actions = remediation?.actions || [];
  if (!actions.length) return "";

  const priorityRank = { urgent: 3, high: 2, medium: 1, low: 0 };
  const sorted = [...actions].sort(
    (a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0)
  );

  const items = sorted
    .map((action) => {
      const linkPrimary = action.url
        ? `<a class="rem-link" href="${escape(action.url)}" target="_blank" rel="noreferrer">Aç</a>`
        : "";
      const linkSecondary = action.secondaryUrl
        ? `<a class="rem-link rem-link-alt" href="${escape(action.secondaryUrl)}" target="_blank" rel="noreferrer">Alternatif</a>`
        : "";
      const priorityTag = action.priority
        ? `<span class="rem-priority rem-${escape(action.priority)}">${escape(priorityLabel(action.priority))}</span>`
        : "";
      return `
        <li class="rem-item">
          <div class="rem-head">
            ${priorityTag}
            <strong>${escape(action.title)}</strong>
          </div>
          ${action.description ? `<p>${escape(action.description)}</p>` : ""}
          <div class="rem-actions">${linkPrimary}${linkSecondary}</div>
        </li>`;
    })
    .join("");

  return `
    <details class="result-remediation">
      <summary>
        <span class="rem-summary-label">Hesap silme / kaldırma adımları</span>
        <span class="rem-count">${actions.length}</span>
      </summary>
      <ol class="rem-list">${items}</ol>
    </details>
  `;
}

function priorityLabel(priority) {
  if (priority === "urgent") return "Acil";
  if (priority === "high") return "Yüksek";
  if (priority === "medium") return "Orta";
  return "Düşük";
}

function renderErrors(errors) {
  formStatus.textContent = "Arama durdu.";
  state.report = null;
  resultsSection.hidden = false;
  filterBarEl.hidden = true;
  summaryMetricsEl.innerHTML = "";
  aiBriefEl.classList.remove("visible");
  resultsEl.innerHTML = errors
    .map((e) => `<li class="empty-state"><strong>Hata.</strong><span>${escape(e)}</span></li>`)
    .join("");
}

function openLicenseDialog() {
  const cached = readLicenseCache();
  licenseKeyInput.value = localStorage.getItem(LICENSE_KEY_STORAGE) || "";
  if (cached?.valid) {
    licenseFeedback.textContent = `${cached.tier} — ${cached.daysLeft ?? "—"} gün kaldı.`;
    licenseFeedback.className = "license-feedback ok";
  } else {
    licenseFeedback.textContent = "";
    licenseFeedback.className = "license-feedback";
  }
  licenseDialog.showModal();
}

async function handleLicenseSubmit(event) {
  if (event.submitter?.value !== "validate") return;
  event.preventDefault();
  const key = (licenseKeyInput.value || "").trim();
  if (!key) {
    licenseFeedback.textContent = "Anahtar boş olamaz.";
    licenseFeedback.className = "license-feedback error";
    return;
  }

  try {
    const response = await fetch("/api/license/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });
    const data = await response.json();
    if (!data.valid) {
      licenseFeedback.textContent = data.reason || "Geçersiz anahtar.";
      licenseFeedback.className = "license-feedback error";
      return;
    }
    localStorage.setItem(LICENSE_KEY_STORAGE, key);
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(data));
    applyLicenseState(data);
    licenseFeedback.textContent = `Geçerli: ${data.tier} (${data.daysLeft} gün).`;
    licenseFeedback.className = "license-feedback ok";
    setTimeout(() => licenseDialog.close(), 700);
  } catch (error) {
    licenseFeedback.textContent = `Doğrulama başarısız: ${error.message}`;
    licenseFeedback.className = "license-feedback error";
  }
}

function handleLicenseClear(event) {
  event.preventDefault();
  localStorage.removeItem(LICENSE_KEY_STORAGE);
  localStorage.removeItem(LICENSE_CACHE_KEY);
  licenseKeyInput.value = "";
  licenseFeedback.textContent = "Anahtar temizlendi.";
  licenseFeedback.className = "license-feedback";
  applyLicenseState({ valid: false, tier: "free" });
}

function restoreLicense() {
  const cached = readLicenseCache();
  applyLicenseState(cached?.valid ? cached : { valid: false, tier: "free" });
}

function readLicenseCache() {
  try {
    return JSON.parse(localStorage.getItem(LICENSE_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function applyLicenseState(license) {
  const isPremium = license?.valid && license.tier === "premium";
  licenseToggle.classList.toggle("premium", isPremium);
  licenseLabel.textContent = isPremium
    ? `Premium · ${license.daysLeft ?? "—"}g`
    : "Ücretsiz";

  if (isPremium) {
    premiumStatusEl.textContent = "aktif";
    premiumStatusEl.className = "premium-status unlocked";
    premiumBodyEl.classList.remove("locked");
    premiumBodyEl.innerHTML = `
      <div class="premium-actions">
        <button type="button" class="primary-button" data-premium-action="run-photos">
          Referans foto ile ara
        </button>
        <button type="button" class="ghost-button" data-premium-action="open-license">
          Anahtarı değiştir
        </button>
      </div>
      <p class="snippet">Wayback + cache + public arşivleri tarar. Yüz doğrulanmayan görsel gösterilmez.</p>
      <div id="premium-photo-results"></div>
    `;
  } else {
    premiumStatusEl.textContent = "kilitli";
    premiumStatusEl.className = "premium-status locked";
    premiumBodyEl.classList.add("locked");
    premiumBodyEl.innerHTML = `
      <div class="premium-locked">
        <div class="lock-icon" aria-hidden="true">◇</div>
        <strong>Premium lisansla aç</strong>
        <span>Sağ üstten anahtar gir.</span>
        <button type="button" class="primary-button" data-premium-action="open-license">
          Anahtar gir
        </button>
      </div>
    `;
  }
}

async function handlePremiumPhotoSubmit(event) {
  if (event.submitter?.value !== "run") return;
  event.preventDefault();

  const [file] = referencePhotoInput.files;
  if (!file) {
    premiumPhotoFeedback.textContent = "Referans foto seç.";
    premiumPhotoFeedback.className = "license-feedback error";
    return;
  }

  premiumPhotoDialog.close();
  const target = document.querySelector("#premium-photo-results");
  if (target) {
    target.innerHTML = `
      <div class="progress-track" style="margin-top:12px"><div class="progress-fill" style="width:8%"></div></div>
      <p class="snippet" style="margin-top:8px">Arşivler taranıyor ve yüzler doğrulanıyor...</p>
    `;
  }

  const subject = {
    fullName: fields.fullName.value,
    email: fields.email.value,
    phone: fields.phone.value,
    username: fields.username.value
  };

  let referencePhoto = null;
  try {
    referencePhoto = await fileToDataUrl(file);
  } catch (error) {
    if (target) target.innerHTML = `<p class="snippet">Foto okunamadı: ${escape(error.message)}</p>`;
    return;
  }

  const fill = target?.querySelector(".progress-fill");
  let tick = 0;
  const fakeTimer = setInterval(() => {
    tick += 1;
    if (fill) fill.style.width = `${Math.min(8 + tick * 9, 85)}%`;
  }, 450);

  try {
    const response = await fetch("/api/premium/deleted-photos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...licenseHeaders()
      },
      body: JSON.stringify({ subject, referencePhoto, options: {} })
    });
    const data = await response.json();
    clearInterval(fakeTimer);

    if (!response.ok) {
      if (target) target.innerHTML = `<p class="snippet">${escape(data.error || "Arama başarısız.")}</p>`;
      return;
    }

    if (fill) fill.style.width = "100%";
    setTimeout(() => renderPremiumPhotoResults(data), 250);
  } catch (error) {
    clearInterval(fakeTimer);
    if (target) target.innerHTML = `<p class="snippet">${escape(error.message)}</p>`;
  }
}

function renderPremiumPhotoResults(data) {
  const target = document.querySelector("#premium-photo-results");
  if (!target) return;
  const matches = data.results || [];
  const header = `<p class="snippet"><strong>${data.verified}/${data.candidates}</strong> doğrulandı.</p>`;
  if (!matches.length) {
    target.innerHTML = `${header}<p class="snippet">Doğrulanmış eşleşme yok.</p>`;
    return;
  }
  target.innerHTML = `
    ${header}
    <div class="photo-grid">
      ${matches
        .map(
          (m) => `
          <figure>
            <img src="${escape(m.imageUrl || m.url)}" alt="Doğrulanmış eşleşme" loading="lazy" />
            <figcaption>benzerlik ${Math.round((m.similarity || 0) * 100)}% · ${escape(host(m.pageUrl || m.url))}</figcaption>
          </figure>`
        )
        .join("")}
    </div>
  `;
}

function licenseHeaders() {
  const key = localStorage.getItem(LICENSE_KEY_STORAGE);
  return key ? { "X-License-Key": key } : {};
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

function host(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sensitivityLabel(value) {
  if (value === "adult") return "Hassas";
  if (value === "high-risk") return "Riskli";
  return "Standart";
}

function escape(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sha256(file) {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildVisualFingerprint(file, hashHex) {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 8, 8);
  const pixels = ctx.getImageData(0, 0, 8, 8).data;
  const grays = [];
  const totals = { r: 0, g: 0, b: 0 };
  for (let i = 0; i < pixels.length; i += 4) {
    totals.r += pixels[i];
    totals.g += pixels[i + 1];
    totals.b += pixels[i + 2];
    grays.push(Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114));
  }
  const avg = grays.reduce((s, v) => s + v, 0) / grays.length;
  const bits = grays.map((v) => (v >= avg ? "1" : "0")).join("");
  const count = grays.length;
  return {
    sha256: hashHex,
    averageHash: BigInt(`0b${bits}`).toString(16).padStart(16, "0"),
    colorSignature: [Math.round(totals.r / count), Math.round(totals.g / count), Math.round(totals.b / count)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join(""),
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel decode edilemedi"));
    };
    img.src = url;
  });
}
