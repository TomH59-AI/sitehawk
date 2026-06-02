/**
 * RFProximityMaps — renders the Closest Airport and Closest Cell Tower maps for
 * the AI Vision Analyzer, driven by the runRFAnalysis (`run-rf-analysis`) result.
 *
 * Each map centers on the proposed site, drops a site marker + destination
 * marker, and draws the connecting line from `result.airport.line_geojson` /
 * `result.tower.line_geojson`. When no cell tower is found the tower section
 * shows the RF verdict message instead of a map — the airport map is unaffected.
 */

import { useEffect, useRef } from "react";
import { Plane, RadioTower, AlertTriangle } from "lucide-react";
import { ensureMapboxLoaded } from "@/lib/section6Proximity";
import { loadPublicConfig } from "@/lib/publicConfig";

const BRAND = "#2563EB";

function lineBounds(line, fallback) {
  if (line?.coordinates?.length) {
    const b = new window.mapboxgl.LngLatBounds(line.coordinates[0], line.coordinates[0]);
    line.coordinates.forEach((c) => b.extend(c));
    return b;
  }
  return new window.mapboxgl.LngLatBounds(fallback, fallback);
}

function renderProximityMap(container, site, dest, line, glyphColor) {
  const map = new window.mapboxgl.Map({
    container,
    style: "mapbox://styles/mapbox/light-v11",
    center: [site.lon, site.lat],
    zoom: 11,
    preserveDrawingBuffer: true,
  });
  map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
  map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

  return new Promise((resolve) => {
    map.on("load", () => {
      if (line) {
        map.addSource("rf-line", { type: "geojson", data: { type: "Feature", geometry: line, properties: {} } });
        map.addLayer({ id: "rf-line-casing", type: "line", source: "rf-line", layout: { "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.85 } });
        map.addLayer({ id: "rf-line", type: "line", source: "rf-line", layout: { "line-cap": "round" }, paint: { "line-color": BRAND, "line-width": 2.5 } });
      }
      // Site marker
      const siteEl = document.createElement("div");
      siteEl.style.cssText = `width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${BRAND};border-radius:50%;box-shadow:0 0 12px rgba(37,99,235,0.8);font-size:15px;`;
      siteEl.textContent = "📡";
      new window.mapboxgl.Marker({ element: siteEl, anchor: "center" }).setLngLat([site.lon, site.lat]).addTo(map);
      // Destination marker
      if (dest && dest.lat != null && dest.lon != null) {
        const dEl = document.createElement("div");
        dEl.style.cssText = `width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#fff;border:2px solid ${glyphColor};border-radius:50%;box-shadow:0 0 0 2px ${glyphColor}55;font-size:14px;`;
        dEl.textContent = dest.glyph;
        new window.mapboxgl.Marker({ element: dEl, anchor: "center" }).setLngLat([dest.lon, dest.lat]).addTo(map);
      }
      const b = lineBounds(line, [site.lon, site.lat]);
      map.fitBounds(b, { padding: 70, duration: 0, maxZoom: 13 });
      requestAnimationFrame(() => requestAnimationFrame(() => { try { map.resize(); } catch { /* disposed */ } }));
      resolve(map);
    });
  });
}

function MapPanel({ site, dest, line, glyphColor }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadPublicConfig();
      if (cancelled || !ref.current) return;
      window.mapboxgl && (window.mapboxgl.accessToken = cfg.mapboxAccessToken);
      await ensureMapboxLoaded();
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;
      if (cancelled || !ref.current) return;
      mapRef.current = await renderProximityMap(ref.current, site, dest, line, glyphColor);
    })();
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={ref} className="w-full bg-[#0C1B2E]" style={{ height: 420 }} />;
}

export default function RFProximityMaps({ site, result }) {
  if (!result) return null;
  const airport = result.airport;
  const tower = result.tower;
  const hasTower = tower && tower.latitude_deg != null && tower.longitude_deg != null;
  const towerVerdict = result.rf?.verdict || `No cell tower found within 2 miles.`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ── Closest Airport ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-card border-b border-border flex items-center gap-2">
          <Plane className="w-4 h-4 text-primary" />
          <div>
            <div className="text-[10px] font-mono text-primary tracking-[0.3em]">CLOSEST AIRPORT</div>
            <div className="font-heading font-bold text-sm text-foreground">
              {airport?.name || airport?.call_letters || "—"}
              {airport?.distance_miles != null ? ` · ${Number(airport.distance_miles).toFixed(2)} mi` : ""}
            </div>
          </div>
        </div>
        {airport && airport.latitude_deg != null ? (
          <MapPanel
            site={site}
            dest={{ lat: Number(airport.latitude_deg), lon: Number(airport.longitude_deg), glyph: "✈️" }}
            line={airport.line_geojson}
            glyphColor={BRAND}
          />
        ) : (
          <div className="px-4 py-8 text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> No airport found near this site.
          </div>
        )}
      </div>

      {/* ── Closest Cell Tower ── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 bg-card border-b border-border flex items-center gap-2">
          <RadioTower className="w-4 h-4 text-primary" />
          <div>
            <div className="text-[10px] font-mono text-primary tracking-[0.3em]">CLOSEST CELL TOWER</div>
            <div className="font-heading font-bold text-sm text-foreground">
              {hasTower
                ? `${tower.licensee || tower.call_letters || "Tower"}${tower.distance_miles != null ? ` · ${Number(tower.distance_miles).toFixed(2)} mi` : ""}`
                : "No tower found"}
            </div>
          </div>
        </div>
        {hasTower ? (
          <MapPanel
            site={site}
            dest={{ lat: Number(tower.latitude_deg), lon: Number(tower.longitude_deg), glyph: "🗼" }}
            line={tower.line_geojson}
            glyphColor={BRAND}
          />
        ) : (
          <div className="px-4 py-8 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="font-medium">{towerVerdict}</span>
          </div>
        )}
      </div>
    </div>
  );
}