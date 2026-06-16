import { useEffect, useRef } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";

// Primary target area — center of US wireless infrastructure activity
const DEFAULT_CENTER = [-98.5795, 39.8283]; // Continental US center
const DEFAULT_ZOOM = 4.5;

export default function LandingMapBackground() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let map;
    let cancelled = false;

    async function init() {
      try {
        const config = await loadPublicConfig();
        const token = config?.mapboxToken || config?.MAPBOX_API_KEY;
        if (!token || cancelled) return;

        await ensureMapboxLoaded();
        if (cancelled || !containerRef.current) return;

        window.mapboxgl.accessToken = token;
        map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-v9",
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
        });

        mapRef.current = map;

        // Slow auto-rotation for cinematic effect
        let bearing = 0;
        function rotate() {
          if (!mapRef.current || cancelled) return;
          bearing = (bearing + 0.015) % 360;
          mapRef.current.setBearing(bearing);
          requestAnimationFrame(rotate);
        }
        map.on("load", () => {
          if (!cancelled) rotate();
        });
      } catch (e) {
        // Silently fail — hero still renders without map
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}