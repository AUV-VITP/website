const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.documentElement;

$("#year").textContent = new Date().getFullYear();

/* ---------- Marine snow ---------- */
if (!reduced) {
  const snow = $("#snow");
  const n = innerWidth < 720 ? 14 : 26;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const el = document.createElement("i");
    const s = 2 + Math.random() * 3.5;
    el.style.cssText =
      `left:${Math.random() * 100}%;width:${s}px;height:${s}px;opacity:${0.15 + Math.random() * 0.45};` +
      `--x:${(Math.random() - 0.5) * 120}px;animation-duration:${22 + Math.random() * 30}s;` +
      `animation-delay:-${Math.random() * 40}s`;
    frag.appendChild(el);
  }
  snow.appendChild(frag);
}

/* ---------- Scroll: depth, header, gauge, parallax ---------- */
const top = $("#top");
const marker = $("#gauge-marker");
const gaugeVal = $("#gauge-value");
const rail = $(".gauge-rail");
const emblem = $("#hero-emblem");
const MAX_DEPTH = 50; // metres, matches the isonavi depth rating
let ticking = false;
let railH = rail.clientHeight;

function onScroll() {
  ticking = false;
  const max = Math.max(root.scrollHeight - innerHeight, 1);
  const p = Math.min(Math.max(scrollY / max, 0), 1);
  root.style.setProperty("--depth", p.toFixed(4));
  top.classList.toggle("is-stuck", scrollY > 24);
  marker.style.setProperty("--p", (p * railH).toFixed(1));
  gaugeVal.textContent = `${Math.round(p * MAX_DEPTH)} m`;
  if (emblem && scrollY < innerHeight) root.style.setProperty("--py", `${(scrollY * 0.18).toFixed(1)}px`);
}
addEventListener(
  "scroll",
  () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  },
  { passive: true }
);
addEventListener("resize", () => {
  railH = rail.clientHeight;
  onScroll();
});
onScroll();

/* ---------- Active nav link ---------- */
const links = $$(".nav a");
const sections = links.map((a) => $(a.getAttribute("href")));
const navIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${e.target.id}`));
    }
  },
  { rootMargin: "-45% 0px -50% 0px" }
);
sections.forEach((s) => s && navIO.observe(s));

/* ---------- Reveal, count-up, TRL bars ---------- */
function countUp(el) {
  const target = parseFloat(el.dataset.count);
  const dec = parseInt(el.dataset.dec || "0", 10);
  if (reduced) {
    el.textContent = target.toFixed(dec);
    return;
  }
  const t0 = performance.now();
  const dur = 1400;
  (function step(now) {
    const k = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = (target * e).toFixed(dec);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}

// Light up the TRL segments
$$(".trl li").forEach((li) => {
  const n = +li.dataset.trl;
  $$("i", li).forEach((seg, k) => {
    seg.style.setProperty("--k", k);
    if (k < n) seg.classList.add("on");
  });
});

const revealIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      el.classList.add("in");
      $$("[data-count]", el).forEach(countUp);
      revealIO.unobserve(el);
    }
  },
  { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
);
$$(".reveal").forEach((el) => revealIO.observe(el));

/* ---------- Card spotlight ---------- */
$$(".card").forEach((card) => {
  card.addEventListener(
    "pointermove",
    (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true }
  );
});

/* ---------- Copy email ---------- */
const copyBtn = $("#copy");
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(copyBtn.dataset.email);
    copyBtn.classList.add("is-done");
    copyBtn.firstElementChild.textContent = "Copied";
    setTimeout(() => {
      copyBtn.classList.remove("is-done");
      copyBtn.firstElementChild.textContent = "Copy";
    }, 1800);
  } catch {
    location.href = `mailto:${copyBtn.dataset.email}`;
  }
});

/* ---------- 3D viewer (three.js is loaded only when near the viewport) ---------- */
const stage = $("#stage");
const canvas = $("#viewer");
const loaderText = $("#loader-text");
const loaderFill = $("#loader-fill");
const hint = $("#stage-hint");
const mb = (b) => (b / 1048576).toFixed(1);

function fail() {
  stage.classList.add("is-failed");
  hint.textContent = "3D view unavailable";
  $$(".chips, .tools", stage).forEach((el) => (el.hidden = true));
}

let started = false;
async function startViewer() {
  if (started) return;
  started = true;
  if (!canvas.getContext) return fail();
  try {
    const { initViewer } = await import("./viewer.js");
    const api = await initViewer(canvas, {
      onProgress({ loaded, total }) {
        if (total) {
          const pct = Math.round((loaded / total) * 100);
          loaderFill.style.width = `${pct}%`;
          loaderText.textContent = `Loading model ${pct}% (${mb(loaded)} of ${mb(total)} MB)`;
        } else {
          loaderFill.classList.add("is-indeterminate");
          loaderText.textContent = `Loading model (${mb(loaded)} MB)`;
        }
      },
      onReady() {
        loaderFill.classList.remove("is-indeterminate");
        loaderFill.style.width = "100%";
        stage.classList.add("is-ready");
        hint.textContent = "Drag to rotate. Click, then scroll to zoom";
      },
      onError: fail,
    });
    if (!api) return;
    wireControls(api);
  } catch (err) {
    console.error(err);
    fail();
  }
}

function wireControls(api) {
  $$(".chip").forEach((chip) => {
    const part = chip.dataset.part;
    chip.addEventListener("click", () => {
      const on = chip.getAttribute("aria-pressed") !== "true";
      chip.setAttribute("aria-pressed", String(on));
      api.setPartVisible(part, on);
    });
    chip.addEventListener("pointerenter", () => api.focusPart(part));
    chip.addEventListener("pointerleave", () => api.focusPart(null));
    chip.addEventListener("focus", () => api.focusPart(part));
    chip.addEventListener("blur", () => api.focusPart(null));
  });
  const rot = $("#btn-rotate");
  rot.setAttribute("aria-pressed", String(!reduced));
  rot.addEventListener("click", () => {
    const on = rot.getAttribute("aria-pressed") !== "true";
    rot.setAttribute("aria-pressed", String(on));
    api.setAutoRotate(on);
  });
  $("#btn-reset").addEventListener("click", () => api.resetView());
}

if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        startViewer();
      }
    },
    { rootMargin: "700px 0px" }
  );
  io.observe(stage);
} else {
  startViewer();
}
