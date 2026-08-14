import { useEffect, useRef } from "react";
import { useMapEvents, Circle, Marker } from "react-leaflet";
import L from "leaflet";
import { base44 } from "@/api/base44Client";

const FT_TO_M = 0.3048;

const verdictColor = (decision) => {
  if (decision === "APPROVED") return "#16a34a";
  if (decision === "REJECTED") return "#dc2626";
  return "#d97706";
};

const dot = (color, label) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.55);color:#fff;font:700 12px sans-serif">${label || ""}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

/**
 * SmartCursor — when enabled, debounces on mousemove and runs the full
 * TalonFit-AI-1.0 solver at the hovered point. Draws the candidate marker +
 * fall-zone circle and pushes the result + pixel position up for the tooltip.
 */
export default function SmartCursor({ enabled, heightFt, anchor, savedCount, onHover }) {
  const reqIdRef = useRef(0);
  const debounceRef = useRef(null);
  const pxRef = useRef(null);

  useMapEvents({
    mousemove(e) {
      if (!enabled) return;
      pxRef.current = { x: e.containerPoint.x, y: e.containerPoint.y };
      const { lat, lng } = e.latlng;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSolve(lat, lng), 700);
    },
    mouseout() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
  });

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const doSolve = async (lat, lon) => {
    const reqId = ++reqIdRef.current;
    onHover({ px: pxRef.current, solving: true, point: { lat, lon }, result: null });
    try {
      const { data } = await base44.functions.invoke("talonfitAiSolve", {
        lat, lon,
        center_lat: anchor.lat, center_lon: anchor.lon,
        requested_height_ft: Number(heightFt) || 150,
        compound_width_ft: 100, compound_depth_ft: 100,
        saved_count: savedCount,
      });
      if (reqId !== reqIdRef.current) return;
      onHover({ px: pxRef.current, solving: false, point: { lat, lon }, result: data });
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      onHover({ px: pxRef.current, solving: false, point: { lat, lon }, result: null, error: e?.message || "Solver failed" });
    }
  };

  if (!enabled) return null;
  return null;
}

/**
 * SmartCursorLayers — draws the candidate marker + fall-zone circle from the
 * latest hover result. Kept separate so it re-renders on hover state change
 * without re-attaching map events.
 */
export function SmartCursorLayers({ hover }) {
  const result = hover?.result;
  if (!result) return null;
  const r = result.calculated_result || {};
  const o = result.ordinance_rules || {};
  const cp = result.candidate_point;
  if (!cp) return null;

  const color = verdictColor(r.decision);
  const plr = o.property_line_rule || {};
  const maxH = r.maximum_buildable_height_ft;
  // Fall-zone radius: use the max buildable height * height_multiplier when
  // available, otherwise the max height itself. Never fabricated.
  let fallZoneFt = null;
  if (Number.isFinite(maxH) && maxH > 0) {
    const mult = plr.height_multiplier;
    fallZoneFt = Number.isFinite(mult) && mult > 0 ? maxH * mult : maxH;
  } else if (Number.isFinite(plr.fixed_distance_ft)) {
    fallZoneFt = plr.fixed_distance_ft;
  }

  const label = r.decision === "APPROVED" ? "✓" : r.decision === "REJECTED" ? "✗" : "?";

  return (
    <>
      <Marker
        position={[cp.latitude, cp.longitude]}
        icon={dot(color, label)}
      />
      {Number.isFinite(fallZoneFt) && fallZoneFt > 0 && (
        <Circle
          center={[cp.latitude, cp.longitude]}
          radius={fallZoneFt * FT_TO_M}
          pathOptions={{ color, weight: 1.5, dashArray: "5 3", fillOpacity: 0.07 }}
        />
      )}
    </>
  );
}