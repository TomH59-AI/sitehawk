/**
 * Shared idempotent Mapbox GL JS loader for live interactive map components.
 * Injects the GL JS script + CSS once and resolves when window.mapboxgl exists.
 * Static-image components do NOT need this — they just build a URL for <img>.
 */
let mapboxLoadingPromise = null;

export function ensureMapboxLoaded() {
  if (window.mapboxgl) return Promise.resolve();
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return mapboxLoadingPromise;
}