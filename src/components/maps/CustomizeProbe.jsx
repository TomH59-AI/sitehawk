import { useEffect, useRef, useState, useCallback } from "react";
import { computePhysicalFit } from "@/lib/hawkfitGeometry";

const EMPTY = { type: "FeatureCollection", features: [] };

// Layer ids namespaced so this never collides with a host map's own layers.
const SRC_FALL = "cp-fall";
const SRC_COMP = "cp-comp";
const LYR_FALL_FILL = "cp-fall-fill";
const LYR_FALL_LINE = "cp-fall-line";
const LYR_COMP_FILL = "cp-comp-fill";
const LYR_COMP_LINE = "cp-comp-line";

const STATUS = {
  works: { label: "TOWER WORKS HERE", glyph: "✔", bg: "rgba(6,78,59,0.94)", border: "#10b981", text: "#6ee7b7", fill: "#10b981" },
  fails: { label: "TOWER WON'T WORK HERE", glyph: "✖", bg: "rgba(127,29,29,0.94)", border: "#ef4444", text: "#fca5a5", fill: "#ef4444" },
  needs_review: { label: "NO PARCEL — CAN'T TELL", glyph: "?", bg: "rgba(120,53,15,0.94)", border: "#f59e0b", text: "#fcd34d", fill: "#f59e0b" },
};

/**
 * CustomizeProbe — reusable "Customize" buildability probe overlay for any
 * Mapbox map. Toggle with Alt+Ctrl+Shift (press or click the pill). When ON:
 *   - Click anywhere OR free-drag the probe pin.
 *   - Verdict = WORKS / WON'T WORK based ONLY on physical fit at that spot
 *     (tower + fall zone + compound inside the parcel). Nothing else.
 *   - Zoning is shown as info only — it never changes the verdict.
 *
 * Props:
 *   mapRef          – ref holding a live mapbox-gl Map instance
 *   ready           – true once the map's "load" has fired
 *   parcelGeometry  – GeoJSON Polygon/MultiPolygon (physical-fit basis)
 *   zoning          – zoning code/string, shown as info only
 *   heightFt/widthFt/depthFt – tower + compound dims (defaults 199/100/100)
 */
export default function CustomizeProbe({
  mapRef, ready, parcelGeometry, zoning,
  heightFt = 199, widthFt = 100, depthFt = 100,
}) {
  const [on, setOn] = useState(false);
  const [pt, setPt] = useState(null); // [lng, lat]
  const [fit, setFit] = useState(null);
  const markerRef = useRef(null);
  const layersAdded = useRef(false);
  const onRef = useRef(on);
  onRef.current = on;

  // Alt+Ctrl+Shift toggles the mode (any key with all three modifiers held).
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        setOn((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Add the probe's own layers once the map is ready.
  useEffect(() => {
    const map = mapRef?.current;
    if (!ready || !map || layersAdded.current) return;
    const add = () => {
      if (layersAdded.current || !map.getStyle()) return;
      if (!map.getSource(SRC_FALL)) map.addSource(SRC_FALL, { type: "geojson", data: EMPTY });
      if (!map.getSource(SRC_COMP)) map.addSource(SRC_COMP, { type: "geojson", data: EMPTY });
      if (!map.getLayer(LYR_FALL_FILL)) map.addLayer({ id: LYR_FALL_FILL, type: "fill", source: SRC_FALL, paint: { "fill-color": ["get", "c"], "fill-opacity": 0.15 } });
      if (!map.getLayer(LYR_FALL_LINE)) map.addLayer({ id: LYR_FALL_LINE, type: "line", source: SRC_FALL, paint: { "line-color": ["get", "c"], "line-width": 2, "line-dasharray": [2, 2] } });
      if (!map.getLayer(LYR_COMP_FILL)) map.addLayer({ id: LYR_COMP_FILL, type: "fill", source: SRC_COMP, paint: { "fill-color": ["get", "c"], "fill-opacity": 0.35 } });
      if (!map.getLayer(LYR_COMP_LINE)) map.addLayer({ id: LYR_COMP_LINE, type: "line", source: SRC_COMP, paint: { "line-color": ["get", "c"], "line-width": 2 } });
      layersAdded.current = true;
    };
    try { add(); } catch { /* style not ready — retry on styledata */ }
    map.on("styledata", add);
    return () => { try { map.off("styledata", add); } catch { /* map gone */ } };
  }, [ready, mapRef]);

  const setData = useCallback((id, data) => {
    try { mapRef?.current?.getSource(id)?.setData(data || EMPTY); } catch { /* map gone */ }
  }, [mapRef]);

  // Recompute fit whenever the probe point / dims / parcel change.
  useEffect(() => {
    if (!pt) { setFit(null); return; }
    setFit(computePhysicalFit({ parcelGeometry, towerLngLat: pt, heightFt, widthFt, depthFt }));
  }, [pt, parcelGeometry, heightFt, widthFt, depthFt]);

  // Paint the fall zone + compound in the verdict color.
  useEffect(() => {
    if (!on || !fit || !pt) { setData(SRC_FALL, EMPTY); setData(SRC_COMP, EMPTY); return; }
    const color = (STATUS[fit.status] || STATUS.needs_review).fill;
    const stamp = (g) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: { c: color }, geometry: g.geometry ?? g }] });
    setData(SRC_FALL, fit.fallZone ? stamp(fit.fallZone) : EMPTY);
    setData(SRC_COMP, fit.compound ? stamp(fit.compound) : EMPTY);
  }, [on, fit, pt, setData]);

  // Click + free-drag handlers, wired only while the mode is ON.
  useEffect(() => {
    const map = mapRef?.current;
    if (!ready || !map) return;

    const onClick = (e) => {
      if (!onRef.current) return;
      setPt([e.lngLat.lng, e.lngLat.lat]);
    };
    map.on("click", onClick);

    return () => {
      try {
        map.off("click", onClick);
      } catch { /* map gone */ }
    };
  }, [ready, mapRef]);

  // Manage the draggable probe pin as the mode / point changes.
  useEffect(() => {
    const map = mapRef?.current;
    if (!ready || !map || !window.mapboxgl) return;
    if (on && pt) {
      if (!markerRef.current) {
        const el = document.createElement("div");
        const marker = new window.mapboxgl.Marker({ draggable: true, color: "#0ea5e9" }).setLngLat(pt).addTo(map);
        const report = () => { const p = marker.getLngLat(); setPt([p.lng, p.lat]); };
        marker.on("drag", report);
        marker.on("dragend", report);
        markerRef.current = marker;
      } else {
        const cur = markerRef.current.getLngLat();
        if (Math.abs(cur.lng - pt[0]) > 1e-9 || Math.abs(cur.lat - pt[1]) > 1e-9) markerRef.current.setLngLat(pt);
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    return undefined;
  }, [ready, on, pt, mapRef]);

  // Crosshair cursor while probing.
  useEffect(() => {
    const c = mapRef?.current?.getCanvas?.();
    if (c) c.style.cursor = on ? "crosshair" : "";
  }, [on, mapRef]);

  // Clean up marker + layer data on unmount.
  useEffect(() => () => {
    if (markerRef.current) { try { markerRef.current.remove(); } catch { /* gone */ } markerRef.current = null; }
    setData(SRC_FALL, EMPTY);
    setData(SRC_COMP, EMPTY);
  }, [setData]);

  const s = fit ? (STATUS[fit.status] || STATUS.needs_review) : null;

  return (
    <>
      {/* Toggle pill — always visible bottom-left */}
      <button
        onClick={() => setOn((v) => !v)}
        title="Toggle Customize probe (Alt + Ctrl + Shift)"
        className={`absolute bottom-2 left-2 z-20 px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-lg border transition-colors ${
          on ? "bg-sky-600 border-sky-400 text-white" : "bg-black/70 border-white/20 text-white/90 hover:bg-black/85"
        }`}
      >
        {on ? "✕ Exit Customize" : "🎯 Customize"}
      </button>

      {on && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 max-w-[92%] flex flex-col items-center gap-1.5">
          {/* Instruction chip */}
          {!pt && (
            <div className="px-3 py-1.5 rounded-lg bg-sky-600/95 text-white text-[11px] font-semibold shadow-lg text-center">
              Click anywhere or drag the pin — I'll tell you if a tower works right there, based only on where it is.
            </div>
          )}
          {/* Verdict badge */}
          {fit && s && (
            <div
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-lg flex items-center gap-2 text-center"
              style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
            >
              <span className="text-sm leading-none">{s.glyph}</span>
              <span>
                {s.label}
                {fit.reasons?.[0] && <span className="block font-medium opacity-90 text-[11px]">{fit.reasons[0]}</span>}
                {/* Zoning = info only, never affects verdict */}
                <span className="block font-medium opacity-80 text-[11px]">
                  Zoning (info only): {zoning ? String(zoning) : "unknown"}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}