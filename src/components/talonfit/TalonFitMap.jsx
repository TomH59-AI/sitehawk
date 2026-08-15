import { useEffect, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup, GeoJSON, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import { base44 } from "@/api/base44Client";
import { MousePointer2, Loader2 } from "lucide-react";
import TalonFitPopup from "./TalonFitPopup";

const MILE_M = 1609.344;
const FT_TO_M = 0.3048;

// ── Tower icon factory ── green for APPROVED, red for REJECTED, amber for VERIFY
const towerIcon = (decision, label) => {
  const color = decision === "APPROVED" ? "#16a34a"
    : decision === "REJECTED" ? "#dc2626"
    : "#f59e0b";
  const glyph = decision === "APPROVED" ? "✓" : decision === "REJECTED" ? "✗" : "?";
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);color:#fff;font:700 13px sans-serif">${label || glyph}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

const srcIcon = L.divIcon({
  className: "",
  html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#0891b2;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);color:#fff;font:700 9px sans-serif">SRC</div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// ── Click capture: single-click probes, double-click saves ──
function MapInteraction({ onProbe, onSave, canSave }) {
  const lastClickRef = useRef(0);
  useMapEvents({
    click(e) {
      const now = Date.now();
      if (now - lastClickRef.current < 400) {
        // Double-click → save
        if (canSave) onSave(e.latlng.lat, e.latlng.lng);
      } else {
        // Single-click → probe
        onProbe({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
      lastClickRef.current = now;
    },
  });
  return null;
}

// ── Smart cursor: debounced hover → TalonFit solve ──
function SmartCursor({ enabled, heightFt, anchor, savedCount, onHover }) {
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

// ── Smart cursor layers: marker + fall-zone circle from latest hover ──
function SmartCursorLayers({ hover }) {
  const result = hover?.result;
  if (!result) return null;
  const r = result.calculated_result || {};
  const o = result.ordinance_rules || {};
  const cp = result.candidate_point;
  if (!cp) return null;

  const color = r.decision === "APPROVED" ? "#16a34a" : r.decision === "REJECTED" ? "#dc2626" : "#f59e0b";
  const plr = o.property_line_rule || {};
  const maxH = r.maximum_buildable_height_ft;
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
      <Marker position={[cp.latitude, cp.longitude]} icon={towerIcon(r.decision, label)} />
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

// ── Probe marker with auto-open popup ──
function ProbeMarker({ probe, onSave, canSave, saving, nextLetter }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.openPopup();
  }, [probe]);
  const decision = probe?.solve?.calculated_result?.decision;
  return (
    <Marker position={[probe.lat, probe.lon]} icon={towerIcon(decision, "?")} ref={ref}>
      <Popup maxWidth={340} minWidth={280}>
        <TalonFitPopup
          probe={probe}
          onSave={onSave}
          canSave={canSave}
          saving={saving}
          nextLetter={nextLetter}
        />
      </Popup>
    </Marker>
  );
}

/**
 * TalonFitMap — aerial map with 2-mile search ring (Turf.js generated),
 * auto-selected targets, user probes, saved sites, and smart cursor.
 *
 * Turf.js is used for: search ring generation (turf.circle), fall-zone
 * circle generation, and containment check (turf.booleanPointInPolygon).
 */
export default function TalonFitMap({
  anchor,
  radiusMiles,
  probe,
  saved,
  autoTargets,
  onProbe,
  onSave,
  canSave,
  saving,
  nextLetter,
  heightFt,
}) {
  const [smartCursor, setSmartCursor] = useState(false);
  const [hover, setHover] = useState(null);

  // Turf.js: generate the 2-mile search ring as a GeoJSON polygon
  const ringGeo = useCallback(() => {
    try {
      return turf.circle([anchor.lon, anchor.lat], radiusMiles, { units: "miles", steps: 64 });
    } catch {
      return null;
    }
  }, [anchor, radiusMiles]);

  const ringFeature = ringGeo();

  // Turf.js: containment check — is a point inside the search ring?
  const isInRing = useCallback((lat, lon) => {
    if (!ringFeature) return true;
    try {
      return turf.booleanPointInPolygon([lon, lat], ringFeature);
    } catch {
      return true;
    }
  }, [ringFeature]);

  // Wrap onProbe to enforce ring containment
  const handleProbe = useCallback((pt) => {
    if (!isInRing(pt.lat, pt.lon)) return;
    onProbe(pt);
  }, [isInRing, onProbe]);

  return (
    <div className="relative h-[560px] w-full">
      <MapContainer
        center={[anchor.lat, anchor.lon]}
        zoom={12}
        className="h-[560px] w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri"
          maxZoom={19}
        />

        {/* Search ring — rendered via Turf.js geometry */}
        {ringFeature && (
          <GeoJSON
            data={ringFeature}
            style={{ color: "#06b6d4", weight: 2, fillOpacity: 0.04 }}
          />
        )}

        {/* SRC marker */}
        <Marker position={[anchor.lat, anchor.lon]} icon={srcIcon} />

        {/* Auto-selected targets */}
        {autoTargets.map((t, i) => (
          <Marker
            key={`auto-${i}`}
            position={[t.lat, t.lon]}
            icon={towerIcon(t.decision, ["A", "B", "C"][i])}
          >
            <Popup maxWidth={340} minWidth={280}>
              <TalonFitPopup probe={t} hideSave />
            </Popup>
          </Marker>
        ))}

        {/* Saved sites */}
        {saved.map((s, i) => (
          <Marker
            key={`saved-${i}`}
            position={[s.latitude, s.longitude]}
            icon={towerIcon(s.decision, ["A", "B", "C"][i])}
          />
        ))}

        {/* Current probe */}
        {probe && (
          <ProbeMarker
            probe={probe}
            onSave={onSave}
            canSave={canSave}
            saving={saving}
            nextLetter={nextLetter}
          />
        )}

        {/* Smart cursor */}
        <SmartCursor
          enabled={smartCursor}
          heightFt={heightFt}
          anchor={anchor}
          savedCount={saved.length}
          onHover={setHover}
        />
        {smartCursor && <SmartCursorLayers hover={hover} />}

        {/* Map interactions: click = probe, double-click = save */}
        <MapInteraction onProbe={handleProbe} onSave={onSave} canSave={canSave} />
      </MapContainer>

      {/* Smart cursor toggle */}
      <button
        onClick={() => { setSmartCursor((s) => !s); if (smartCursor) setHover(null); }}
        className={`absolute right-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-lg transition-all ${
          smartCursor ? "border-cyan-400 bg-cyan-500 text-slate-900" : "border-white/15 bg-slate-900/85 text-white/80 hover:text-white"
        }`}
        title="Smart Cursor — hover any parcel for an instant TalonFit verdict"
      >
        <MousePointer2 className="h-3.5 w-3.5" /> Smart Cursor
      </button>

      {/* Smart cursor tooltip */}
      {smartCursor && hover?.result && (
        <div
          className="pointer-events-none absolute z-[999] max-w-[220px] rounded-lg border border-white/15 bg-slate-900/95 px-2.5 py-1.5 text-[11px] text-white shadow-xl"
          style={{ left: (hover.px?.x ?? 0) + 14, top: (hover.px?.y ?? 0) + 14 }}
        >
          {hover.solving ? (
            <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Solving…</span>
          ) : (
            <>
              <div className={`font-bold ${hover.result.calculated_result?.decision === "APPROVED" ? "text-green-400" : hover.result.calculated_result?.decision === "REJECTED" ? "text-red-400" : "text-amber-400"}`}>
                {hover.result.calculated_result?.decision || "VERIFY"}
                {Number.isFinite(hover.result.calculated_result?.maximum_buildable_height_ft) ? ` · ${hover.result.calculated_result.maximum_buildable_height_ft} ft` : ""}
              </div>
              <div className="text-white/60">{hover.result.calculated_result?.binding_constraint || ""}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}