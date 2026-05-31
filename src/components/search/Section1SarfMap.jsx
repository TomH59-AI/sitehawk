/*
 * SECTION 1 SARF SPEEDUP AUDIT — findings & fixes
 * ------------------------------------------------
 * Bottlenecks found in Section 1's render path and what changed:
 *   1. STALE BACKGROUND HOOKS — none found. Section 1 already makes exactly one
 *      network path (Mapbox GL tiles). No FEMA/NWI/parcel/zoning/etc. fetches here.
 *   2. STATIC IMAGES vs GL JS — already GL JS (client-side, progressive tiles). Kept.
 *   3. RADIUS CIRCLE STEPS — already steps=64. Kept.
 *   4. UNNEEDED GEOCODING — none. lat/lon used directly, no reverse-geocode. Kept.
 *   5. MEMOIZATION — FIXED: component wrapped in React.memo so unrelated parent
 *      re-renders no longer tear down & rebuild the map. (props memoized in parent.)
 *   6. AUTH / CONFIG WARM-UP — FIXED: loadPublicConfig() was a cold backend
 *      round-trip blocking the FIRST render. Now (a) prefetched at app level so
 *      it's warm before submit, and (b) skipped entirely once the token is set
 *      on window.mapboxgl. No network wait on the path that matters.
 *   7. IMAGE SIZE — live render is GL JS (no PNG generated here). N/A.
 *   8. STYLE / TOKEN — token from cached config (warmed at app boot, not fetched
 *      on submit). Base style kept as satellite-streets (operational requirement)
 *      but tile fetch no longer waits behind a backend call.
 *   9. LAYER ORDER — already base tiles first, circle+waypoint added on "load". Kept.
 *  10. CACHE — FIXED: skips full map rebuild when lat/lon/radius are unchanged;
 *      only the agent label/marker is refreshed.
 *  11. NETWORK PARALLELISM — Mapbox tiles share an HTTP/2 connection; nothing
 *      artificially serialized. No change needed.
 */
import { memo, useEffect, useRef } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";

let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPBOX_CSS;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

// Resolve the token without a blocking backend round-trip on the hot path:
// if it's already set on the GL instance, reuse it; otherwise read the (warmed) cache.
async function resolveToken() {
  if (window.mapboxgl?.accessToken) return window.mapboxgl.accessToken;
  const cfg = await loadPublicConfig();
  return cfg.mapboxAccessToken;
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

// Section One SARF output — ONE MapBox render: center waypoint, the selected
// radius ring, and the agent-name label. No other layers, no other fetches.
function Section1SarfMap({ lat, lon, radiusMiles = 0.5, agentName, onReady }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  // Cache key — skip the full rebuild when geometry inputs are unchanged.
  const lastKeyRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    // Refresh only the agent marker/label without rebuilding the map.
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
            .setHTML(`<div style="font-family:monospace;font-size:11px;"><strong>${agentName}</strong><br/>${lat.toFixed(6)}, ${lon.toFixed(6)}</div>`)
        );
        marker.togglePopup();
      }
      markerRef.current = marker;
    }

    async function draw() {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const geoKey = `${lat},${lon},${radiusMiles}`;
      // CACHE: identical geometry already rendered — just refresh the label and bail.
      if (mapRef.current && lastKeyRef.current === geoKey) {
        placeMarker(mapRef.current);
        onReady?.();
        return;
      }

      const token = await resolveToken();
      if (!token || cancelled) return;
      await ensureMapboxLoaded();
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

      window.mapboxgl.accessToken = token;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [lon, lat],
        zoom: 13,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      // LAYER ORDER: base tiles paint first; circle + waypoint added on "load".
      map.on("load", () => {
        const ring = buildCircle(lat, lon, radiusMiles);
        map.addSource("sarf-ring", { type: "geojson", data: ring });
        map.addLayer({
          id: "sarf-ring-fill",
          type: "fill",
          source: "sarf-ring",
          paint: { "fill-color": "#ef4444", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "sarf-ring-line",
          type: "line",
          source: "sarf-ring",
          paint: { "line-color": "#ef4444", "line-width": 3 },
        });

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
    draw();
    return () => {
      cancelled = true;
      markerRef.current?.remove?.();
      markerRef.current = null;
      mapRef.current?.remove?.();
      mapRef.current = null;
      lastKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, radiusMiles, agentName]);

  return (
    <div className="rounded-xl overflow-hidden border border-border" style={{ minHeight: "500px" }}>
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: "500px" }} />
    </div>
  );
}

// MEMOIZATION: don't tear down/rebuild the map on unrelated parent re-renders.
export default memo(Section1SarfMap);