/**
 * Shared idempotent Mapbox GL JS loader for live interactive map components.
 * Injects the GL JS script + CSS once and resolves when window.mapboxgl exists.
 * Static-image components do NOT need this — they just build a URL for <img>.
 */
// Primary + fallback CDNs — api.mapbox.com can be blocked inside the editor
// iframe, so we fall back to jsDelivr then unpkg.
const MAPBOX_SOURCES = [
  { js: "https://cdn.jsdelivr.net/npm/mapbox-gl@3.6.0/dist/mapbox-gl.js", css: "https://cdn.jsdelivr.net/npm/mapbox-gl@3.6.0/dist/mapbox-gl.css" },
  { js: "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js", css: "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css" },
  { js: "https://unpkg.com/mapbox-gl@3.6.0/dist/mapbox-gl.js", css: "https://unpkg.com/mapbox-gl@3.6.0/dist/mapbox-gl.css" },
];

let mapboxLoadingPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    document.querySelectorAll(`script[src="${src}"]`).forEach((node) => node.remove());
    const s = document.createElement("script");
    const timer = window.setTimeout(() => {
      s.remove();
      reject(new Error(`Timed out loading ${src}`));
    }, 2500);
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => {
      window.clearTimeout(timer);
      window.mapboxgl ? resolve() : reject(new Error(`Mapbox did not initialize from ${src}`));
    };
    s.onerror = () => {
      window.clearTimeout(timer);
      s.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

export function ensureMapboxLoaded() {
  if (window.mapboxgl) return Promise.resolve();
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = (async () => {
      if (!document.querySelector(`link[data-mapbox-css="1"]`)) {
        MAPBOX_SOURCES.forEach((source) => {
          const css = document.createElement("link");
          css.rel = "stylesheet";
          css.href = source.css;
          css.setAttribute("data-mapbox-css", "1");
          document.head.appendChild(css);
        });
      }
      let lastErr;
      for (const src of MAPBOX_SOURCES) {
        try {
          await loadScript(src.js);
          if (window.mapboxgl) return;
        } catch (e) {
          lastErr = e;
        }
      }
      mapboxLoadingPromise = null;
      throw lastErr || new Error("Failed to load Mapbox GL JS");
    })();
  }
  return mapboxLoadingPromise;
}