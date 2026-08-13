import { MapContainer, TileLayer, Circle, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const RADIUS_M = 3218.69; // 2 miles

const VERDICT_COLOR = { fit: "#16a34a", ejected: "#dc2626", verify: "#f59e0b", pending: "#64748b" };

const pin = (color) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

function ClickCapture({ onProbe, canPick }) {
  useMapEvents({
    click(e) {
      if (canPick) onProbe({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

/**
 * TargetCRingMap — minimal click-to-grade map for the Change Target C panel:
 * aerial basemap, the 2-mile search radius, the ring center, and the current
 * probe pin colored by its TalonFit verdict.
 */
export default function TargetCRingMap({ center, probe, onProbe, canPick = true }) {
  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={13}
      className="h-[420px] w-full"
      scrollWheelZoom={false}
    >
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        attribution="Esri"
        maxZoom={19}
      />
      <Circle
        center={[center.lat, center.lon]}
        radius={RADIUS_M}
        pathOptions={{ color: "#06b6d4", weight: 2, fillOpacity: 0.05 }}
      />
      <Marker position={[center.lat, center.lon]} icon={pin("#0891b2")} />
      {probe && (
        <Marker
          position={[probe.lat, probe.lon]}
          icon={pin(VERDICT_COLOR[probe.verdict] || VERDICT_COLOR.pending)}
        />
      )}
      <ClickCapture onProbe={onProbe} canPick={canPick} />
    </MapContainer>
  );
}