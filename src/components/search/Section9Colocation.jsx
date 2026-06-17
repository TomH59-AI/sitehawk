/**
 * Section9Colocation — SiteHawk pipeline section: "HAWK COLOCATION INTELLIGENCE"
 *
 * Scans a 3-mile radius from the SARF center using FCC ASR + OpenCellID (merged
 * at 100 m proximity tolerance) to surface existing towers that may be available
 * for colocation. Presented as a Mapbox interactive pin map with popup cards and
 * a results table below.
 *
 * Pipeline placement: after Section 3 (Targets resolved). Standalone — does NOT
 * gate any downstream section. Unlocks as soon as a SARF center is set.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Signal, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import SectionClearButton from "./SectionClearButton";
import { colocationOpportunities } from "@/functions/colocationOpportunities";
import { loadPublicConfig } from "@/lib/publicConfig";
import { ensureMapboxLoaded } from "@/lib/section4Maps";

const HEADER_COLOR = "#1e3a5f";
const RADIUS_MILES = 3;

// Source badge colors
const SOURCE_COLORS = {
  "FCC ASR + OpenCellID": "#0e7490",
  "FCC ASR": "#1d4ed8",
  "OpenCellID (signal only)": "#7c3aed",
};

const STRUCTURE_CATEGORY_STYLES = {
  tower:       { bg: "#1d4ed8", icon: "📡", label: "Cell Tower" },
  rooftop:     { bg: "#b45309", icon: "🏢", label: "Building / Rooftop" },
  utility:     { bg: "#6b7280", icon: "⚡", label: "Utility Structure" },
  elevated:    { bg: "#0f766e", icon: "🏗", label: "Elevated Structure" },
  concealed:   { bg: "#15803d", icon: "🌲", label: "Concealed" },
  signal_only: { bg: "#7c3aed", icon: "📶", label: "Signal Only" },
  other:       { bg: "#64748b", icon: "❓", label: "Other" },
  unknown:     { bg: "#94a3b8", icon: "❓", label: "Unknown" },
};

function StructureBadge({ category, label }) {
  const style = STRUCTURE_CATEGORY_STYLES[category] || STRUCTURE_CATEGORY_STYLES.unknown;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold text-white whitespace-nowrap"
      style={{ background: style.bg }}
      title={label}
    >
      {style.icon} {label || style.label}
    </span>
  );
}

function TowerPopup({ tower, onClose }) {
  return (
    <div className="min-w-[200px] p-3 bg-white rounded-lg shadow-xl border border-border text-sm space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-foreground truncate">{tower.owner || "Unknown Owner"}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
      </div>
      {tower.structure_type && <p className="text-muted-foreground text-xs">{tower.structure_type}</p>}
      {tower.height_ft != null && <p className="text-xs"><span className="font-semibold">Height:</span> {tower.height_ft} ft AGL</p>}
      {tower.radio_types?.length > 0 && <p className="text-xs"><span className="font-semibold">Radio:</span> {tower.radio_types.join(", ")}</p>}
      {tower.carriers?.length > 0 && <p className="text-xs"><span className="font-semibold">Carriers:</span> {tower.carriers.join(", ")}</p>}
      {tower.range_m != null && <p className="text-xs"><span className="font-semibold">Range:</span> {tower.range_m} m</p>}
      <p className="text-xs"><span className="font-semibold">Distance:</span> {tower.distance_miles} mi</p>
      <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold text-white mt-1" style={{ background: SOURCE_COLORS[tower.source] || "#64748b" }}>
        {tower.source}
      </span>
    </div>
  );
}

export default function Section9Colocation({ unlocked, srcLat, srcLon, onClear }) {
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [towers, setTowers] = useState([]);
  const [popupTower, setPopupTower] = useState(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);
  const popupRef = useRef(null);

  const clearMap = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupRef.current?.remove();
    popupRef.current = null;
    mapInstance.current?.remove();
    mapInstance.current = null;
  };

  useEffect(() => () => clearMap(), []);

  const buildMap = useCallback(async (towerList) => {
    if (!mapRef.current || !towerList.length) return;
    const cfg = await loadPublicConfig();
    const token = cfg.mapboxAccessToken;
    if (!token) return;
    await ensureMapboxLoaded();
    const mapboxgl = window.mapboxgl;
    if (!mapboxgl) return;

    clearMap();
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [srcLon, srcLat],
      zoom: 11,
    });
    mapInstance.current = map;

    map.on("load", () => {
      // Draw the 3-mile search ring
      const STEPS = 64;
      const ring = [];
      for (let i = 0; i <= STEPS; i++) {
        const angle = (i / STEPS) * 2 * Math.PI;
        const dLat = (RADIUS_MILES / 69.0) * Math.cos(angle);
        const dLon = (RADIUS_MILES / (69.0 * Math.cos((srcLat * Math.PI) / 180))) * Math.sin(angle);
        ring.push([srcLon + dLon, srcLat + dLat]);
      }
      map.addSource("ring", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } },
      });
      map.addLayer({ id: "ring-fill", type: "fill", source: "ring", paint: { "fill-color": "#3b82f6", "fill-opacity": 0.06 } });
      map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [4, 2] } });

      // Center pin (SARF center)
      new mapboxgl.Marker({ color: "#facc15" })
        .setLngLat([srcLon, srcLat])
        .addTo(map);

      // Tower pins — colored by structure category
      towerList.forEach((tower) => {
        if (!tower.latitude || !tower.longitude) return;
        const catStyle = STRUCTURE_CATEGORY_STYLES[tower.structure_category] || STRUCTURE_CATEGORY_STYLES.unknown;
        const color = catStyle.bg;

        // Create a custom SVG element so we can color by source
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.4)`;
        el.title = tower.owner || tower.source;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([tower.longitude, tower.latitude])
          .addTo(map);
        markersRef.current.push(marker);

        // Popup on click
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          popupRef.current?.remove();
          const popup = new mapboxgl.Popup({ offset: 12, closeButton: false })
            .setLngLat([tower.longitude, tower.latitude])
            .setHTML(`<div id="sh-colo-popup"></div>`)
            .addTo(map);
          popupRef.current = popup;
          // We set React state so the popup div gets replaced by React content
          setPopupTower(tower);
          popup.on("close", () => setPopupTower(null));
        });
      });

      // Fit to all towers
      if (towerList.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([srcLon, srcLat]);
        towerList.forEach((t) => { if (t.latitude && t.longitude) bounds.extend([t.longitude, t.latitude]); });
        map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
      }
    });
  }, [srcLat, srcLon]);

  // Inject React popup content into the Mapbox popup div when popupTower changes
  useEffect(() => {
    const el = document.getElementById("sh-colo-popup");
    if (!el || !popupTower) return;
    // Simple DOM injection since we can't use ReactDOM.render in a portal here
    el.innerHTML = `
      <div style="min-width:190px;padding:10px;font-family:inherit;font-size:13px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
          <strong style="word-break:break-word">${popupTower.owner || "Unknown Owner"}</strong>
        </div>
        ${popupTower.structure_label ? `<p style="display:inline-flex;align-items:center;gap:4px;font-size:11px;margin:0 0 4px;padding:2px 6px;border-radius:4px;background:${(STRUCTURE_CATEGORY_STYLES[popupTower.structure_category] || STRUCTURE_CATEGORY_STYLES.unknown).bg};color:#fff;font-weight:600">${(STRUCTURE_CATEGORY_STYLES[popupTower.structure_category] || STRUCTURE_CATEGORY_STYLES.unknown).icon} ${popupTower.structure_label}</p>` : ""}
        ${popupTower.height_ft != null ? `<p style="margin:2px 0"><span style="font-weight:600">Height:</span> ${popupTower.height_ft} ft AGL</p>` : ""}
        ${popupTower.radio_types?.length ? `<p style="margin:2px 0"><span style="font-weight:600">Radio:</span> ${popupTower.radio_types.join(", ")}</p>` : ""}
        ${popupTower.carriers?.length ? `<p style="margin:2px 0"><span style="font-weight:600">Carriers:</span> ${popupTower.carriers.join(", ")}</p>` : ""}
        ${popupTower.range_m != null ? `<p style="margin:2px 0"><span style="font-weight:600">Range:</span> ${popupTower.range_m} m</p>` : ""}
        <p style="margin:2px 0"><span style="font-weight:600">Distance:</span> ${popupTower.distance_miles} mi</p>
        <span style="display:inline-block;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:600;color:#fff;background:${SOURCE_COLORS[popupTower.source] || "#64748b"};margin-top:4px">${popupTower.source}</span>
      </div>
    `;
  }, [popupTower]);

  const run = useCallback(async () => {
    setActive(true);
    setLoading(true);
    setDone(false);
    setTowers([]);
    setPopupTower(null);
    try {
      const res = await colocationOpportunities({ lat: srcLat, lon: srcLon, radius_miles: RADIUS_MILES });
      const list = res?.data?.towers || [];
      setTowers(list);
      if (list.length === 0) {
        toast.message("No existing towers found within 3 miles — this may be a greenfield opportunity.");
      } else {
        toast.success(`Found ${list.length} tower site${list.length !== 1 ? "s" : ""} within ${RADIUS_MILES} mi.`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Colocation scan failed.");
    } finally {
      setLoading(false);
      setDone(true);
    }
  }, [srcLat, srcLon]);

  // Build the map AFTER the results block (and mapRef div) is in the DOM
  useEffect(() => {
    if (done && towers.length > 0) {
      buildMap(towers);
    }
  }, [done, towers, buildMap]);

  const rerun = () => {
    clearMap();
    run();
  };

  // ── LOCKED ──────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: HEADER_COLOR }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 9 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Colocation Intelligence</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete Section 1 (drop a SARF pin) to unlock colocation scanning.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Banner */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white"
        style={{ background: HEADER_COLOR }}
      >
        <div className="flex items-center gap-2">
          <Signal className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 9 · COLOCATION</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Colocation Intelligence</h2>
            <div className="text-[11px] font-mono opacity-80 mt-0.5">
              FCC ASR + OpenCellID · {RADIUS_MILES}-mile ring · 100 m merge tolerance
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!active ? (
            <Button onClick={run} className="bg-white hover:bg-blue-50 font-semibold shadow" style={{ color: HEADER_COLOR }}>
              <Sparkles className="w-4 h-4 mr-2" /> Scan Colocation Opportunities
            </Button>
          ) : done ? (
            <Button onClick={rerun} disabled={loading} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold">
              <RefreshCw className="w-4 h-4 mr-2" /> Re-scan
            </Button>
          ) : null}
          {active && onClear && <SectionClearButton onClear={onClear} />}
        </div>
      </div>

      {/* Idle */}
      {!active && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Cross-references FCC ASR registered towers with OpenCellID crowdsourced cell data within a {RADIUS_MILES}-mile radius of your SARF center.
          Sites from both sources are merged at a 100-metre proximity tolerance to eliminate duplicates.
          Click <span className="font-semibold text-foreground">Scan Colocation Opportunities</span> to begin.
        </div>
      )}

      {/* Loading */}
      {loading && <HawkFlightSpinner label="Scanning FCC + OpenCellID for existing towers…" />}

      {/* Results */}
      {!loading && done && (
        <>
          {towers.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No existing tower sites found within {RADIUS_MILES} miles — this appears to be a greenfield location.
            </div>
          ) : (
            <>
              {/* Info banner */}
              <div className="px-4 py-2.5 border-b border-border bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-800 dark:text-blue-200 space-y-0.5">
                <p className="font-semibold text-sm">
                  {towers.length} tower site{towers.length !== 1 ? "s" : ""} found within {RADIUS_MILES} miles
                </p>
                <p className="opacity-80 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                  <span>Click any pin for details. Pin color = structure type:</span>
                  {Object.entries(STRUCTURE_CATEGORY_STYLES).filter(([k]) => !["other","unknown"].includes(k)).map(([, s]) => (
                    <span key={s.label} className="inline-flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.bg }} />
                      <span>{s.icon} {s.label}</span>
                    </span>
                  ))}
                </p>
              </div>

              {/* Mapbox map */}
              <div
                ref={mapRef}
                className="w-full border-b border-border"
                style={{ height: 480 }}
              />

              {/* Results table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-white text-xs" style={{ background: HEADER_COLOR }}>
                      {["#", "Owner / Operator", "Structure", "Height (ft)", "Radio Types", "Carriers", "Distance (mi)", "Source"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border border-white/10">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {towers.map((t, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-2 border border-border font-mono text-xs">{i + 1}</td>
                        <td className="px-3 py-2 border border-border font-semibold">{t.owner || "—"}</td>
                        <td className="px-3 py-2 border border-border">
                          <StructureBadge category={t.structure_category || "unknown"} label={t.structure_label || t.structure_type || "Unknown"} />
                        </td>
                        <td className="px-3 py-2 border border-border font-mono">{t.height_ft != null ? `${t.height_ft}'` : "—"}</td>
                        <td className="px-3 py-2 border border-border">{t.radio_types?.length ? t.radio_types.join(", ") : "—"}</td>
                        <td className="px-3 py-2 border border-border">{t.carriers?.length ? t.carriers.join(", ") : "—"}</td>
                        <td className="px-3 py-2 border border-border font-mono">{t.distance_miles}</td>
                        <td className="px-3 py-2 border border-border">
                          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold text-white" style={{ background: SOURCE_COLORS[t.source] || "#64748b" }}>
                            {t.source}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}