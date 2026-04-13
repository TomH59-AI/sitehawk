import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ";
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";
const RADIUS_MILES = 0.5;
const RADIUS_METERS = RADIUS_MILES * 1609.344;

function getScoreColor(score) {
  if (score >= 70) return "#1D9E75";
  if (score >= 40) return "#EF9F27";
  return "#E24B4A";
}

// Generate a GeoJSON circle polygon
function createGeoJSONCircle(center, radiusMeters, points = 64) {
  const coords = [];
  const distanceX = radiusMeters / (111320 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusMeters / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([center[0] + distanceX * Math.cos(theta), center[1] + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } };
}

export default function MapboxSatelliteMap({ centerLat, centerLon, results, loading }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState("satellite");
  const [mapboxReady, setMapboxReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load MapBox GL JS from CDN
  useEffect(() => {
    if (window.mapboxgl) { setMapboxReady(true); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js";
    script.onload = () => setMapboxReady(true);
    document.head.appendChild(script);
  }, []);

  // Initialize map once mapbox is ready and we have a center
  useEffect(() => {
    if (!mapboxReady || !centerLat || !centerLon || mapRef.current) return;
    const mapboxgl = window.mapboxgl;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: SATELLITE_STYLE,
      center: [centerLon, centerLat],
      zoom: 13,
      preserveDrawingBuffer: true,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.on("load", () => setMapLoaded(true));
    mapRef.current = map;
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [mapboxReady, centerLat, centerLon]);

  // Add/update layers once map is loaded and results are ready
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || results.length === 0) return;
    const map = mapRef.current;
    const mapboxgl = window.mapboxgl;

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Remove existing layers/sources
    ["search-ring-fill", "search-ring-outline"].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource("search-ring")) map.removeSource("search-ring");

    const center = [centerLon, centerLat];

    // Layer 1 - Search ring
    const circleGeo = createGeoJSONCircle(center, RADIUS_METERS);
    map.addSource("search-ring", { type: "geojson", data: circleGeo });
    map.addLayer({ id: "search-ring-fill", type: "fill", source: "search-ring", paint: { "fill-color": "#2563EB", "fill-opacity": 0.1 } });
    map.addLayer({ id: "search-ring-outline", type: "line", source: "search-ring", paint: { "line-color": "#2563EB", "line-width": 3 } });

    // Layer 2 - Center pin (red crosshair)
    const centerEl = document.createElement("div");
    centerEl.innerHTML = `<div style="
      width:32px;height:32px;border-radius:50%;
      background:#DC2626;border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:16px;font-weight:bold;cursor:default;
    ">✕</div>`;
    const centerMarker = new mapboxgl.Marker({ element: centerEl })
      .setLngLat(center)
      .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(`<div style="font-family:sans-serif;font-size:12px;font-weight:700;color:#DC2626;">SARF CENTER</div>`))
      .addTo(map);
    markersRef.current.push(centerMarker);

    // Layer 3 - Candidate pins
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(center);

    results.forEach((r, idx) => {
      const score = r.match_score || 0;
      const color = getScoreColor(score);
      const num = idx + 1;
      const el = document.createElement("div");
      el.innerHTML = `<div style="
        width:34px;height:34px;border-radius:50%;
        background:${color};border:3px solid white;
        box-shadow:0 2px 10px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:14px;font-weight:800;
        cursor:pointer;font-family:'Space Grotesk',sans-serif;
      ">${num}</div>`;

      const popupContent = `
        <div style="font-family:sans-serif;min-width:200px;padding:4px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:#1e293b;">Candidate ${num}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:2px;"><b>Site:</b> ${r.site_name || "—"}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:2px;"><b>Owner:</b> ${r.owner_name || "—"}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:2px;"><b>Zoning:</b> ${r.zoning_classification || "—"}</div>
          <div style="font-size:12px;color:#475569;margin-bottom:2px;"><b>Acres:</b> ${r.parcel_size_acres || "—"}</div>
          <div style="font-size:12px;margin-bottom:8px;"><b>Match Score:</b> <span style="color:${color};font-weight:700;">${score}%</span></div>
          <button onclick="document.getElementById('candidate-card-${idx}')?.scrollIntoView({behavior:'smooth',block:'center'})"
            style="background:${color};color:white;border:none;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;width:100%;">
            View Details ↓
          </button>
        </div>`;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([r.longitude, r.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(popupContent))
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([r.longitude, r.latitude]);
    });

    // Fit map to bounds
    map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
  }, [mapLoaded, results, centerLat, centerLon]);

  // Style toggle
  const toggleStyle = () => {
    if (!mapRef.current) return;
    const next = mapStyle === "satellite" ? "streets" : "satellite";
    setMapStyle(next);
    setMapLoaded(false);
    mapRef.current.setStyle(next === "satellite" ? SATELLITE_STYLE : STREETS_STYLE);
    mapRef.current.once("style.load", () => setMapLoaded(true));
  };

  const handleExport = () => {
    if (!mapRef.current) return;
    setExporting(true);
    const canvas = mapRef.current.getCanvas();
    const link = document.createElement("a");
    link.download = "sitehawk-map.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    setExporting(false);
  };

  const showSkeleton = loading || (!mapRef.current && !mapboxReady);

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border border-border overflow-hidden" style={{ height: 500 }}>
        {/* Loading skeleton */}
        {(loading || !centerLat) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="font-heading font-semibold text-foreground">
              {loading ? "Scanning parcels..." : "Awaiting coordinates..."}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Map renders after scan completes</p>
          </div>
        )}

        {/* Map container */}
        <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

        {/* Style toggle */}
        {centerLat && !loading && (
          <button
            onClick={toggleStyle}
            className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-lg bg-card/90 backdrop-blur border border-border text-xs font-semibold text-foreground shadow hover:bg-card transition-all"
          >
            {mapStyle === "satellite" ? "🗺 Streets" : "🛰 Satellite"}
          </button>
        )}

        {/* Legend */}
        {results.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 bg-card/90 backdrop-blur border border-border rounded-lg p-2.5 text-xs shadow space-y-1.5">
            <div className="font-semibold text-foreground text-[10px] uppercase tracking-wider mb-1">Legend</div>
            {[
              { color: "#1D9E75", label: "Score 70+ (Excellent)" },
              { color: "#EF9F27", label: "Score 40–69 (Good)" },
              { color: "#E24B4A", label: "Score <40 (Fair)" },
              { color: "#2563EB", label: "0.5-mi Search Ring", shape: "line" },
              { color: "#DC2626", label: "SARF Center", shape: "x" },
            ].map(({ color, label, shape }) => (
              <div key={label} className="flex items-center gap-2">
                {shape === "line" ? (
                  <div style={{ width: 16, height: 3, background: color, borderRadius: 2 }} />
                ) : shape === "x" ? (
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 9, fontWeight: 700 }}>✕</div>
                ) : (
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: color, border: "2px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                )}
                <span className="text-foreground/80">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export button */}
      {results.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-secondary transition-all disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "📥 Export Map"}
          </button>
        </div>
      )}
    </div>
  );
}