import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { buildDimensionLabels } from "@/lib/parcelDimensions";
import { circle } from "@turf/circle";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// HawkFit Map — interactive Mapbox map: parcel outline, draggable tower pin,
// live fall-zone circle + compound rectangle.
// Cellular-tower shaped cursor — the exact bottom-center point is the tower base.
function createTowerCursorEl(color) {
  const el = document.createElement("div");
  el.style.cssText = "width:34px;height:52px;cursor:grab;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))";
  el.innerHTML = `<svg viewBox="0 0 34 52" width="34" height="52">
    <g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round">
      <line x1="13" y1="6" x2="9" y2="50"/><line x1="21" y1="6" x2="25" y2="50"/>
      <line x1="11.5" y1="16" x2="22.5" y2="16"/><line x1="10.5" y1="28" x2="23.5" y2="28"/><line x1="9.5" y1="40" x2="24.5" y2="40"/>
      <line x1="11.5" y1="16" x2="23.5" y2="28"/><line x1="22.5" y1="16" x2="10.5" y2="28"/>
      <line x1="10.5" y1="28" x2="24.5" y2="40"/><line x1="23.5" y1="28" x2="9.5" y2="40"/>
      <line x1="17" y1="1" x2="17" y2="6"/>
    </g>
    <circle cx="17" cy="50" r="2.5" fill="currentColor"/>
  </svg>`;
  el.style.color = color;
  return el;
}

export default function HawkFitMap({ siteTarget, towerLngLat, onTowerMove, fit, layers, controls, savedTargets = [], selectionEnabled = false, onMapSelect, onClearSavedTargets, overlay = null, cursorColor = null, searchRing = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const savedMarkerRefs = useRef([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [config] = await Promise.all([loadPublicConfig(), ensureMapboxLoaded()]);
        if (cancelled || !containerRef.current) return;
        window.mapboxgl.accessToken = config.mapboxAccessToken;
        const map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [-98.5, 39.8],
          zoom: 4,
        });
        map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
        map.on("load", () => {
          map.addSource("hf-parcel", { type: "geojson", data: EMPTY_FC });
          map.addSource("hf-fallzone", { type: "geojson", data: EMPTY_FC });
          map.addSource("hf-compound", { type: "geojson", data: EMPTY_FC });
          map.addSource("hf-dims", { type: "geojson", data: EMPTY_FC });
          map.addSource("hf-ai-overlay", { type: "geojson", data: EMPTY_FC });
          map.addSource("hf-ring", { type: "geojson", data: EMPTY_FC });
          map.addLayer({ id: "hf-ring-line", type: "line", source: "hf-ring", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#22D3EE", "line-width": 2.5, "line-dasharray": [3, 2] } });
          map.addLayer({ id: "hf-ring-center", type: "circle", source: "hf-ring", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#22D3EE", "circle-radius": 5, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2 } });
          map.addLayer({
            id: "hf-ring-label", type: "symbol", source: "hf-ring", filter: ["==", ["geometry-type"], "Point"],
            layout: {
              "text-field": ["get", "label"],
              "text-size": 11,
              "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
              "text-offset": [0, 1.1],
              "text-anchor": "top",
              "text-allow-overlap": true,
            },
            paint: { "text-color": "#FFFFFF", "text-halo-color": "#0E7490", "text-halo-width": 1.6 },
          });
          map.addLayer({ id: "hf-ai-overlay-fill", type: "fill", source: "hf-ai-overlay", paint: { "fill-color": ["get", "fill"], "fill-opacity": 0.35 } });
          map.addLayer({ id: "hf-parcel-fill", type: "fill", source: "hf-parcel", paint: { "fill-color": "#00A3FF", "fill-opacity": 0.08 } });
          map.addLayer({ id: "hf-parcel-line", type: "line", source: "hf-parcel", paint: { "line-color": "#00A3FF", "line-width": 3 } });
          map.addLayer({ id: "hf-fallzone-fill", type: "fill", source: "hf-fallzone", paint: { "fill-color": "#EF4444", "fill-opacity": 0.12 } });
          map.addLayer({ id: "hf-fallzone-line", type: "line", source: "hf-fallzone", paint: { "line-color": "#EF4444", "line-width": 2, "line-dasharray": [2, 2] } });
          map.addLayer({ id: "hf-compound-fill", type: "fill", source: "hf-compound", paint: { "fill-color": "#F59E0B", "fill-opacity": 0.3 } });
          map.addLayer({ id: "hf-compound-line", type: "line", source: "hf-compound", paint: { "line-color": "#F59E0B", "line-width": 2 } });
          map.addLayer({
            id: "hf-dims-labels", type: "symbol", source: "hf-dims",
            layout: {
              "text-field": ["get", "label"],
              "text-size": 12,
              "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
              "text-allow-overlap": false,
            },
            paint: {
              "text-color": "#FFFFFF",
              "text-halo-color": "#0056B3",
              "text-halo-width": 1.6,
            },
          });
          setReady(true);
        });
        mapRef.current = map;
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      }
    })();
    return () => {
      cancelled = true;
      if (markerRef.current) markerRef.current.remove();
      savedMarkerRefs.current.forEach((marker) => marker.remove());
      savedMarkerRefs.current = [];
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Center on target + draw parcel when a property is loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !siteTarget) return;
    const parcelData = siteTarget.parcel_geometry
      ? { type: "Feature", properties: {}, geometry: siteTarget.parcel_geometry }
      : EMPTY_FC;
    map.getSource("hf-parcel").setData(parcelData);
    map.getSource("hf-dims").setData(buildDimensionLabels(siteTarget.parcel_geometry));

    if (siteTarget.parcel_geometry) {
      const coords = [];
      const walk = (a) => (typeof a[0] === "number" ? coords.push(a) : a.forEach(walk));
      walk(siteTarget.parcel_geometry.coordinates);
      const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
      map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 18 });
    } else {
      map.flyTo({ center: [siteTarget.longitude, siteTarget.latitude], zoom: 17 });
    }
  }, [ready, siteTarget]);

  // Draggable tower cursor — the bottom-center point is the proposed tower base.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !towerLngLat) return;
    const color = cursorColor || (fit?.status === "works" ? "#10B981" : fit?.status === "needs_review" ? "#F59E0B" : "#E11D48");
    if (!markerRef.current) {
      const marker = new window.mapboxgl.Marker({ element: createTowerCursorEl(color), draggable: true, anchor: "bottom" })
        .setLngLat(towerLngLat)
        .addTo(map);
      const report = () => {
        const p = marker.getLngLat();
        onTowerMove([p.lng, p.lat]);
      };
      marker.on("drag", report);
      marker.on("dragend", report);
      markerRef.current = marker;
    } else {
      const cur = markerRef.current.getLngLat();
      if (Math.abs(cur.lng - towerLngLat[0]) > 1e-9 || Math.abs(cur.lat - towerLngLat[1]) > 1e-9) {
        markerRef.current.setLngLat(towerLngLat);
      }
      markerRef.current.getElement().style.color = color;
    }
  }, [ready, towerLngLat, onTowerMove, fit?.status, cursorColor]);

  // SARF search ring — center coordinates + radius circle for the active target's SCIP
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const lat = Number(searchRing?.lat), lon = Number(searchRing?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      map.getSource("hf-ring").setData(EMPTY_FC);
      return;
    }
    const radius = Number(searchRing?.radius_miles) || 1;
    const ringPoly = circle([lon, lat], radius, { steps: 96, units: "miles" });
    const center = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { label: `SEARCH RING CENTER\n${lat.toFixed(6)}, ${lon.toFixed(6)} · ${radius} mi` },
    };
    map.getSource("hf-ring").setData({ type: "FeatureCollection", features: [ringPoly, center] });
  }, [ready, searchRing?.lat, searchRing?.lon, searchRing?.radius_miles]);

  // AI Equation buildable-area overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource("hf-ai-overlay").setData(overlay || EMPTY_FC);
  }, [ready, overlay]);

  // Live fall zone + compound updates
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource("hf-fallzone").setData(fit?.fallZone || EMPTY_FC);
    map.getSource("hf-compound").setData(fit?.compound || EMPTY_FC);
    const color = fit?.status === "works" ? "#10B981" : "#EF4444";
    map.setPaintProperty("hf-fallzone-fill", "fill-color", color);
    map.setPaintProperty("hf-fallzone-line", "line-color", color);
  }, [ready, fit]);

  // Layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (ids, on) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    vis(["hf-parcel-fill", "hf-parcel-line", "hf-dims-labels"], layers.parcel);
    vis(["hf-fallzone-fill", "hf-fallzone-line"], layers.fallZone);
    vis(["hf-compound-fill", "hf-compound-line"], layers.compound);
  }, [ready, layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    savedMarkerRefs.current.forEach((marker) => marker.remove());
    savedMarkerRefs.current = savedTargets.map((target, index) => {
      if (!target) return null;
      const el = document.createElement("div");
      el.textContent = ["D", "E", "F"][index];
      el.style.cssText = "width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#7c3aed;color:#fff;border:2px solid #fff;font:700 12px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.45)";
      return new window.mapboxgl.Marker({ element: el }).setLngLat([target.lng, target.lat]).addTo(map);
    }).filter(Boolean);
  }, [ready, savedTargets]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const canvas = map.getCanvas();
    if (!canvas) return;
    canvas.style.cursor = selectionEnabled ? "crosshair" : "";
    if (!selectionEnabled) return;
    const pick = (event) => onMapSelect?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    map.on("click", pick);
    return () => { try { map.off("click", pick); } catch {} if (canvas) canvas.style.cursor = ""; };
  }, [ready, selectionEnabled, onMapSelect]);

  if (loadError) {
    return <div className="w-full h-full flex items-center justify-center text-sm text-destructive">Map failed to load: {loadError}</div>;
  }
  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />
      {fit && (
        <div className={`absolute left-3 top-3 z-10 rounded-full border px-3 py-1.5 text-xs font-bold shadow ${fit.status === "works" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"}`}>
          HawkPerch · {fit.status === "works" ? "ALLOWABLE" : fit.errorCode || "UNALLOWABLE"}
        </div>
      )}
      {savedTargets.some(Boolean) && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onClearSavedTargets?.(); }}
          className="absolute bottom-3 right-3 z-10 rounded-lg border border-destructive/50 bg-card px-3 py-2 text-xs font-extrabold text-destructive shadow-lg hover:bg-destructive/10"
        >
          Clear D/E/F
        </button>
      )}
    </div>
  );
}