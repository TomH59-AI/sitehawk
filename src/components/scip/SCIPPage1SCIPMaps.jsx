/**
 * SCIPPage1SCIPMaps — Page 1 thematic maps block.
 *
 * Nine rows, each a high-resolution Mapbox Static render of the parcel:
 *   1. Aerial         — clean satellite
 *   2. Topography     — USGS contours overlay
 *   3. Floodplain Map — FEMA NFHL overlay
 *   4. Zoning Map     — street base + zoning label
 *   5. FLU Map        — outdoors base + FLU label
 *   6. Wetlands Map   — USFWS NWI overlay
 *   7. Parcel Map     — satellite + parcel pin
 *   8. Wind Speed Map — outdoors base + ASCE 7-22 wind value
 *   9. Airport Map    — auto-zoomed view of SARF center + nearest airport with
 *                      IATA call letters, name, coordinates, and distance line
 *
 * All overlay URL builders match the proven implementation in SCIPThematicMaps
 * (URL-safe ring GeoJSON, correct bbox math, FEMA/NWI/USGS layer ids).
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { nearestAirport } from "@/functions/nearestAirport";

const IMG_W = 1280;
const IMG_H = 800;
const ZOOM = 14.0;

// ── Geometry helpers (URL-budget-safe per Mapbox 8192-char limit) ──
function buildCircle(lat, lon, radiusMiles, points = 36) {
  const coords = [];
  const radiusM = radiusMiles * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([+(lon + dx * Math.cos(theta)).toFixed(5), +(lat + dy * Math.sin(theta)).toFixed(5)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function buildRingsGeoJSON(lat, lon) {
  return encodeURIComponent(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { stroke: "#DC2626", "stroke-width": 3, "stroke-opacity": 1, "fill-opacity": 0 },
          geometry: buildCircle(lat, lon, 1.0),
        },
        {
          type: "Feature",
          properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 1, "fill-opacity": 0 },
          geometry: buildCircle(lat, lon, 0.5),
        },
      ],
    })
  );
}

function bboxFromCenter(lat, lon, zoom, widthPx, heightPx) {
  const worldSize = 512 * Math.pow(2, zoom);
  const lonPerPx = 360 / worldSize;
  const halfLonSpan = (widthPx / 2) * lonPerPx;
  const west = lon - halfLonSpan;
  const east = lon + halfLonSpan;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const yCenter = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  const yTop = yCenter - heightPx / 2;
  const yBottom = yCenter + heightPx / 2;
  const tile2lat = (y) => {
    const n = Math.PI - (2 * Math.PI * y) / worldSize;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  return { west, south: tile2lat(yBottom), east, north: tile2lat(yTop) };
}

function buildMapboxBase(token, lat, lon, style, extraPins = "") {
  const geo = buildRingsGeoJSON(lat, lon);
  const waypoint = `pin-l-circle+2563EB(${lon},${lat})`;
  const overlays = [`geojson(${geo})`, waypoint, extraPins].filter(Boolean).join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlays}/` +
    `${lon},${lat},${ZOOM},0,0/${IMG_W}x${IMG_H}@2x?access_token=${token}`
  );
}

function femaWmsUrl(lat, lon) {
  const bb = bboxFromCenter(lat, lon, ZOOM, IMG_W, IMG_H);
  return (
    `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export` +
    `?bbox=${bb.west},${bb.south},${bb.east},${bb.north}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_W},${IMG_H}` +
    `&dpi=96&format=png32&transparent=true&f=image`
  );
}
function nwiWmsUrl(lat, lon) {
  const bb = bboxFromCenter(lat, lon, ZOOM, IMG_W, IMG_H);
  return (
    `https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export` +
    `?bbox=${bb.west},${bb.south},${bb.east},${bb.north}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_W},${IMG_H}` +
    `&dpi=96&format=png32&transparent=true&f=image&layers=show:0`
  );
}
function usgsTopoUrl(lat, lon) {
  const bb = bboxFromCenter(lat, lon, ZOOM, IMG_W, IMG_H);
  return (
    `https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export` +
    `?bbox=${bb.west},${bb.south},${bb.east},${bb.north}` +
    `&bboxSR=4326&imageSR=4326&size=${IMG_W},${IMG_H}` +
    `&dpi=96&format=png32&transparent=true&f=image`
  );
}

// ── Airport map — wide auto-zoom showing SARF center + nearest airport + line ──
function buildAirportMapUrl(token, siteLat, siteLon, airport) {
  if (!airport?.lat || !airport?.lon) return null;
  const line = encodeURIComponent(
    JSON.stringify({
      type: "Feature",
      properties: { stroke: "#FFFFFF", "stroke-width": 3, "stroke-opacity": 0.9 },
      geometry: { type: "LineString", coordinates: [[siteLon, siteLat], [airport.lon, airport.lat]] },
    })
  );
  const sitePin = `pin-l-communications-tower+EF4444(${siteLon},${siteLat})`;
  const airportPin = `pin-l-airport+0EA5E9(${airport.lon},${airport.lat})`;
  const overlays = [`geojson(${line})`, sitePin, airportPin].join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${overlays}/` +
    `auto/${IMG_W}x${IMG_H}@2x?padding=80&access_token=${token}`
  );
}

function MapRow({ label, base, overlay, overlayOpacity = 0.55, overlayLabel, footnote, children }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm font-semibold text-foreground bg-muted/40 border-r border-border flex items-center">
        {label}
      </div>
      <div className="bg-card p-2">
        <div className="relative rounded overflow-hidden border border-border" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
          {base ? (
            <>
              <img src={base} alt={label} crossOrigin="anonymous" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
              {overlay && (
                <img
                  src={overlay}
                  alt={`${label} overlay`}
                  crossOrigin="anonymous"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ objectFit: "cover", opacity: overlayOpacity }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
              {overlayLabel && (
                <div className="absolute top-2 right-2 text-[10px] font-mono font-bold tracking-wider px-2 py-1 rounded bg-cyan-500/90 text-[#0a0e17]">
                  {overlayLabel}
                </div>
              )}
              {children}
            </>
          ) : (
            <div className="w-full h-full bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">
              Enter Latitude / Longitude to generate map
            </div>
          )}
        </div>
        {footnote && <div className="text-[10px] font-mono text-muted-foreground mt-1">{footnote}</div>}
      </div>
    </div>
  );
}

// Airport call-letter / name / coords label overlay
function AirportLabel({ airport }) {
  if (!airport) return null;
  return (
    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 pointer-events-none">
      <div className="bg-[#0C1B2E]/90 backdrop-blur-sm rounded-lg border-2 border-cyan-400 px-3 py-2 max-w-[60%]">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black tracking-widest text-cyan-400 font-mono">
            {airport.iata || airport.icao || "—"}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
            {airport.icao && airport.iata && airport.icao !== airport.iata ? airport.icao : ""}
          </span>
        </div>
        <div className="text-xs text-white font-semibold leading-tight">{airport.name || "Unknown airport"}</div>
        <div className="text-[10px] font-mono text-slate-300 mt-0.5">
          {airport.city && airport.state ? `${airport.city}, ${airport.state}` : ""}
        </div>
        <div className="text-[10px] font-mono text-slate-300">
          {airport.lat?.toFixed(5)}, {airport.lon?.toFixed(5)}
        </div>
      </div>
      <div className="bg-red-600 text-white text-xs font-bold font-mono px-3 py-2 rounded-lg shadow-lg">
        {airport.distance_miles?.toFixed(2)} mi
      </div>
    </div>
  );
}

export default function SCIPPage1SCIPMaps({ page1Values, siteOwner }) {
  const [token, setToken] = useState("");
  const [airport, setAirport] = useState(null);
  const [airportLoading, setAirportLoading] = useState(false);

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const lat = parseFloat(siteOwner?.site?.latitude || page1Values?.latitude);
  const lon = parseFloat(siteOwner?.site?.longitude || page1Values?.longitude);
  const ready = isFinite(lat) && isFinite(lon) && token;

  // Fetch nearest airport whenever coordinates change
  useEffect(() => {
    if (!isFinite(lat) || !isFinite(lon)) {
      setAirport(null);
      return;
    }
    let cancelled = false;
    setAirportLoading(true);
    nearestAirport({ lat, lon, radius_miles: 50 })
      .then((res) => {
        if (cancelled) return;
        const data = res?.data || res;
        setAirport(data && data.lat ? data : null);
      })
      .catch(() => !cancelled && setAirport(null))
      .finally(() => !cancelled && setAirportLoading(false));
    return () => { cancelled = true; };
  }, [lat, lon]);

  const targetPin = ready ? `pin-l-communications-tower+EF4444(${lon},${lat})` : "";

  const maps = useMemo(() => {
    if (!ready) return [];
    return [
      { key: "aerial", label: "Aerial", base: buildMapboxBase(token, lat, lon, "satellite-streets-v12", targetPin), footnote: "Mapbox Satellite-Streets · 0.5/1.0 mi search rings" },
      { key: "topo", label: "Topography", base: buildMapboxBase(token, lat, lon, "satellite-streets-v12", targetPin), overlay: usgsTopoUrl(lat, lon), overlayOpacity: 0.55, overlayLabel: "USGS Topo", footnote: "USGS National Map contours" },
      { key: "flood", label: "Floodplain Map", base: buildMapboxBase(token, lat, lon, "satellite-streets-v12", targetPin), overlay: femaWmsUrl(lat, lon), overlayOpacity: 0.6, overlayLabel: "FEMA NFHL", footnote: "FEMA National Flood Hazard Layer" },
      { key: "zoning", label: "Zoning Map", base: buildMapboxBase(token, lat, lon, "streets-v12", targetPin), overlayLabel: siteOwner?.site?.zoning_classification ? `Zone: ${siteOwner.site.zoning_classification}` : page1Values?._siteOwner?.zoning_district || null, footnote: "Zoning classification per Notion master zoning DB" },
      { key: "flu", label: "FLU Map", base: buildMapboxBase(token, lat, lon, "outdoors-v12", targetPin), overlayLabel: "Future Land Use", footnote: "Future Land Use — jurisdiction layer" },
      { key: "wetlands", label: "Wetlands Map", base: buildMapboxBase(token, lat, lon, "satellite-streets-v12", targetPin), overlay: nwiWmsUrl(lat, lon), overlayOpacity: 0.7, overlayLabel: "USFWS NWI", footnote: "USFWS National Wetlands Inventory" },
      { key: "parcel", label: "Parcel Map", base: buildMapboxBase(token, lat, lon, "satellite-streets-v12", targetPin), overlayLabel: siteOwner?.site?.parcel_id ? `Parcel ${siteOwner.site.parcel_id}` : null, footnote: "Target parcel highlighted" },
      { key: "wind", label: "Wind Speed Map", base: buildMapboxBase(token, lat, lon, "outdoors-v12", targetPin), overlayLabel: siteOwner?.site?.wind_speed_mph != null ? `${siteOwner.site.wind_speed_mph} mph` : "Wind Speed (ASCE 7-22)", footnote: "ASCE 7-22 design wind speed (3-sec gust, Risk Cat. II)" },
    ];
  }, [ready, token, lat, lon, targetPin, siteOwner, page1Values]);

  const airportMapUrl = ready && airport ? buildAirportMapUrl(token, lat, lon, airport) : null;

  return (
    <>
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
        SCIP Maps
      </div>

      {maps.map((m) => (
        <MapRow
          key={m.key}
          label={m.label}
          base={m.base}
          overlay={m.overlay}
          overlayOpacity={m.overlayOpacity}
          overlayLabel={m.overlayLabel}
          footnote={m.footnote}
        />
      ))}

      {/* Airport Map — auto-bbox view of SARF center + nearest airport with label */}
      <MapRow
        label="Airport Map"
        base={airportMapUrl}
        footnote={
          airportLoading
            ? "Loading nearest FAA public airport…"
            : airport
              ? `FAA Digital-NASR · ${airport.distance_miles?.toFixed(2)} mi from SARF center`
              : ready
                ? "No public airport found within 50 mi"
                : null
        }
      >
        {airport && <AirportLabel airport={airport} />}
        {airportLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0C1B2E]/60">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        )}
      </MapRow>
    </>
  );
}