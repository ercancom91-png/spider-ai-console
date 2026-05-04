/* SPIDER AI — Top navigation tab switcher + Kaynaklar sekmesi rendering.
 * Pure vanilla JS, no deps. Tabs hide/show <section data-view="..."> regions.
 */
(function () {
  const navButtons = document.querySelectorAll(".nav-tab[data-tab]");
  const views = document.querySelectorAll("[data-view]");
  const linkButtons = document.querySelectorAll("[data-tab-link]");

  function activate(tab) {
    if (!tab) return;
    navButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
      btn.setAttribute("aria-selected", btn.dataset.tab === tab ? "true" : "false");
    });
    views.forEach((view) => {
      const isActive = view.dataset.view === tab;
      view.classList.toggle("view-active", isActive);
      view.hidden = !isActive;
    });
    if (window.scrollY > 80) window.scrollTo({ top: 0, behavior: "smooth" });
    if (tab === "sources") loadSources();
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  // Footer / brand link triggers
  linkButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault?.();
      activate(btn.getAttribute("data-tab-link"));
    });
  });

  // -----------------------------------------------------------------
  // Kaynaklar sekmesi: /api/config'ten gelen scannedCatalog'u render et.
  // Her platform card; üstte arama kutusu canlı filtre yapıyor.
  // -----------------------------------------------------------------
  let cachedCatalog = null;
  let cachedSources = null;

  async function loadSources() {
    if (cachedCatalog && cachedSources) {
      // already rendered, just refresh filter
      renderSources(cachedCatalog, cachedSources);
      return;
    }
    try {
      const response = await fetch("/api/config");
      const cfg = await response.json();
      cachedCatalog = cfg.scannedCatalog || [];
      cachedSources = cfg.searchSources || [];
      renderSources(cachedCatalog, cachedSources);
    } catch (error) {
      const grid = document.querySelector("#sources-grid");
      if (grid) grid.innerHTML = `<p class="sources-error">Kaynak listesi yüklenemedi: ${escape(error.message)}</p>`;
    }
  }

  const CATEGORY_LABELS = {
    social: "Sosyal medya",
    developer: "Geliştirici",
    professional: "Profesyonel",
    creator: "Creator / medya",
    design: "Tasarım & görsel",
    gaming: "Oyun",
    identity: "Kimlik / avatar",
    commerce: "Alışveriş",
    forum: "Forum"
  };
  const CATEGORY_ORDER = ["social", "developer", "professional", "creator", "design", "gaming", "identity", "commerce", "forum"];

  function renderSources(catalog, sources) {
    const grid = document.querySelector("#sources-grid");
    const countEl = document.querySelector("#sources-count");
    const searchEl = document.querySelector("#sources-search");
    if (!grid) return;

    const filterText = (searchEl?.value || "").trim().toLowerCase();
    const filtered = filterText
      ? catalog.filter(
          (p) =>
            (p.name || "").toLowerCase().includes(filterText) ||
            (p.host || "").toLowerCase().includes(filterText) ||
            (p.category || "").toLowerCase().includes(filterText)
        )
      : catalog;

    if (countEl) countEl.textContent = `${filtered.length} platform · ${sources.length} arama motoru`;

    const groups = {};
    for (const p of filtered) {
      const cat = p.category || "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }

    const sortedCats = Object.keys(groups).sort(
      (a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b) || groups[b].length - groups[a].length
    );

    const blocks = sortedCats
      .map((cat) => {
        const items = groups[cat]
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
          .map(
            (p) => `
              <li>
                <span class="src-name">${escape(p.name)}</span>
                <span class="src-host">${escape(p.host || "—")}</span>
              </li>`
          )
          .join("");
        return `
          <section class="src-card">
            <header>
              <span class="src-cat-name">${escape(CATEGORY_LABELS[cat] || cat)}</span>
              <span class="src-cat-count">${groups[cat].length}</span>
            </header>
            <ul class="src-list">${items}</ul>
          </section>`;
      })
      .join("");

    const enginesBlock = sources.length
      ? `
        <section class="src-card src-engines">
          <header>
            <span class="src-cat-name">Web arama motorları</span>
            <span class="src-cat-count">${sources.length}</span>
          </header>
          <ul class="src-list">
            ${sources.map((s) => `<li><span class="src-name">${escape(s.name || s.id)}</span><span class="src-host">${escape(s.host || "")}</span></li>`).join("")}
          </ul>
        </section>`
      : "";

    grid.innerHTML = blocks + enginesBlock || `<p class="sources-empty">Eşleşme bulunamadı.</p>`;
  }

  document.querySelector("#sources-search")?.addEventListener("input", () => {
    if (cachedCatalog && cachedSources) renderSources(cachedCatalog, cachedSources);
  });

  function escape(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
