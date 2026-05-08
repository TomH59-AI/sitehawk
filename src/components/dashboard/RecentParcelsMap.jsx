import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";

const MAPBOX_TOKEN = "pk.eyJ1IjoidGFncmlmZmluIiwiYSI6ImNtZjV5MjQzaTBpNGoybHBxNjY1OG44N2sifQ.kEjuM-aJV0rRj4-wAlEZTw";

function getScoreColor(score) {
  if (score >= 80) return "#10b981"; // emerald
  if (score >= 60) return "#3b82f6"; // blue
  if (score >= 40) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

async function loadMapbox() {
  if (window.mapboxgl) return window.mapboxgl;
  await new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
  return window.mapboxgl;
}

export default function RecentParcelsMap({ results = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

  // Take top 25 highest-scoring parcels with valid coords
  const pins = results
    .filter((r) => r.latitude != null && r.longitude != null)
    .slice(0, 25);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mapboxgl = await loadMapbox();
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      // Center on US if no pins, else fit to pins
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: pins.length ? [pins[0].longitude, pins[0].latitude] : [-98.5, 39.5],
        zoom: pins.length ? 5 : 3.5,
      });
      map.addControl(new mapboxgl.NavigationControl(), "top-right");
      mapRef.current = map;
      map.on("load", () => setReady(true));
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render pins once map is ready or pins change
  useEffect(() => {
    if (!ready || !mapRef.current || !window.mapboxgl) return;
    const map = mapRef.current;
    const mapboxgl = window.mapboxgl;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!pins.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    pins.forEach((p) => {
      const el = document.createElement("div");
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.borderRadius = "50%";
      el.style.background = getScoreColor(p.match_score || 0);
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 6px rgba(0,0,0,0.4)";
      el.style.cursor = "pointer";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.color = "white";
      el.style.fontSize = "10px";
      el.style.fontWeight = "700";
      el.textContent = String(Math.round(p.match_score || 0));

      const popupHtml = `
        <div style="font-family:system-ui;min-width:200px">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${p.site_name || "Parcel"}</div>
          <div style="font-size:11px;color:#666;margin-bottom:6px">${p.parcel_address || ""}</div>
          <div style="font-size:11px"><b>Owner:</b> ${p.owner_name || "—"}</div>
          <div style="font-size:11px"><b>Score:</b> ${p.match_score || 0}%</div>
          ${p.parcel_size_acres ? `<div style="font-size:11px"><b>Size:</b> ${p.parcel_size_acres} ac</div>` : ""}
          ${p.search_id ? `<a href="/results?search_id=${p.search_id}" style="display:inline-block;margin-top:6px;font-size:11px;color:#3b82f6;text-decoration:underline">View scan →</a>` : ""}
        </div>
      `;

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([p.longitude, p.latitude])
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setHTML(popupHtml))
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([p.longitude, p.latitude]);
    });

    if (pins.length === 1) {
      map.flyTo({ center: [pins[0].longitude, pins[0].latitude], zoom: 14 });
    } else if (pins.length > 1) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 800 });
    }
  }, [ready, pins]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h2 className="font-heading font-semibold text-foreground">Top Parcels Map</h2>
          <span className="text-xs text-muted-foreground">· {pins.length} pin{pins.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <Legend color="#10b981" label="80+" />
          <Legend color="#3b82f6" label="60-79" />
          <Legend color="#f59e0b" label="40-59" />
          <Legend color="#ef4444" label="<40" />
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full h-[420px] bg-secondary" />
        {pins.length === 0 && ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-3">No parcels yet — run your first scan to see them on the map.</p>
              <Link to="/search" className="text-xs text-primary underline">Start a scan →</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}