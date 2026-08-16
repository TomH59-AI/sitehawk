/**
 * Shared idempotent roughjs loader for the ExhibitDrawing sketch component.
 * Injects the roughjs script once from CDN and resolves when window.rough exists.
 */
const ROUGH_SOURCES = [
  "https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.js",
  "https://unpkg.com/roughjs@4.6.6/bundled/rough.js",
];

let roughPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.rough) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const s = document.createElement("script");
    const timer = window.setTimeout(() => { s.remove(); reject(new Error(`Timed out loading ${src}`)); }, 2500);
    s.src = src;
    s.onload = () => { window.clearTimeout(timer); resolve(); };
    s.onerror = () => { window.clearTimeout(timer); s.remove(); reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(s);
  });
}

export function ensureRoughLoaded() {
  if (window.rough) return Promise.resolve();
  if (!roughPromise) {
    roughPromise = (async () => {
      let lastErr;
      for (const src of ROUGH_SOURCES) {
        try {
          await loadScript(src);
          if (window.rough) return;
        } catch (e) {
          lastErr = e;
        }
      }
      roughPromise = null;
      throw lastErr || new Error("Failed to load roughjs");
    })();
  }
  return roughPromise;
}