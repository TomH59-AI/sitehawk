import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MousePointer2 } from "lucide-react";
import ScoutProbePopup from "./ScoutProbePopup";
import SmartCursor, { SmartCursorLayers } from "./SmartCursor";
import SmartCursorTooltip from "./SmartCursorTooltip";

const MILE_M = 1609.344;

const dot = (color, label) =>
  L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);color:#fff;font:700 11px sans-serif">${label || ""}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const verdictColor = (probe) => {
  const d = probe?.solve?.calculated_result?.decision;
  if (probe?.solving) return "#64748b";
  if (d === "APPROVED") return "#16a34a";
  if (d === "REJECTED") return "#dc2626";
  return "#f59e0b";
};

function ClickCapture({ onProbe }) {
  useMapEvents({
    click(e) {
      onProbe({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

function ProbeMarker({ probe, onSave, canSave, saving, nextLetter }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.openPopup();
  }, [probe]);
  return (
    <Marker position={[probe.lat, probe.lon]} icon={dot(verdictColor(probe), "?")} ref={ref}>
      <Popup maxWidth={320} minWidth={260}>
        <ScoutProbePopup
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
 * SiteSitterScoutMap — aerial map with the larger exploration ring, the SCIP
 * anchor, saved extra targets (D/E/F), and the current probe with its
 * TalonFit / Realie / zoning popup.
 */
export default function SiteSitterScoutMap({
  anchor,
  radiusMiles,
  probe,
  saved,
  onProbe,
  onSave,
  canSave,
  saving,
  nextLetter,
  heightFt,
}) {
  const [smartCursor, setSmartCursor] = useState(false);
  const [hover, setHover] = useState(null);

  return (
    <div className="relative h-[480px] w-full">
      <MapContainer
        center={[anchor.lat, anchor.lon]}
        zoom={12}
        className="h-[480px] w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri"
          maxZoom={19}
        />
        <Circle
          center={[anchor.lat, anchor.lon]}
          radius={radiusMiles * MILE_M}
          pathOptions={{ color: "#06b6d4", weight: 2, fillOpacity: 0.04 }}
        />
        <Marker position={[anchor.lat, anchor.lon]} icon={dot("#0891b2", "SRC")} />
        {saved.map((s, i) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={dot(s.fit?.feasible ? "#16a34a" : "#f59e0b", ["A", "B", "C", "D", "E", "F"][i])}
          />
        ))}
        {probe && (
          <ProbeMarker
            probe={probe}
            onSave={onSave}
            canSave={canSave}
            saving={saving}
            nextLetter={nextLetter}
          />
        )}
        {/* Smart Cursor — debounced TalonFit solve on hover */}
        <SmartCursor
          enabled={smartCursor}
          heightFt={heightFt}
          anchor={anchor}
          savedCount={saved.length}
          onHover={setHover}
        />
        {smartCursor && <SmartCursorLayers hover={hover} />}
        <ClickCapture onProbe={onProbe} />
      </MapContainer>

      {/* Smart Cursor tooltip — floats at the cursor position */}
      {smartCursor && <SmartCursorTooltip hover={hover} mapWidth={480} />}

      {/* Smart Cursor toggle */}
      <button
        onClick={() => { setSmartCursor((s) => !s); if (smartCursor) setHover(null); }}
        className={`absolute right-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-lg transition-all ${
          smartCursor ? "border-cyan-400 bg-cyan-500 text-slate-900" : "border-white/15 bg-slate-900/85 text-white/80 hover:text-white"
        }`}
        title="Smart Cursor — hover any parcel for an instant TalonFit verdict"
      >
        <MousePointer2 className="h-3.5 w-3.5" /> Smart Cursor
      </button>
    </div>
  );
}