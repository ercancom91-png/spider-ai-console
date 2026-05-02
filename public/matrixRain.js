// Matrix-style dikey harf yağmuru. Pure canvas, vanilla JS, no deps.
// Renkler: gri/siyah/beyaz palet. Düşük opasite — içerik üstte kalır.
//
// Davranış:
//   - prefers-reduced-motion: animasyon kapalı.
//   - sayfa görünür değilse (visibility hidden) frame ilerletme durur.
//   - DPR'a göre keskin render.

(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.id = "matrix-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  const FONT_SIZE = 14;
  const CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+=-_:;<>/?\\|░▒▓◆◇○●";

  let cols = 0;
  let drops = [];
  let dpr = 1;
  let visible = !document.hidden;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.floor(window.innerWidth / FONT_SIZE);
    drops = Array.from({ length: cols }, () => makeDrop());
  }

  function makeDrop() {
    return {
      y: -Math.random() * 200,
      speed: 0.35 + Math.random() * 1.15,
      char: CHARS[Math.floor(Math.random() * CHARS.length)],
      // Beyaz baş + gri kuyruk simülasyonu için baş opacity'si yüksek tutuluyor
      headOpacity: 0.12 + Math.random() * 0.18,
      trailOpacity: 0.04 + Math.random() * 0.06
    };
  }

  function tick() {
    if (!visible) {
      requestAnimationFrame(tick);
      return;
    }

    // Önceki frame'in üzerine yarı saydam siyah çizerek fade-trail oluştur
    ctx.fillStyle = "rgba(8, 8, 9, 0.085)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.font = `${FONT_SIZE}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = "top";

    for (let i = 0; i < cols; i++) {
      const drop = drops[i];
      const x = i * FONT_SIZE;

      // Kuyruk: çoğunlukla saydam orta gri
      if (drop.y - FONT_SIZE > 0) {
        ctx.fillStyle = `rgba(180, 180, 190, ${drop.trailOpacity})`;
        ctx.fillText(drop.char, x, drop.y - FONT_SIZE);
      }

      // Baş: parlak, neredeyse beyaz
      ctx.fillStyle = `rgba(235, 235, 240, ${drop.headOpacity})`;
      ctx.fillText(drop.char, x, drop.y);

      drop.y += drop.speed;

      // Karakteri ara sıra değiştir — canlılık
      if (Math.random() < 0.04) {
        drop.char = CHARS[Math.floor(Math.random() * CHARS.length)];
      }

      // Ekran dışına çıktıysa yeniden başlat
      if (drop.y > window.innerHeight + FONT_SIZE) {
        drops[i] = makeDrop();
      }
    }

    requestAnimationFrame(tick);
  }

  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
  });

  window.addEventListener("resize", resize, { passive: true });
  resize();
  requestAnimationFrame(tick);
})();
