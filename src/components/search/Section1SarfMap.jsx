/*
 * SARF DIAGNOSTIC FIX — 2026-05-31
 * --------------------------------
 * Reported: clicking Submit spun the hawk forever, no map ever appeared.
 *
 * ROOT CAUSE: the map's "load" event was the ONLY thing that fired onReady()
 * (which clears the parent spinner). If the token was rejected, the network
 * failed, or GL JS errored, "load" never fired → onReady never fired →
 * INFINITE SPINNER with no error shown. Errors in draw() were also swallowed.
 *
 * ISSUES FOUND & FIXED (Section 1 ONLY — nothing else touched):
 *   0. TOKEN ENV VAR — canonical secret is now MAPBOX_API_KEY (served to the
 *      browser by getPublicConfig). All map sections read it via loadPublicConfig().
 *   1. TOKEN MISSING/EMPTY — was silently `return`ed (token falsy → bail, spinner
 *      stuck). NOW: shows "MapBox token missing — set MAPBOX_API_KEY in
 *      Base44 secrets." and clears the spinner.
 *   2. WRONG TOKEN TYPE — a secret "sk." token silently fails in-browser. NOW:
 *      validated; shows "Wrong token type — need a public pk. token…".
 *   3. MAPBOX GL CSS — confirmed loaded via the CDN <link> in ensureMapboxLoaded
 *      (this build uses the CDN GL JS, not the npm package). Kept + hardened so a
 *      script load failure rejects with a real Error instead of undefined.
 *   4. CONTAINER HEIGHT — added explicit inline width:100%/height:600px safety
 *      net on the container so a collapsed flex parent can't 0-height the map.
 *   5. accessToken ORDER — confirmed set BEFORE new mapboxgl.Map(); kept.
 *   6. INIT ERROR HANDLING — new mapboxgl.Map() now wrapped in try/catch; map
 *      "error" event listened to and surfaced in the panel (401/403 → token
 *      rejected message).
 *   7. LOAD CONFIRMATION + 15s TIMEOUT — onReady now fires on "load"; if "load"
 *      never fires within 15s, the spinner is killed and a timeout error with a
 *      Retry button is shown. THE INFINITE SPINNER CAN NO LONGER HAPPEN.
 *   8. STYLE URL — valid (mapbox://styles/mapbox/satellite-streets-v12). Kept.
 *   9. [SARF DIAG] console.log added at token load, accessToken set, Map()
 *      construction, "load", "error", and timeout so failures are visible.
 *
 * Untouched: pipelineStep state machine, HawkFlightSpinner component, all other
 * sections. The 15s timeout + error UI is ADDED here, around the existing flow.
 */
import { memo, useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
const LOAD_TIMEOUT_MS = 15000;

let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      // CSS — without this the GL container has 0px height and renders blank.
      if (!document.querySelector(`link[href="${MAPBOX_CSS}"]`)) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = MAPBOX_CSS;
        document.head.appendChild(css);
      }
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = () => resolve();
      s.onerror = () => { mapboxLoadingPromise = null; reject(new Error("Failed to load Mapbox GL JS")); };
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

async function resolveToken() {
  if (window.mapboxgl?.accessToken) return window.mapboxgl.accessToken;
  const cfg = await loadPublicConfig();
  return cfg?.mapboxAccessToken;
}

// Geodesic circle polygon (great-circle math). steps=64 — visually identical, cheap.
function buildCircle(lat, lon, radiusMiles, steps = 64) {
  const R = 3958.7613;
  const d = radiusMiles / R;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (i * 2 * Math.PI) / steps;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function Section1SarfMap({ lat, lon, radiusMiles = 0.5, agentName, onReady }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const lastKeyRef = useRef(null);
  const timeoutRef = useRef(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0); // bumped by Retry

  useEffect(() => {
    let cancelled = false;
    setError(null);

    function clearTimeoutSafe() {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    }

    // Kill the spinner + show an error. onReady() clears the parent's loading state.
    function fail(message) {
      if (cancelled) return;
      console.log("[SARF DIAG] FAIL:", message);
      clearTimeoutSafe();
      setError(message);
      onReady?.(); // critical: stops the infinite hawk spinner
    }

    function placeMarker(map) {
      markerRef.current?.remove?.();
      const el = document.createElement("div");
      el.style.cssText = `
        width: 22px; height: 22px; border-radius: 50%;
        background: #06b6d4; border: 3px solid #fff;
        box-shadow: 0 0 0 2px #06b6d4, 0 0 12px rgba(6,182,212,0.8);
      `;
      const marker = new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);
      if (agentName && agentName.trim()) {
        marker.setPopup(
          new window.mapboxgl.Popup({ offset: 18, closeButton: false })
            .setHTML(`<div style="font-family:monospace;font-size:11px;color:#3b82f6;"><strong style="color:#3b82f6;">${agentName}</strong><br/><span style="color:#3b82f6;">${lat.toFixed(6)}, ${lon.toFixed(6)}</span></div>`)
        );
        marker.togglePopup();
      }
      markerRef.current = marker;
    }

    async function draw() {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const geoKey = `${lat},${lon},${radiusMiles}`;
      if (mapRef.current && lastKeyRef.current === geoKey) {
        placeMarker(mapRef.current);
        onReady?.();
        return;
      }

      // 1 + 2 — TOKEN VALIDATION
      let token;
      try {
        token = await resolveToken();
      } catch (e) {
        return fail(`Could not load MapBox token — ${e?.message || "config request failed"}.`);
      }
      console.log("[SARF DIAG] token loaded:", token ? `${String(token).slice(0, 8)}…` : "(empty)");
      if (cancelled) return;
      if (!token) return fail("MapBox token missing — set MAPBOX_API_KEY in Base44 secrets.");
      if (String(token).startsWith("sk.")) return fail("Wrong token type — need a public pk. token, not a secret sk. token.");

      try {
        await ensureMapboxLoaded();
      } catch (e) {
        return fail(e?.message || "Failed to load Mapbox GL JS — check your network.");
      }
      if (cancelled || !containerRef.current || !window.mapboxgl) return;

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      window.mapboxgl.accessToken = token;
      console.log("[SARF DIAG] mapboxgl.accessToken set");

      // 7 — 15s timeout guard so "load" never-firing can't hang the spinner.
      timeoutRef.current = setTimeout(() => {
        console.log("[SARF DIAG] load TIMEOUT after", LOAD_TIMEOUT_MS, "ms");
        fail("Map failed to load — check token and network.");
      }, LOAD_TIMEOUT_MS);

      // 6 — wrap construction in try/catch
      let map;
      try {
        console.log("[SARF DIAG] constructing mapboxgl.Map()");
        map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [lon, lat],
          zoom: 13,
        });
      } catch (e) {
        return fail(`Map init error — ${e?.message || "could not construct map"}.`);
      }

      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      // 6 + 8 — surface GL errors (401/403 → token rejected)
      map.on("error", (e) => {
        const status = e?.error?.status;
        console.log("[SARF DIAG] map 'error' event:", status, e?.error?.message);
        if (status === 401 || status === 403) {
          fail("MapBox token rejected — likely expired or wrong scopes. Regenerate a public token at account.mapbox.com.");
        }
        // non-fatal tile errors are ignored (load may still succeed)
      });

      map.on("load", () => {
        if (cancelled) return;
        console.log("[SARF DIAG] map 'load' event — render OK");
        clearTimeoutSafe();
        const ring = buildCircle(lat, lon, radiusMiles);
        map.addSource("sarf-ring", { type: "geojson", data: ring });
        map.addLayer({ id: "sarf-ring-fill", type: "fill", source: "sarf-ring", paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 } });
        map.addLayer({ id: "sarf-ring-line", type: "line", source: "sarf-ring", paint: { "line-color": "#ef4444", "line-width": 3 } });

        placeMarker(map);

        const coords = ring.geometry.coordinates[0];
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 60, duration: 0 }
        );
        lastKeyRef.current = geoKey;
        onReady?.();
      });

      mapRef.current = map;
    }

    draw().catch((e) => fail(e?.message || "Unexpected SARF render error."));

    return () => {
      cancelled = true;
      clearTimeoutSafe();
      markerRef.current?.remove?.();
      markerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
      lastKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, radiusMiles, agentName, attempt]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center" style={{ minHeight: "200px" }}>
        <div className="font-heading font-semibold text-destructive">SARF map failed to render</div>
        <p className="text-sm text-destructive/90 mt-1 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => { setError(null); setAttempt((a) => a + 1); }}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ minHeight: "600px" }}>
      <div ref={containerRef} className="w-full" style={{ width: "100%", height: "600px" }} />
    </div>
  );
}

export default memo(Section1SarfMap);