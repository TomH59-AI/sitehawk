import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  TALONFIT_SEARCH_RADIUS_MILES,
  candidateSpatialRecord,
  distanceMiles,
  featureBounds,
  pointFeature,
  searchRing,
  toLeafletPosition,
} from "@/lib/spatial";

function scoreColor(score) {
  if (score >= 75) return "#22c55e";
  if (score >= 60) return "#00d4ff";
  return "#f59e0b";
}

function numberedIcon(number, score, selected) {
  const color = scoreColor(score);
  const size = selected ? 38 : 32;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0a0e17;border:3px solid ${color};display:flex;align-items:center;justify-content:center;color:${color};font:700 12px monospace;box-shadow:0 0 ${selected ? 14 : 7}px ${color}99">${number}</div>`,
  });
}

const towerIcon = L.divIcon({
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:2px solid #fecaca;box-shadow:0 0 14px #ef444499;display:flex;align-items:center;justify-content:center"><div style="width:6px;height:6px;border-radius:50%;background:white"></div></div>',
});

function MapController({ features, selectedCandidate, flyToRef }) {
  const map = useMap();
  const bounds = useMemo(() => featureBounds(features), [features]);

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]], { padding: [50, 50], maxZoom: 16 });
  }, [bounds, map]);

  useEffect(() => {
    flyToRef.current = (candidate) => {
      const position = pointFeature(candidate?.longitude, candidate?.latitude);
      if (position) map.flyTo(toLeafletPosition(position.geometry.coordinates), 17, { duration: 0.8 });
    };
    return () => { flyToRef.current = null; };
  }, [flyToRef, map]);

  useEffect(() => {
    if (!selectedCandidate) return;
    const point = pointFeature(selectedCandidate.longitude, selectedCandidate.latitude);
    if (point) map.panTo(toLeafletPosition(point.geometry.coordinates));
  }, [selectedCandidate, map]);

  return null;
}

export default function ScanResultsMap({ results = [], searchCenter, selectedIndex, onPinClick, flyToRef }) {
  const [showCoverage, setShowCoverage] = useState(true);
  const centerPoint = useMemo(
    () => pointFeature(searchCenter?.lon, searchCenter?.lat, { role: "search-center" }),
    [searchCenter?.lon, searchCenter?.lat],
  );
  const ring = useMemo(() => searchRing(centerPoint, TALONFIT_SEARCH_RADIUS_MILES), [centerPoint]);
  const records = useMemo(
    () => results.map((candidate) => candidateSpatialRecord(candidate, centerPoint, ring)),
    [results, centerPoint, ring],
  );

  const towers = useMemo(() => {
    const unique = new Map();
    results.forEach((result) => {
      (result.cell_towers || []).forEach((tower) => {
        const point = pointFeature(tower.lon, tower.lat);
        if (!point || distanceMiles(centerPoint, point) > TALONFIT_SEARCH_RADIUS_MILES) return;
        const key = point.geometry.coordinates.map((value) => value.toFixed(5)).join(":");
        if (!unique.has(key)) unique.set(key, { ...tower, point });
      });
    });
    return [...unique.values()];
  }, [results, centerPoint]);

  const coverageFeatures = useMemo(() => {
    if (!showCoverage) return [];
    return towers.map((tower) => ({
      tower,
      feature: searchRing(tower.point, 0.25),
    }));
  }, [showCoverage, towers]);

  if (!centerPoint) {
    return <div className="flex min-h-[600px] items-center justify-center bg-[#0a0e17] text-amber-400">Map unavailable: invalid search coordinates.</div>;
  }

  return (
    <div className="relative h-full min-h-[600px] w-full bg-[#0a0e17]">
      <MapContainer center={toLeafletPosition(centerPoint.geometry.coordinates)} zoom={14} className="h-full min-h-[600px] w-full" preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {ring && <GeoJSON data={ring} style={{ color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.05, weight: 2, dashArray: "8 5" }} />}
        {coverageFeatures.map(({ tower, feature }) => feature && (
          <GeoJSON
            key={tower.id || `${tower.lon}:${tower.lat}`}
            data={feature}
            style={{ color: "#ef4444", fillColor: "#ef4444", opacity: 0.4, fillOpacity: 0.12, weight: 1 }}
          />
        ))}
        {showCoverage && towers.map((tower) => (
          <Marker key={tower.id || `tower:${tower.lon}:${tower.lat}`} position={toLeafletPosition(tower.point.geometry.coordinates)} icon={towerIcon}>
            <Popup>
              <strong>Competitor Tower</strong><br />
              {tower.operator || "Unknown operator"}<br />
              {distanceMiles(centerPoint, tower.point)?.toFixed(2)} mi from search center
            </Popup>
          </Marker>
        ))}
        {records.map((record, index) => record.point && (
          <Marker
            key={record.candidate.id || record.candidate.parcel_id || `candidate:${index}`}
            position={toLeafletPosition(record.point.geometry.coordinates)}
            icon={numberedIcon(index + 1, record.candidate.match_score, index === selectedIndex)}
            eventHandlers={{ click: () => onPinClick(index) }}
          >
            <Popup>
              <div className="min-w-[220px]">
                <strong>{record.candidate.site_name || `Site ${index + 1}`}</strong><br />
                {record.candidate.parcel_address || "No parcel address"}<br />
                Owner: {record.candidate.owner_name || "Unknown"}<br />
                Distance: {record.distance_miles?.toFixed(2)} mi<br />
                <strong style={{ color: record.within_one_mile ? "#16a34a" : "#dc2626" }}>
                  {record.within_one_mile ? "Within 1-mile boundary" : "Outside 1-mile boundary"}
                </strong>
              </div>
            </Popup>
          </Marker>
        ))}
        <MapController
          features={[ring, centerPoint, ...records.map((record) => record.point)]}
          selectedCandidate={selectedIndex == null ? null : results[selectedIndex]}
          flyToRef={flyToRef}
        />
      </MapContainer>
      <button
        type="button"
        onClick={() => setShowCoverage((value) => !value)}
        className="absolute right-4 top-4 z-[500] rounded-lg border border-cyan-400/40 bg-slate-950/90 px-3 py-2 text-sm font-bold text-cyan-300 shadow-lg"
      >
        Competitor Coverage {showCoverage ? "On" : "Off"}
      </button>
      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-200 shadow-lg">
        1-mile / 5,280-ft candidate decision boundary
      </div>
    </div>
  );
}
