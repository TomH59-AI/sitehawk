import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { addViewshedOverlay } from "@/lib/mapViewshed3d";

// Annotated TalonReach coverage map — served heatmap, weak/dead zone outlines
// with labeled markers, infill pin, and a flyTo handle for the panel.
function circleRing(lon, lat, radiusMi, steps = 48) {
  const rM = radiusMi * 1609.34;
  const dLat = rM / 111320;
  const dLon = rM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]);
  }
  return ring;
}

const TalonReachMap = forwardRef(function TalonReachMap({ latitude, longitude, report }, ref) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

  useImperativeHandle(ref, () => ({
    flyTo(lngLat, zoom = 13.5) {
      mapRef.current?.flyTo({ center: lngLat, zoom, duration: 1200 });
    },
  }), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cfg] = await Promise.all([loadPublicConfig(), ensureMapboxLoaded()]);
      if (cancelled || !containerRef.current) return;
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [Number(longitude), Number(latitude)],
        zoom: 11,
        attributionControl: false,
      });
      map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => { if (!cancelled) { mapRef.current = map; setReady(true); } });
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw / redraw annotations whenever a report lands.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !report) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // SERVED — CloudRF heatmap overlay.
    if (report.coverage?.png_url && report.coverage?.bounds) {
      addViewshedOverlay(map, report.coverage, 0.5);
    }

    // UNSERVED — weak/dead zone outlines (red fill + dashed outline).
    const zones = report.analysis?.weak_zones || [];
    const zoneFC = {
      type: "FeatureCollection",
      features: zones.map((z, i) => ({
        type: "Feature",
        properties: { index: i },
        geometry: { type: "Polygon", coordinates: [circleRing(z.longitude, z.latitude, z.radius_mi || 0.5)] },
      })),
    };
    if (map.getLayer("talonreach-zones-line")) map.removeLayer("talonreach-zones-line");
    if (map.getLayer("talonreach-zones-fill")) map.removeLayer("talonreach-zones-fill");
    if (map.getSource("talonreach-zones")) map.removeSource("talonreach-zones");
    map.addSource("talonreach-zones", { type: "geojson", data: zoneFC });
    map.addLayer({ id: "talonreach-zones-fill", type: "fill", source: "talonreach-zones", paint: { "fill-color": "#ef4444", "fill-opacity": 0.22 } });
    map.addLayer({ id: "talonreach-zones-line", type: "line", source: "talonreach-zones", paint: { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [2, 1.5] } });

    // Labeled weak-zone markers.
    zones.forEach((z) => {
      const el = document.createElement("div");
      el.style.cssText = "max-width:190px;background:rgba(15,23,42,0.92);border:1px solid #ef4444;color:#fecaca;font:600 10px/1.3 sans-serif;padding:4px 7px;border-radius:8px;cursor:default;box-shadow:0 2px 8px rgba(0,0,0,0.5)";
      el.textContent = z.label || `Weak zone — ${String(z.cause || "").replace("_", " ")}`;
      markersRef.current.push(new window.mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([z.longitude, z.latitude]).setOffset([0, -8]).addTo(map));
    });

    // Tower marker.
    const towerEl = document.createElement("div");
    towerEl.style.cssText = "background:#06b6d4;border:2px solid white;width:16px;height:16px;border-radius:50%;box-shadow:0 0 10px rgba(6,182,212,0.9)";
    towerEl.title = "Sited tower";
    markersRef.current.push(new window.mapboxgl.Marker({ element: towerEl }).setLngLat([Number(longitude), Number(latitude)]).addTo(map));

    // Infill / repeater pin.
    if (report.infill?.latitude) {
      const pin = document.createElement("div");
      pin.style.cssText = "background:rgba(15,23,42,0.92);border:1px solid #22d3ee;color:#a5f3fc;font:700 10px/1.3 sans-serif;padding:4px 7px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.5)";
      pin.textContent = report.infill_source === "cloudrf_bsa" ? "📡 Infill site (CloudRF BSA)" : "📡 Recommended infill site";
      markersRef.current.push(new window.mapboxgl.Marker({ element: pin, anchor: "bottom" }).setLngLat([report.infill.longitude, report.infill.latitude]).setOffset([0, -6]).addTo(map));
      const dot = document.createElement("div");
      dot.style.cssText = "background:#22d3ee;border:2px solid white;width:12px;height:12px;border-radius:50%";
      markersRef.current.push(new window.mapboxgl.Marker({ element: dot }).setLngLat([report.infill.longitude, report.infill.latitude]).addTo(map));
    }

    // Fit everything.
    const b = new window.mapboxgl.LngLatBounds();
    b.extend([Number(longitude), Number(latitude)]);
    zones.forEach((z) => b.extend([z.longitude, z.latitude]));
    if (report.infill?.latitude) b.extend([report.infill.longitude, report.infill.latitude]);
    map.fitBounds(b, { padding: 70, maxZoom: 12.5, duration: 800 });
  }, [ready, report, latitude, longitude]);

  return (
    <div className="relative w-full h-full min-h-[380px] rounded-xl overflow-hidden border border-border">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute bottom-2 left-2 z-10 rounded-md bg-slate-900/85 text-[10px] text-white/85 px-2.5 py-1.5 space-y-0.5">
        <div><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff)" }} />Served — simulated signal</div>
        <div><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle border border-red-500 bg-red-500/30" />Unserved — weak/dead zone</div>
      </div>
    </div>
  );
});

export default TalonReachMap;