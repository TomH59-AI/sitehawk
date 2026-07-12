/**
 * Section9Colocation — HAWK COLOCATION INTELLIGENCE
 *
 * FCC ASR (free/unlimited) + OpenCellID (quota-gated: only called when FCC < 5 results)
 * Merged at 100 m proximity — no duplicate pins.
 * Mapbox satellite-streets map with popup cards.
 * Full detail table: owner, structure, height, radio/frequency, carriers,
 *                    coordinates, address, distance, source.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Signal, Sparkles, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import SectionClearButton from "./SectionClearButton";
import { colocationOpportunities } from "@/functions/colocationOpportunities";
import { loadPublicConfig } from "@/lib/publicConfig";
import { ensureMapboxLoaded } from "@/lib/section4Maps";
import { getOwnerHQ } from "./colocation/towerOwnerHQ";

const HEADER_COLOR = "#1e3a5f";
const RADIUS_MILES = 3;

const SOURCE_COLORS = {
  "FCC ASR + OpenCellID": "#0e7490",
  "FCC ASR":              "#1d4ed8",
  "OpenCellID":           "#7c3aed",
};

const STRUCT_STYLES = {
  tower:       { bg: "#1d4ed8", icon: "📡", label: "Cell Tower" },
  rooftop:     { bg: "#b45309", icon: "🏢", label: "Building/Rooftop" },
  utility:     { bg: "#6b7280", icon: "⚡", label: "Utility Structure" },
  elevated:    { bg: "#0f766e", icon: "🏗", label: "Elevated Structure" },
  concealed:   { bg: "#15803d", icon: "🌲", label: "Concealed/Stealth" },
  signal_only: { bg: "#7c3aed", icon: "📶", label: "Signal Only (OCID)" },
  other:       { bg: "#64748b", icon: "❓", label: "Other" },
  unknown:     { bg: "#94a3b8", icon: "❓", label: "Unknown" },
};

function StructureBadge({ category, label }) {
  const s = STRUCT_STYLES[category] || STRUCT_STYLES.unknown;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold text-white whitespace-nowrap"
      style={{ background: s.bg }}>
      {s.icon} {label || s.label}
    </span>
  );
}

function buildPopupHtml(t) {
  const s = STRUCT_STYLES[t.structure_category] || STRUCT_STYLES.unknown;
  const src = SOURCE_COLORS[t.source] || "#64748b";
  const coordStr = `${t.latitude?.toFixed(5)}, ${t.longitude?.toFixed(5)}`;
  return `
    <div style="min-width:220px;max-width:280px;padding:10px;font-family:system-ui,sans-serif;font-size:13px">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;word-break:break-word">${t.owner || "Unknown Owner"}</div>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 7px;border-radius:4px;background:${s.bg};color:#fff;font-weight:600;margin-bottom:6px">${s.icon} ${t.structure_label || t.structure_type || s.label}</span>
      ${getOwnerHQ(t.owner) ? `<div style="margin:3px 0"><b>Headquarters:</b> ${getOwnerHQ(t.owner)}</div>` : ""}
      ${t.height_ft != null ? `<div style="margin:3px 0"><b>Height:</b> ${t.height_ft} ft AGL</div>` : ""}
      <div style="margin:3px 0;font-family:monospace;font-size:11px;color:#64748b">${coordStr}</div>
      ${t.asrn ? `<div style="margin:3px 0"><b>ASR#:</b> ${t.asrn}</div>` : ""}
      <div style="margin:3px 0"><b>Distance:</b> ${t.distance_miles} mi</div>
      ${t.fcc_url ? `<a href="${t.fcc_url}" target="_blank" rel="noopener" style="display:inline-block;margin-top:5px;font-size:11px;color:#1d4ed8;text-decoration:underline">FCC ASR record ↗</a>` : ""}
      <div style="margin-top:7px"><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${src};color:#fff;font-weight:600">${t.source}</span></div>
    </div>`;
}

export default function Section9Colocation({ unlocked, srcLat, srcLon, onClear }) {
  const [active, setActive]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [towers, setTowers]     = useState([]);
  const [scanMeta, setScanMeta] = useState(null); // { fcc_count, ocid_count, source }
  const mapRef       = useRef(null);
  const mapInstance  = useRef(null);
  const markersRef   = useRef([]);
  const popupRef     = useRef(null);

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
    const token = cfg?.mapboxAccessToken;
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
      // 3-mile search ring
      const STEPS = 64;
      const ring = [];
      for (let i = 0; i <= STEPS; i++) {
        const angle = (i / STEPS) * 2 * Math.PI;
        const dLat = (RADIUS_MILES / 69.0) * Math.cos(angle);
        const dLon = (RADIUS_MILES / (69.0 * Math.cos((srcLat * Math.PI) / 180))) * Math.sin(angle);
        ring.push([srcLon + dLon, srcLat + dLat]);
      }
      map.addSource("ring", { type: "geojson", data: { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] } } });
      map.addLayer({ id: "ring-fill", type: "fill", source: "ring", paint: { "fill-color": "#3b82f6", "fill-opacity": 0.06 } });
      map.addLayer({ id: "ring-line", type: "line", source: "ring", paint: { "line-color": "#3b82f6", "line-width": 2, "line-dasharray": [4, 2] } });

      // SARF center (yellow)
      new mapboxgl.Marker({ color: "#facc15" }).setLngLat([srcLon, srcLat]).addTo(map);

      // Tower pins
      towerList.forEach((tower) => {
        if (!tower.latitude || !tower.longitude) return;
        const style = STRUCT_STYLES[tower.structure_category] || STRUCT_STYLES.unknown;
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${style.bg};border:2px solid #fff;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.5)`;
        el.title = tower.owner || tower.source;

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([tower.longitude, tower.latitude])
          .addTo(map);
        markersRef.current.push(marker);

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          popupRef.current?.remove();
          const popup = new mapboxgl.Popup({ offset: 12, closeButton: true, maxWidth: "300px" })
            .setLngLat([tower.longitude, tower.latitude])
            .setHTML(buildPopupHtml(tower))
            .addTo(map);
          popupRef.current = popup;
        });
      });

      // Fit to all pins
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([srcLon, srcLat]);
      towerList.forEach((t) => { if (t.latitude && t.longitude) bounds.extend([t.longitude, t.latitude]); });
      map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
    });
  }, [srcLat, srcLon]);

  const run = useCallback(async () => {
    setActive(true);
    setLoading(true);
    setDone(false);
    setTowers([]);
    setScanMeta(null);
    try {
      const res = await colocationOpportunities({ lat: srcLat, lon: srcLon, radius_miles: RADIUS_MILES });
      // Cell towers, building/rooftop sites, and OpenCellID signal points —
      // exclude only utility poles, water tanks, and misc structures.
      const list = (res?.data?.towers || []).filter((t) =>
        ["tower", "rooftop", "signal_only"].includes(t.structure_category)
      );
      const meta = {
        fcc_count: res?.data?.fcc_count ?? 0,
        ocid_count: res?.data?.ocid_count ?? 0,
        source: res?.data?.source || "FCC ASR",
      };
      setTowers(list);
      setScanMeta(meta);
      if (list.length === 0) {
        toast.message("No existing towers found within 3 miles — possible greenfield opportunity.");
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

  useEffect(() => {
    if (done && towers.length > 0) buildMap(towers);
  }, [done, towers, buildMap]);

  const rerun = () => { clearMap(); run(); };

  // ── LOCKED ───────────────────────────────────────────────────────────────────
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
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: HEADER_COLOR }}>
        <div className="flex items-center gap-2">
          <Signal className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 9 · COLOCATION</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Colocation Intelligence</h2>
            <div className="text-[11px] font-mono opacity-80 mt-0.5">
              FCC ASR + OpenCellID · towers & rooftops · {RADIUS_MILES}-mile ring
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
          Queries FCC ASR registered structures and OpenCellID crowdsourced cell data together —
          showing cell towers, building/rooftop sites, and signal-only cell locations for maximum
          colocation potential. Sites from both sources are merged at 100-metre proximity to eliminate duplicates.
        </div>
      )}

      {/* Loading */}
      {loading && <HawkFlightSpinner label="Scanning FCC ASR + OpenCellID for existing towers…" />}

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
              <div className="px-4 py-2.5 border-b border-border bg-blue-50 dark:bg-blue-950/20 text-xs text-blue-800 dark:text-blue-200 space-y-1">
                <p className="font-semibold text-sm">
                  {towers.length} tower site{towers.length !== 1 ? "s" : ""} found within {RADIUS_MILES} miles
                </p>
                {scanMeta && (
                  <p className="opacity-80">
                    {scanMeta.fcc_count > 0 && <span className="mr-3">📡 FCC ASR: <b>{scanMeta.fcc_count}</b></span>}
                    {scanMeta.ocid_count > 0 && <span className="mr-3">📶 OpenCellID: <b>{scanMeta.ocid_count}</b></span>}
                  </p>
                )}
                <p className="opacity-80">📡 Showing cell towers, building/rooftop sites, and OpenCellID signal points — utility poles and water tanks excluded.</p>
              </div>

              {/* Mapbox map */}
              <div ref={mapRef} className="w-full border-b border-border" style={{ height: 500 }} />

              {/* Results table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-white text-xs" style={{ background: HEADER_COLOR }}>
                      {["#","Owner / Operator","Headquarters","Tower Type","Ht (ft)","Coordinates","Distance"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border border-white/10">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {towers.map((t, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-2 border border-border font-mono text-xs">{i + 1}</td>
                        <td className="px-3 py-2 border border-border">
                          <div className="font-semibold leading-snug">{t.owner || "—"}</div>
                          {t.asrn && (
                            <div className="text-[10px] text-muted-foreground font-mono">ASR# {t.asrn}</div>
                          )}
                          {t.fcc_url && (
                            <a href={t.fcc_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline">
                              FCC <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 border border-border text-xs">
                          {getOwnerHQ(t.owner) || "—"}
                        </td>
                        <td className="px-3 py-2 border border-border">
                          <StructureBadge category={t.structure_category || "unknown"} label={t.structure_label || t.structure_type || "Unknown"} />
                        </td>
                        <td className="px-3 py-2 border border-border font-mono text-center">
                          {t.height_ft != null ? `${t.height_ft}'` : "—"}
                        </td>
                        <td className="px-3 py-2 border border-border font-mono text-[11px] whitespace-nowrap">
                          {t.latitude?.toFixed(5)}, {t.longitude?.toFixed(5)}
                        </td>
                        <td className="px-3 py-2 border border-border font-mono text-center">{t.distance_miles} mi</td>
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