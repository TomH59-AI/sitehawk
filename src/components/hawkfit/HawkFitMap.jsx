import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// HawkFit Map — interactive Mapbox map: parcel outline, draggable tower pin,
// live fall-zone circle + compound rectangle.
export default function HawkFitMap({ siteTarget, towerLngLat, onTowerMove, fit, layers }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
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
          map.addLayer({ id: "hf-parcel-fill", type: "fill", source: "hf-parcel", paint: { "fill-color": "#00A3FF", "fill-opacity": 0.08 } });
          map.addLayer({ id: "hf-parcel-line", type: "line", source: "hf-parcel", paint: { "line-color": "#00A3FF", "line-width": 3 } });
          map.addLayer({ id: "hf-fallzone-fill", type: "fill", source: "hf-fallzone", paint: { "fill-color": "#EF4444", "fill-opacity": 0.12 } });
          map.addLayer({ id: "hf-fallzone-line", type: "line", source: "hf-fallzone", paint: { "line-color": "#EF4444", "line-width": 2, "line-dasharray": [2, 2] } });
          map.addLayer({ id: "hf-compound-fill", type: "fill", source: "hf-compound", paint: { "fill-color": "#F59E0B", "fill-opacity": 0.3 } });
          map.addLayer({ id: "hf-compound-line", type: "line", source: "hf-compound", paint: { "line-color": "#F59E0B", "line-width": 2 } });
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
      const marker = new window.mapboxgl.Marker({ draggable: true, color: "#E11D48" })
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
    }
  }, [ready, towerLngLat, onTowerMove]);

  // Live fall zone + compound updates
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource("hf-fallzone").setData(fit?.fallZone || EMPTY_FC);
    map.getSource("hf-compound").setData(fit?.compound || EMPTY_FC);
  }, [ready, fit]);

  // Layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (ids, on) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    vis(["hf-parcel-fill", "hf-parcel-line"], layers.parcel);
    vis(["hf-fallzone-fill", "hf-fallzone-line"], layers.fallZone);
    vis(["hf-compound-fill", "hf-compound-line"], layers.compound);
  }, [ready, layers]);

  if (loadError) {
    return <div className="w-full h-full flex items-center justify-center text-sm text-destructive">Map failed to load: {loadError}</div>;
  }
  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}