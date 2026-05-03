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
      speed: 0.4 + Math.random() * 1.4,
      char: CHARS[Math.floor(Math.random() * CHARS.length)],
      // Belirgin parlak baş + soluk gri kuyruk
      headOpacity: 0.55 + Math.random() * 0.35,
      trailOpacity: 0.12 + Math.random() * 0.16
    };
  }

  function tick() {
    if (!visible) {
      requestAnimationFrame(tick);
      return;
    }

    // Önceki frame'in üzerine yarı saydam siyah çizerek fade-trail oluştur.
    // Daha düşük opaklık → daha uzun, görünür kuyruk.
    ctx.fillStyle = "rgba(8, 9, 11, 0.055)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.font = `${FONT_SIZE}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = "top";

    for (let i = 0; i < cols; i++) {
      const drop = drops[i];
      const x = i * FONT_SIZE;

      // Kuyruk: orta gri (krom tonu)
      if (drop.y - FONT_SIZE > 0) {
        ctx.fillStyle = `rgba(170, 176, 184, ${drop.trailOpacity})`;
        ctx.fillText(drop.char, x, drop.y - FONT_SIZE);
      }

      // Baş: parlak beyaz (krom highlight)
      ctx.fillStyle = `rgba(245, 246, 247, ${drop.headOpacity})`;
      ctx.fillText(drop.char, x, drop.y);

      drop.y += drop.speed;

      // Karakteri ara sıra değiştir — canlılık
      if (Math.random() < 0.045) {
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
