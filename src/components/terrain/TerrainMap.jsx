import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";

// Interactive Mapbox map centered on the active Target A that can switch between
// several basemap "looks" of the terrain (satellite, satellite+streets, outdoor
// topo, light streets, dark) plus an optional 3D terrain exaggeration toggle.
export default function TerrainMap({ latitude, longitude, styleUrl, terrain3D, exaggeration }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Apply / remove the 3D DEM terrain source on the current map.
  const applyTerrain = (map, on, exag) => {
    if (!map) return;
    if (on) {
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
      }
      map.setTerrain({ source: "mapbox-dem", exaggeration: exag ?? 1.5 });
    } else {
      map.setTerrain(null);
    }
  };

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
          style: styleUrl,
          center: [Number(longitude), Number(latitude)],
          zoom: 14,
          pitch: terrain3D ? 60 : 0,
        });
        map.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
        map.on("load", () => {
          applyTerrain(map, terrain3D, exaggeration);
          markerRef.current = new window.mapboxgl.Marker({ color: "#E11D48" })
            .setLngLat([Number(longitude), Number(latitude)])
            .addTo(map);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter + move marker when the active Target A changes
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || latitude == null || longitude == null) return;
    map.flyTo({ center: [Number(longitude), Number(latitude)], zoom: 14 });
    if (markerRef.current) markerRef.current.setLngLat([Number(longitude), Number(latitude)]);
  }, [ready, latitude, longitude]);

  // Switch the basemap "look" — re-applies terrain + marker after style reload
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setStyle(styleUrl);
    map.once("styledata", () => {
      applyTerrain(map, terrain3D, exaggeration);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, styleUrl]);

  // 3D terrain toggle + exaggeration
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    applyTerrain(map, terrain3D, exaggeration);
    map.easeTo({ pitch: terrain3D ? 60 : 0, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, terrain3D, exaggeration]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-destructive">
        Map failed to load: {loadError}
      </div>
    );
  }
  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}