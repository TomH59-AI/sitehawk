import { useRef } from "react";
import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const MI_TO_M = 1609.34;
const RINGS = [
  { mi: 0.25, color: "#22d3ee" },
  { mi: 0.5, color: "#a855f7" },
  { mi: 1, color: "#f59e0b" },
];

const VERDICT_COLOR = { fit: "#16a34a", ejected: "#dc2626", verify: "#d97706", pending: "#64748b" };

// SRC = Search Ring Center — small cell tower waypoint with its label.
function srcIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))">
      <svg width="20" height="26" viewBox="0 0 20 26" fill="none">
        <path d="M10 6 L3 25 M10 6 L17 25 M5.6 17 H14.4 M4.3 22 H15.7" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="10" cy="4" r="2.4" fill="#22d3ee"/>
        <path d="M5 3 A6 6 0 0 1 5 5" stroke="#22d3ee" stroke-width="1.4" fill="none"/>
        <path d="M15 3 A6 6 0 0 0 15 5" stroke="#22d3ee" stroke-width="1.4" fill="none"/>
      </svg>
      <span style="margin-top:-2px;background:#0e7490;color:#fff;font:700 9px/1 system-ui;letter-spacing:.06em;padding:2px 4px;border-radius:3px">SRC</span>
    </div>`,
    iconSize: [40, 38],
    iconAnchor: [20, 32],
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

// Floating readout that follows the clicked point: APPROVED @ height, or REJECTED + reason.
function probeIcon(probe) {
  const v = probe.verdict;
  const bg = VERDICT_COLOR[v] || VERDICT_COLOR.pending;
  const head =
    v === "pending"
      ? "CHECKING…"
      : v === "fit"
      ? `APPROVED — ${probe.max_height_ft} FT`
      : v === "ejected"
      ? "REJECTED"
      : "VERIFY";
  const body = v !== "pending" && v !== "fit" && probe.reason ? `<div style="font-weight:500;margin-top:3px">${probe.reason}</div>` : "";
  const coords = `<div style="font:600 10px/1.3 ui-monospace,monospace;opacity:.9;margin-top:3px">${probe.lat.toFixed(6)}, ${probe.lon.toFixed(6)}</div>`;
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:240px">
      <div style="position:absolute;left:0;bottom:14px;width:240px;box-sizing:border-box;background:${bg};color:#fff;font:700 11px/1.35 system-ui;padding:6px 8px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.45)">${head}${body}${coords}
        <div style="font-weight:500;opacity:.85;margin-top:3px">Double-click to save this spot</div>
      </div>
      <div style="position:absolute;left:115px;bottom:0;width:10px;height:10px;border-radius:50%;background:${bg};border:2px solid #fff"></div>
    </div>`,
    iconSize: [240, 10],
    iconAnchor: [120, 10],
  });
}

// Single click probes the point; double click saves it as a lettered target.
// Clicks outside the 1-mile ring are ignored.
function ClickCatcher({ center, onProbe, onSave, enabled }) {
  const timer = useRef(null);
  const inRing = (latlng) => L.latLng(center).distanceTo(latlng) <= MI_TO_M;
  useMapEvents({
    click(e) {
      if (!enabled || !inRing(e.latlng)) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => onProbe({ lat: e.latlng.lat, lon: e.latlng.lng }), 240);
    },
    dblclick(e) {
      clearTimeout(timer.current);
      if (!enabled || !inRing(e.latlng)) return;
      onSave({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

// TalonFit® ring map — SRC waypoint + 0.25 / 0.50 / 1-mile radii. Click to grade a
// point, double-click to save it as a lettered candidate.
export default function ScoutRingMap({ center, targets, probe, onProbe, onSave, onSelect, canPick }) {
  return (
    <div className="h-[520px] w-full">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={14}
        className="h-full w-full"
        scrollWheelZoom
        doubleClickZoom={false}
      >
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
        <Marker position={[center.lat, center.lon]} icon={srcIcon()} />
        {targets.map((t) => (
          <Marker
            key={t.id}
            position={[t.lat, t.lon]}
            icon={targetIcon(t.letter, t.verdict)}
            eventHandlers={{ click: () => onSelect(t.id) }}
          />
        ))}
        {probe && <Marker position={[probe.lat, probe.lon]} icon={probeIcon(probe)} interactive={false} />}
        <ClickCatcher center={[center.lat, center.lon]} onProbe={onProbe} onSave={onSave} enabled={canPick} />
      </MapContainer>
    </div>
  );
}