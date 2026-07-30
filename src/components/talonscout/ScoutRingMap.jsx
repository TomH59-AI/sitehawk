import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MI_TO_M = 1609.34;
const RINGS = [
  { mi: 0.25, color: "#22d3ee" },
  { mi: 0.5, color: "#0891b2" },
  { mi: 1, color: "#f59e0b" },
];

const VERDICT_COLOR = { fit: "#16a34a", ejected: "#dc2626", verify: "#d97706", pending: "#64748b" };

function waypointIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:22px;line-height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">📡</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 20],
  });
}

function targetIcon(letter, verdict) {
  const color = VERDICT_COLOR[verdict] || VERDICT_COLOR.pending;
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;font:700 13px/26px system-ui;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)">${letter}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Clicks are only accepted inside the 1-mile ring, and only up to the target cap.
function ClickCatcher({ center, onPick, enabled }) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      const d = L.latLng(center).distanceTo(e.latlng);
      if (d > MI_TO_M) return;
      onPick({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

// TalonFit® target ring map — waypoint + 0.25 / 0.5 / 1-mile radii, up to ten
// alphabetically-labeled candidate points graded green (fit) or red (EJECTED).
export default function ScoutRingMap({ center, targets, onPick, onSelect, canPick }) {
  return (
    <div className="h-[520px] w-full">
      <MapContainer center={[center.lat, center.lon]} zoom={14} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri"
          maxZoom={19}
        />
        {RINGS.map((r) => (
          <Circle
            key={r.mi}
            center={[center.lat, center.lon]}
            radius={r.mi * MI_TO_M}
            pathOptions={{ color: r.color, weight: 2, fill: false, dashArray: r.mi === 1 ? "6 6" : null }}
          />
        ))}
        <Marker position={[center.lat, center.lon]} icon={waypointIcon()} />
        {targets.map((t) => (
          <Marker
            key={t.id}
            position={[t.lat, t.lon]}
            icon={targetIcon(t.letter, t.verdict)}
            eventHandlers={{ click: () => onSelect(t.id) }}
          />
        ))}
        <ClickCatcher center={[center.lat, center.lon]} onPick={onPick} enabled={canPick} />
      </MapContainer>
    </div>
  );
}