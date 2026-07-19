import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { buildDimensionLabels } from "@/lib/parcelDimensions";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// HawkFit Map — interactive Mapbox map: parcel outline, draggable tower pin,
// live fall-zone circle + compound rectangle.
export default function HawkFitMap({ siteTarget, towerLngLat, onTowerMove, fit, layers, controls, savedTargets = [], pickSlot = null, onPickTarget }) {
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

  // Draggable tower marker
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !towerLngLat) return;
    if (!markerRef.current) {
      const marker = new window.mapboxgl.Marker({ draggable: true, color: fit?.status === "works" ? "#10B981" : "#E11D48" })
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
      const markerColor = fit?.status === "works" ? "#10B981" : "#E11D48";
      markerRef.current.getElement().querySelectorAll("svg path").forEach((path) => path.setAttribute("fill", markerColor));
    }
  }, [ready, towerLngLat, onTowerMove, fit?.status]);

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
    map.getCanvas().style.cursor = pickSlot == null ? "" : "crosshair";
    if (pickSlot == null) return;
    const pick = (event) => onPickTarget?.(pickSlot, { lat: event.lngLat.lat, lng: event.lngLat.lng });
    map.on("click", pick);
    return () => { map.off("click", pick); map.getCanvas().style.cursor = ""; };
  }, [ready, pickSlot, onPickTarget]);

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
    </div>
  );
}