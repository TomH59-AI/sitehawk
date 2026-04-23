import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = "pk.eyJ1IjoidGhvZGdlcyIsImEiOiJjbWlxZzBmbmQwMTA4M2txNGY5OXhyOWppIn0.sjlKabo3VGDU-hKE2Br3bQ";
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";
const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";
const RADIUS_MILES = 0.5;
const RADIUS_METERS = RADIUS_MILES * 1609.344;

function getScoreColor(score) {
  if (score >= 70) return "#16A34A";
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function getScoreLabel(score) {
  if (score >= 70) return "Excellent";
  if (score >= 40) return "Good";
  return "Fair";
}

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

// Create hawk center marker element
function createHawkMarkerEl() {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:default;user-select:none;";
  el.innerHTML = `
    <div style="
      width:52px;height:52px;border-radius:50%;
      background:linear-gradient(135deg,#1e3a5f,#2563EB);
      border:3px solid white;
      box-shadow:0 4px 16px rgba(37,99,235,0.6),0 0 0 4px rgba(37,99,235,0.2);
      display:flex;align-items:center;justify-content:center;
      font-size:26px;line-height:1;
      animation:hawkPulse 2.5s ease-in-out infinite;
    ">🦅</div>
    <div style="
      margin-top:5px;
      background:rgba(0,0,0,0.85);
      color:white;font-size:10px;font-weight:700;
      padding:2px 8px;border-radius:999px;
      letter-spacing:0.08em;white-space:nowrap;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    ">SARF CENTER</div>
  `;
  // Inject animation keyframe once
  if (!document.getElementById("hawk-pulse-style")) {
    const style = document.createElement("style");
    style.id = "hawk-pulse-style";
    style.textContent = `@keyframes hawkPulse { 0%,100%{box-shadow:0 4px 16px rgba(37,99,235,0.6),0 0 0 4px rgba(37,99,235,0.2)} 50%{box-shadow:0 4px 24px rgba(37,99,235,0.9),0 0 0 8px rgba(37,99,235,0.15)} }`;
    document.head.appendChild(style);
  }
  return el;
}

// Create eyeglasses/binoculars candidate marker
function createCandidateMarkerEl(num, score) {
  const color = getScoreColor(score);
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;";
  el.innerHTML = `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;">
      <div style="
        background:${color};border:2.5px solid white;
        border-radius:12px;
        padding:5px 9px;
        box-shadow:0 3px 10px rgba(0,0,0,0.45);
        display:flex;align-items:center;gap:5px;
        font-family:'Space Grotesk',sans-serif;
      ">
        <span style="font-size:18px;line-height:1;">🔭</span>
        <span style="color:white;font-size:13px;font-weight:800;line-height:1;">${num}</span>
      </div>
      <div style="
        position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-top:6px solid ${color};
      "></div>
    </div>
  `;
  return el;
}

export default function MapboxSatelliteMap({ centerLat, centerLon, results, loading, mapImageGetterRef, filteredResultIds }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState("satellite");
  const [mapboxReady, setMapboxReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tooltip, setTooltip] = useState(null); // { x, y, candidate, idx }

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

  // Initialize map
  useEffect(() => {
    if (!mapboxReady || !centerLat || !centerLon || mapRef.current) return;
    const mapboxgl = window.mapboxgl;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    // Disable telemetry so Mapbox never prompts users for data-sharing permission
    mapboxgl.config.EVENTS_URL = "";
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: SATELLITE_STYLE,
      center: [centerLon, centerLat],
      zoom: 13,
      preserveDrawingBuffer: true,
      trackResize: true,
      collectResourceTiming: false,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.on("load", () => setMapLoaded(true));
    mapRef.current = map;
    if (mapImageGetterRef) {
      mapImageGetterRef.current = () => mapRef.current?.getCanvas().toDataURL("image/png");
    }
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [mapboxReady, centerLat, centerLon]);

  // Add/update layers and markers
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

    // Search ring
    const circleGeo = createGeoJSONCircle(center, RADIUS_METERS);
    map.addSource("search-ring", { type: "geojson", data: circleGeo });
    map.addLayer({ id: "search-ring-fill", type: "fill", source: "search-ring", paint: { "fill-color": "#2563EB", "fill-opacity": 0.08 } });
    map.addLayer({ id: "search-ring-outline", type: "line", source: "search-ring", paint: { "line-color": "#2563EB", "line-width": 2.5, "line-dasharray": [4, 2] } });

    // Hawk center marker
    const hawkEl = createHawkMarkerEl();
    const hawkMarker = new mapboxgl.Marker({ element: hawkEl, anchor: "bottom" })
      .setLngLat(center)
      .addTo(map);
    markersRef.current.push(hawkMarker);

    // Candidate markers
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend(center);

    results.forEach((r, idx) => {
      const score = r.match_score || 0;
      const isFiltered = filteredResultIds && !filteredResultIds.has(r.id);
      const color = isFiltered ? "#6B7280" : getScoreColor(score);
      const num = idx + 1;
      const el = createCandidateMarkerEl(num, isFiltered ? -1 : score);
      if (isFiltered) {
        el.style.opacity = "0.35";
        el.style.filter = "grayscale(0.8)";
      }

      // Popup content (click)
      const popupContent = `
        <div style="font-family:sans-serif;min-width:220px;padding:2px 4px;">
          <div style="font-weight:800;font-size:14px;margin-bottom:8px;color:#0f172a;border-bottom:2px solid ${color};padding-bottom:6px;">
            🔭 Candidate ${num} — ${r.site_name || "Unnamed"}
          </div>
          <div style="background:#fefce8;border:1px solid #fbbf24;border-radius:6px;padding:5px 8px;margin-bottom:8px;">
            <span style="font-size:10px;color:#92400e;font-weight:700;">PARCEL ID: </span>
            <span style="font-size:12px;font-family:monospace;font-weight:800;color:#1e293b;">${r.parcel_id || "—"}</span>
          </div>
          <table style="width:100%;font-size:12px;color:#334155;border-collapse:collapse;">
            <tr><td style="padding:2px 0;color:#64748b;">Owner</td><td style="padding:2px 0;font-weight:600;">${r.owner_name || "—"}</td></tr>
            <tr><td style="padding:2px 0;color:#64748b;">Zoning</td><td style="padding:2px 0;font-weight:600;">${r.zoning_classification || "—"}</td></tr>
            <tr><td style="padding:2px 0;color:#64748b;">Size</td><td style="padding:2px 0;font-weight:600;">${r.parcel_size_acres ? r.parcel_size_acres + " acres" : "—"}</td></tr>
            <tr><td style="padding:2px 0;color:#64748b;">FEMA Risk</td><td style="padding:2px 0;font-weight:600;">${r.fema_risk_factor || "—"}</td></tr>
          </table>
          <div style="margin-top:8px;background:#f1f5f9;border-radius:6px;padding:6px 8px;">
            <div style="font-size:11px;color:#64748b;margin-bottom:4px;">Match Score</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
                <div style="width:${score}%;height:100%;background:${color};border-radius:3px;"></div>
              </div>
              <span style="font-weight:800;color:${color};font-size:13px;">${score}%</span>
            </div>
          </div>
          <button onclick="document.getElementById('candidate-card-${idx}')?.scrollIntoView({behavior:'smooth',block:'center'})"
            style="margin-top:10px;background:${color};color:white;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;width:100%;letter-spacing:0.02em;">
            📋 Scroll to Details
          </button>
        </div>`;

      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([r.longitude, r.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 20, maxWidth: "260px" }).setHTML(popupContent))
        .addTo(map);

      // Hover: show tooltip via React state (positioned on map container)
      el.addEventListener("mouseenter", (e) => {
        const rect = mapContainer.current?.getBoundingClientRect();
        const point = map.project([r.longitude, r.latitude]);
        setTooltip({ x: point.x, y: point.y, candidate: r, idx, score, color });
      });
      el.addEventListener("mouseleave", () => setTooltip(null));

      // Click: open popup
      el.addEventListener("click", () => {
        marker.getPopup().isOpen() ? marker.getPopup().remove() : marker.togglePopup();
      });

      markersRef.current.push(marker);
      bounds.extend([r.longitude, r.latitude]);
    });

    map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
  }, [mapLoaded, results, centerLat, centerLon]);

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

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl border border-border overflow-hidden" style={{ height: 500 }}>
        {/* Loading overlay */}
        {(loading || !centerLat) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-card">
            <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
            <p className="font-heading font-semibold text-foreground">
              {loading ? "Scanning parcels..." : "Awaiting coordinates..."}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Map renders after scan completes</p>
          </div>
        )}

        {/* Map */}
        <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

        {/* Hover Tooltip */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x + 16,
              top: tooltip.y - 120,
              zIndex: 50,
              pointerEvents: "none",
              animation: "fadeInTooltip 0.15s ease-out forwards",
            }}
            className="bg-card border border-border rounded-xl shadow-2xl p-3 min-w-[210px]"
          >
            <style>{`@keyframes fadeInTooltip { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>
            <div className="font-heading font-bold text-sm text-foreground border-b border-border pb-2 mb-2">
              🔭 Candidate {tooltip.idx + 1} — {tooltip.candidate.site_name || "Unnamed"}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {tooltip.candidate.parcel_id && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 mb-1">
                  <span className="text-[10px] text-amber-600 font-bold">PARCEL ID:</span>
                  <span className="font-mono font-bold text-foreground text-xs">{tooltip.candidate.parcel_id}</span>
                </div>
              )}
              <div><span className="text-foreground/60">Owner: </span><span className="font-medium text-foreground">{tooltip.candidate.owner_name || "—"}</span></div>
              <div><span className="text-foreground/60">Zoning: </span>
                <span className={`font-semibold ${tooltip.candidate.zoning_classification ? "text-primary" : "text-foreground"}`}>
                  {tooltip.candidate.zoning_classification || "—"}
                </span>
              </div>
              <div><span className="text-foreground/60">Size: </span><span className="font-medium text-foreground">{tooltip.candidate.parcel_size_acres ? `${tooltip.candidate.parcel_size_acres} acres` : "—"}</span></div>
            </div>
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div style={{ width: `${tooltip.score}%`, background: tooltip.color }} className="h-full rounded-full" />
                </div>
                <span style={{ color: tooltip.color }} className="text-xs font-bold">{tooltip.score}%</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">Click for full details</p>
          </div>
        )}

        {/* Style toggle */}
        {centerLat && !loading && (
          <div className="absolute top-3 left-3 z-10 flex rounded-lg overflow-hidden border border-border shadow text-xs font-semibold">
            <button
              onClick={() => mapStyle !== "satellite" && toggleStyle()}
              className={`px-3 py-1.5 transition-all ${
                mapStyle === "satellite"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card/90 backdrop-blur text-muted-foreground hover:bg-card"
              }`}
            >
              🛰 Satellite
            </button>
            <button
              onClick={() => mapStyle !== "streets" && toggleStyle()}
              className={`px-3 py-1.5 transition-all ${
                mapStyle === "streets"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card/90 backdrop-blur text-muted-foreground hover:bg-card"
              }`}
            >
              🗺 Streets
            </button>
          </div>
        )}

        {/* Legend */}
        {results.length > 0 && (
          <div className="absolute bottom-3 left-3 z-10 bg-card/92 backdrop-blur border border-border rounded-xl p-3 text-xs shadow-lg space-y-1.5">
            <div className="font-heading font-semibold text-foreground text-[10px] uppercase tracking-wider mb-2">Legend</div>
            <div className="flex items-center gap-2"><span className="text-base">🦅</span><span className="text-foreground/80">SARF Center</span></div>
            <div className="flex items-center gap-2"><span className="text-base">🔭</span><span style={{ color: "#16A34A" }} className="font-semibold">Green</span><span className="text-foreground/60">Score 70+</span></div>
            <div className="flex items-center gap-2"><span className="text-base">🔭</span><span style={{ color: "#D97706" }} className="font-semibold">Amber</span><span className="text-foreground/60">Score 40–69</span></div>
            <div className="flex items-center gap-2"><span className="text-base">🔭</span><span style={{ color: "#DC2626" }} className="font-semibold">Red</span><span className="text-foreground/60">Score &lt;40</span></div>
            <div className="flex items-center gap-2">
              <div style={{ width: 18, height: 3, background: "#2563EB", borderRadius: 2 }} />
              <span className="text-foreground/60">0.5-mi Ring</span>
            </div>
          </div>
        )}
      </div>

      {/* Export */}
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