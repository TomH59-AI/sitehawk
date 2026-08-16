/**
 * Shared idempotent diff-match-patch loader for the HawkLaw redline diff.
 * Injects the DMP script once from CDN and resolves when window.diff_match_patch exists.
 */
const DMP_SOURCES = [
  "https://cdn.jsdelivr.net/npm/diff-match-patch@1.0.5/index.min.js",
  "https://unpkg.com/diff-match-patch@1.0.5/index.min.js",
];

let dmpPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.diff_match_patch) return resolve();
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

export function ensureDmpLoaded() {
  if (window.diff_match_patch) return Promise.resolve();
  if (!dmpPromise) {
    dmpPromise = (async () => {
      let lastErr;
      for (const src of DMP_SOURCES) {
        try {
          await loadScript(src);
          if (window.diff_match_patch) return;
        } catch (e) {
          lastErr = e;
        }
      }
      dmpPromise = null;
      throw lastErr || new Error("Failed to load diff-match-patch");
    })();
  }
  return dmpPromise;
}