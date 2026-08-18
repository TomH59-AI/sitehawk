import { useEffect, useMemo } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import {
  PRIMARY_SEARCH_RADIUS_MILES,
  TALONFIT_SEARCH_RADIUS_MILES,
  candidateSpatialRecord,
  featureBounds,
  pointFeature,
  searchRing,
  toLeafletPosition,
} from "@/lib/spatial";

const RING_STYLE = {
  primary: { color: "#EAB308", fillColor: "#EAB308", fillOpacity: 0.1, weight: 2.5, dashArray: "8 5" },
  talonfit: { color: "#DC2626", fillColor: "#DC2626", fillOpacity: 0.05, weight: 2.5, dashArray: "8 5" },
};

function candidateIcon(rank, eligible) {
  const color = eligible ? "#00d4ff" : "#f59e0b";
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#0a0e17;border:3px solid ${color};display:flex;align-items:center;justify-content:center;color:${color};font:700 13px monospace;box-shadow:0 0 12px ${color}88">${rank}</div>`,
  });
}

const centerIcon = L.divIcon({
  className: "",
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: '<div style="width:44px;height:44px;border-radius:50%;background:#1e3a5f;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 0 16px #2563ebaa">🦅</div>',
});

function FitToGeoJSON({ features }) {
  const map = useMap();
  const bounds = useMemo(() => featureBounds(features), [features]);

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]], {
      padding: [48, 48],
      maxZoom: 15,
      animate: true,
    });
  }, [bounds, map]);

  return null;
}

export default function HeadlineSatelliteMap({ results = [], searchCenter, onCandidateClick }) {
  const centerPoint = useMemo(
    () => pointFeature(searchCenter?.lon, searchCenter?.lat, { role: "search-center" }),
    [searchCenter?.lon, searchCenter?.lat],
  );
  const primaryRing = useMemo(
    () => searchRing(centerPoint, PRIMARY_SEARCH_RADIUS_MILES),
    [centerPoint],
  );
  const talonfitRing = useMemo(
    () => searchRing(centerPoint, TALONFIT_SEARCH_RADIUS_MILES),
    [centerPoint],
  );
  const records = useMemo(
    () => results
      .map((candidate) => candidateSpatialRecord(candidate, centerPoint, talonfitRing))
      .filter((record) => record.point)
      .sort((a, b) => (b.candidate.match_score ?? 0) - (a.candidate.match_score ?? 0)),
    [results, centerPoint, talonfitRing],
  );

  if (!centerPoint) {
    return <div className="flex h-[500px] items-center justify-center bg-[#0a0e17] text-amber-400">Map unavailable: invalid search coordinates.</div>;
  }

  return (
    <div className="relative h-[500px] min-h-[500px] w-full bg-[#0a0e17]">
      <MapContainer center={toLeafletPosition(centerPoint.geometry.coordinates)} zoom={14} className="h-full w-full" preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {talonfitRing && <GeoJSON key={JSON.stringify(talonfitRing.geometry.coordinates[0][0])} data={talonfitRing} style={RING_STYLE.talonfit} />}
        {primaryRing && <GeoJSON key={JSON.stringify(primaryRing.geometry.coordinates[0][0])} data={primaryRing} style={RING_STYLE.primary} />}
        <Marker position={toLeafletPosition(centerPoint.geometry.coordinates)} icon={centerIcon}>
          <Popup>SARF center<br />{searchCenter.lat.toFixed(6)}, {searchCenter.lon.toFixed(6)}</Popup>
        </Marker>
        {records.map((record, sortedIndex) => {
          const candidate = record.candidate;
          const originalIndex = results.indexOf(candidate);
          return (
            <Marker
              key={candidate.id || candidate.parcel_id || `${candidate.longitude}:${candidate.latitude}`}
              position={toLeafletPosition(record.point.geometry.coordinates)}
              icon={candidateIcon(sortedIndex + 1, record.within_one_mile)}
              eventHandlers={{ click: () => onCandidateClick?.(originalIndex) }}
            >
              <Popup>
                <div className="min-w-[210px]">
                  <strong>{candidate.site_name || `Site ${sortedIndex + 1}`}</strong><br />
                  {candidate.owner_name || "Unknown owner"}<br />
                  {record.distance_miles?.toFixed(2)} mi from center<br />
                  <span style={{ color: record.within_one_mile ? "#16a34a" : "#dc2626", fontWeight: 700 }}>
                    {record.within_one_mile ? "Inside 1-mile search ring" : "Outside 1-mile search ring"}
                  </span>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <FitToGeoJSON features={[talonfitRing, primaryRing, centerPoint, ...records.map((record) => record.point)]} />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-[#1e293b] bg-[#0a0e17]/90 px-3 py-2 text-[11px] text-slate-200 shadow-lg">
        <div><span className="text-yellow-400">━━</span> 0.5-mile primary ring</div>
        <div><span className="text-red-500">━━</span> 1-mile / 5,280-ft TALONFIT limit</div>
      </div>
    </div>
  );
}
