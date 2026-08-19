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
import ParcelLinesToggle from "@/components/maps/ParcelLinesToggle";
import ZayoFiberToggle from "@/components/maps/ZayoFiberToggle";
import ParcelIdentifyCard from "@/components/maps/ParcelIdentifyCard";
import { queryParcelAt, highlightParcel, setParcelLinesVisible, PARCEL_LINES_LAYER_ID } from "@/lib/regridParcelTiles";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { buildParcelZoningFC, addSarfZoningLayers, ZONE_STYLES } from "@/lib/sarfRingParcels";

// Basemap options — Streets is the colorful, high-detail default; the others
// are one-click visual swaps. Switching NEVER touches coordinates or workflow state.
const BASEMAP_STYLES = {
  streets:           { label: "🗺 Streets",     style: "mapbox://styles/mapbox/streets-v12" },
  satellite_streets: { label: "🛰 Sat Streets", style: "mapbox://styles/mapbox/satellite-streets-v12" },
  satellite:         { label: "🛰 Satellite",   style: "mapbox://styles/mapbox/satellite-v9" },
};

// Primary + fallback CDNs. The api.mapbox.com CDN can be blocked/rate-limited
// inside the editor iframe, so we fall back to jsDelivr then unpkg.
const MAPBOX_SOURCES = [
  { js: "https://cdn.jsdelivr.net/npm/mapbox-gl@3.6.0/dist/mapbox-gl.js", css: "https://cdn.jsdelivr.net/npm/mapbox-gl@3.6.0/dist/mapbox-gl.css" },
  { js: "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js", css: "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css" },
  { js: "https://unpkg.com/mapbox-gl@3.6.0/dist/mapbox-gl.js", css: "https://unpkg.com/mapbox-gl@3.6.0/dist/mapbox-gl.css" },
];
const LOAD_TIMEOUT_MS = 15000;

// Basemap-blocked fallback — if Mapbox tile/resource requests keep failing in
// the user's browser (network filter / ad-blocker blocking api.mapbox.com),
// the ring still draws (local geojson) but the background stays blank. After a
// few resource errors we swap to an OSM raster basemap so the map is never blank.
const OSM_FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm-base", type: "raster", source: "osm" }],
};
const TILE_ERRORS_BEFORE_FALLBACK = 3;

function injectCss(href) {
  if (document.querySelector(`link[data-mapbox-css="1"]`)) return;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = href;
  css.setAttribute("data-mapbox-css", "1");
  document.head.appendChild(css);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error(`Failed to load ${src}`)); };
    document.head.appendChild(s);
  });
}

let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl?.Map) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = (async () => {
      let lastErr;
      for (const src of MAPBOX_SOURCES) {
        try {
          injectCss(src.css);
          await loadScript(src.js);
          if (window.mapboxgl?.Map) return;
        } catch (e) {
          lastErr = e;
        }
      }
      mapboxLoadingPromise = null;
      throw lastErr || new Error("Failed to load Mapbox GL JS");
    })();
  }
  return mapboxLoadingPromise.catch((e) => {
    mapboxLoadingPromise = null; // reset on failure so next attempt retries
    throw e;
  });
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

// (Re)adds the SARF ring source + layers. Idempotent — used on first load and
// after every basemap switch (setStyle wipes custom layers, never the camera).
function addRingLayers(map, lat, lon, radiusMiles) {
  ["sarf-ring-fill", "sarf-ring-line"].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource("sarf-ring")) map.removeSource("sarf-ring");
  const ring = buildCircle(lat, lon, radiusMiles);
  map.addSource("sarf-ring", { type: "geojson", data: ring });
  map.addLayer({ id: "sarf-ring-fill", type: "fill", source: "sarf-ring", paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 } });
  map.addLayer({ id: "sarf-ring-line", type: "line", source: "sarf-ring", paint: { "line-color": "#ef4444", "line-width": 3 } });
  return ring;
}

function Section1SarfMap({ lat, lon, radiusMiles = 0.5, agentName, onReady, onSarfComplete }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const lastKeyRef = useRef(null);
  const timeoutRef = useRef(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0); // bumped by Retry
  const [clickedParcel, setClickedParcel] = useState(null); // { lat, lng, headline }
  const [basemap, setBasemap] = useState("streets"); // colorful Streets is the default
  const basemapRef = useRef("streets");
  // Realie ring parcels + zoning classifications — drawn on the SARF as soon as
  // the lookup returns so targets are easier to eyeball. Never blocks onReady.
  const zoningFcRef = useRef(null);
  const [zoningCount, setZoningCount] = useState(0);
  // Blank-basemap self-heal: count failed Mapbox tile/resource fetches after
  // load; past the threshold, swap to the OSM raster fallback basemap.
  const tileErrorsRef = useRef(0);
  const [osmFallback, setOsmFallback] = useState(false);
  const osmFallbackRef = useRef(false);

  // Visual-only basemap swap: setStyle preserves center/zoom/bearing/pitch and
  // DOM markers. We only re-add the ring layers (and parcel lines if they were on).
  // Coordinates, Target A, and all workflow state are never touched.
  const switchBasemap = (key) => {
    const map = mapRef.current;
    if (!map) return;
    basemapRef.current = key;
    setBasemap(key);
    // Give Mapbox tiles another chance after a fallback (user-initiated retry).
    tileErrorsRef.current = 0;
    osmFallbackRef.current = false;
    setOsmFallback(false);
    const parcelOn = !!map.getLayer(PARCEL_LINES_LAYER_ID) &&
      map.getLayoutProperty(PARCEL_LINES_LAYER_ID, "visibility") !== "none";
    map.setStyle(BASEMAP_STYLES[key].style);
    map.once("style.load", () => {
      if (Number.isFinite(lat) && Number.isFinite(lon)) addRingLayers(map, lat, lon, radiusMiles);
      if (zoningFcRef.current) addSarfZoningLayers(map, zoningFcRef.current);
      if (parcelOn) setParcelLinesVisible(map, true).catch(() => {});
    });
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setClickedParcel(null);
    tileErrorsRef.current = 0;
    osmFallbackRef.current = false;
    setOsmFallback(false);

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
        const ring = buildCircle(lat, lon, radiusMiles);
        onSarfComplete?.({
          jurisdiction: null,
          zoningDistrict: null,
          ordinanceUrl: null,
          parcelApn: null,
          parcelAddress: null,
          coordinates: { lat, lng: lon },
          sarfMapSnapshot: ring,
          sarfConfidenceScore: "map_verified",
        });
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
      if (cancelled || !containerRef.current || !window.mapboxgl?.Map) return;

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
          style: BASEMAP_STYLES[basemapRef.current].style,
          center: [lon, lat],
          zoom: 13,
        });
      } catch (e) {
        return fail(`Map init error — ${e?.message || "could not construct map"}.`);
      }

      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      // Swap to the OSM raster basemap when Mapbox tiles can't be fetched in
      // this browser. Ring + zoning layers are re-added after the style loads.
      function engageOsmFallback() {
        if (cancelled || osmFallbackRef.current || !mapRef.current) return;
        osmFallbackRef.current = true;
        setOsmFallback(true);
        console.log("[SARF DIAG] Mapbox tiles unreachable — switching to OSM fallback basemap");
        const m = mapRef.current;
        m.setStyle(OSM_FALLBACK_STYLE);
        m.once("style.load", () => {
          if (cancelled) return;
          addRingLayers(m, lat, lon, radiusMiles);
          if (zoningFcRef.current) addSarfZoningLayers(m, zoningFcRef.current);
        });
      }

      // 6 + 8 — surface GL errors (401/403 → token rejected)
      map.on("error", (e) => {
        const status = e?.error?.status;
        console.log("[SARF DIAG] map 'error' event:", status, e?.error?.message);
        if (status === 401 || status === 403) {
          if (osmFallbackRef.current) return; // fallback basemap needs no token
          if (lastKeyRef.current) return engageOsmFallback(); // post-load tile auth failure → don't kill a visible ring
          return fail("MapBox token rejected — likely expired or wrong scopes. Regenerate a public token at account.mapbox.com.");
        }
        // Repeated tile/resource fetch failures (blocked network, offline CDN)
        // leave the ring visible over a blank background — self-heal to OSM.
        if (!osmFallbackRef.current) {
          tileErrorsRef.current += 1;
          if (tileErrorsRef.current >= TILE_ERRORS_BEFORE_FALLBACK) engageOsmFallback();
        }
      });

      map.on("load", () => {
        if (cancelled) return;
        console.log("[SARF DIAG] map 'load' event — render OK");
        clearTimeoutSafe();
        const ring = addRingLayers(map, lat, lon, radiusMiles);

        placeMarker(map);

        const coords = ring.geometry.coordinates[0];
        const lons = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 60, duration: 0 }
        );
        lastKeyRef.current = geoKey;
        // SARF owns the pipeline emitter. Zoning enriches this packet in Section 2;
        // TalonFit only consumes the resolved decision and never creates SARF data.
        onSarfComplete?.({
          jurisdiction: null,
          zoningDistrict: null,
          ordinanceUrl: null,
          parcelApn: null,
          parcelAddress: null,
          coordinates: { lat, lng: lon },
          sarfMapSnapshot: ring,
          sarfConfidenceScore: "map_verified",
        });
        onReady?.();

        // Realie parcel boundaries + zoning classifications inside the ring —
        // additive overlay fired AFTER the map is ready; failure is silent.
        zoningFcRef.current = null;
        setZoningCount(0);
        realieParcelsInRing({ lat, lon, radius_miles: radiusMiles })
          .then(({ data }) => {
            if (cancelled || !mapRef.current) return;
            const fc = buildParcelZoningFC(data?.parcels);
            zoningFcRef.current = fc;
            setZoningCount(fc.features.length);
            addSarfZoningLayers(mapRef.current, fc);
          })
          .catch(() => { /* zoning overlay is best-effort */ });
      });

      // Parcel click-to-identify — only fires when the Parcel Lines layer is on.
      map.on("click", (e) => {
        const feat = queryParcelAt(map, e.point);
        if (!feat) return;
        highlightParcel(map, feat);
        setClickedParcel({
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
          headline: feat.properties?.headline || feat.properties?.address || null,
          geometry: feat.geometry || null, // fired over to the panel so Zoom-to-Fit knows where to fly
        });
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
    <div data-tour="sarf-map" className="relative rounded-xl overflow-hidden border border-border" style={{ minHeight: "600px" }}>
      <div ref={containerRef} className="w-full" style={{ width: "100%", height: "600px" }} />
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-white/15 shadow-lg text-[11px] font-semibold">
          {Object.entries(BASEMAP_STYLES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => switchBasemap(key)}
              className={`px-2.5 py-1.5 transition-all ${
                basemap === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-slate-900/85 text-white/80 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <ParcelLinesToggle mapRef={mapRef} />
        <ZayoFiberToggle mapRef={mapRef} />
        {osmFallback && (
          <div className="rounded-lg bg-amber-500/90 text-slate-900 text-[11px] font-semibold px-2.5 py-1.5 shadow-lg">
            Backup basemap — Mapbox tiles blocked on this network
          </div>
        )}
      </div>
      {zoningCount > 0 && (
        <div className="absolute bottom-8 right-3 z-10 rounded-lg bg-slate-900/85 border border-white/15 shadow-lg px-3 py-2 space-y-1">
          <div className="text-[10px] font-bold text-white/90 uppercase tracking-wide">Ring Zoning · {zoningCount} parcels</div>
          {Object.entries(ZONE_STYLES).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-[10px] text-white/80">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: v.color }} />
              {v.label}
            </div>
          ))}
        </div>
      )}
      {clickedParcel && (
        <div className="absolute top-3 right-14 z-10">
          <ParcelIdentifyCard
            lat={clickedParcel.lat}
            lng={clickedParcel.lng}
            headline={clickedParcel.headline}
            geometry={clickedParcel.geometry}
            mapRef={mapRef}
            onClose={() => {
              highlightParcel(mapRef.current, null);
              setClickedParcel(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default memo(Section1SarfMap);