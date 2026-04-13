import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const createNumberedIcon = (number) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background: hsl(217, 91%, 60%);
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
      border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      font-family: 'Space Grotesk', sans-serif;
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

function MapUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function ResultsMap({ centerLat, centerLon, results }) {
  const center = [centerLat, centerLon];
  const radiusMeters = 804.672; // 0.5 miles

  return (
    <div className="rounded-xl border border-border overflow-hidden h-[400px]">
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <MapUpdater center={center} zoom={14} />
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        {/* Search radius ring */}
        <Circle
          center={center}
          radius={radiusMeters}
          pathOptions={{
            color: "hsl(217, 91%, 60%)",
            fillColor: "hsl(217, 91%, 60%)",
            fillOpacity: 0.08,
            weight: 2,
            dashArray: "8, 4",
          }}
        />

        {/* Center marker */}
        <Circle
          center={center}
          radius={20}
          pathOptions={{
            color: "hsl(199, 89%, 48%)",
            fillColor: "hsl(199, 89%, 48%)",
            fillOpacity: 0.8,
            weight: 2,
          }}
        />

        {/* Result markers */}
        {results.map((r, idx) => (
          <Marker
            key={r.id || idx}
            position={[r.latitude, r.longitude]}
            icon={createNumberedIcon(idx + 1)}
          >
            <Popup>
              <div style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px" }}>
                <strong>{r.site_name}</strong><br />
                Score: {r.match_score}%<br />
                {r.parcel_size_acres && <>Size: {r.parcel_size_acres} acres<br /></>}
                {r.zoning_classification && <>Zoning: {r.zoning_classification}</>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}