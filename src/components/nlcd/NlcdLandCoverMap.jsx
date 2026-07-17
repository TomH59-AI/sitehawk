import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";

// Official USGS / MRLC Annual NLCD WMS raster tiles (EPSG:3857, 256px), 2019.
const NLCD_ATTRIBUTION = "USGS / MRLC Annual NLCD";
const LANDCOVER_TILE =
  "https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wms?service=WMS&version=1.1.1&request=GetMap&layers=Land-Cover-Native_conus_year_data&styles=&format=image%2Fpng&transparent=true&srs=EPSG%3A3857&width=256&height=256&bbox={bbox-epsg-3857}&time=2019-01-01T00%3A00%3A00.000Z";
const IMPERVIOUS_TILE =
  "https://dmsdata.cr.usgs.gov/geoserver/mrlc_Fractional-Impervious-Surface-Native_conus_year_data/wms?service=WMS&version=1.1.1&request=GetMap&layers=Fractional-Impervious-Surface-Native_conus_year_data&styles=&format=image%2Fpng&transparent=true&srs=EPSG%3A3857&width=256&height=256&bbox={bbox-epsg-3857}&time=2019-01-01T00%3A00%3A00.000Z";

const OVERLAYS = [
  { layerId: "nlcd-landcover", sourceId: "sitehawk-nlcd-landcover", tiles: LANDCOVER_TILE },
  { layerId: "nlcd-impervious", sourceId: "sitehawk-nlcd-impervious", tiles: IMPERVIOUS_TILE },
];

// Interactive Mapbox map centered on the active Target A with two toggleable
// USGS/MRLC NLCD WMS raster overlays (land cover + impervious surface) and a
// shared opacity slider. Both overlays are hidden by default.
export default function NlcdLandCoverMap({ latitude, longitude, layers, opacity }) {
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
          center: [Number(longitude), Number(latitude)],
          zoom: 14,
        });
        map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
        map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
        map.on("load", () => {
          OVERLAYS.forEach(({ layerId, sourceId, tiles }) => {
            map.addSource(sourceId, {
              type: "raster",
              tiles: [tiles],
              tileSize: 256,
              attribution: NLCD_ATTRIBUTION,
            });
            map.addLayer({
              id: layerId,
              type: "raster",
              source: sourceId,
              layout: { visibility: "none" },
              paint: { "raster-opacity": opacity ?? 0.7 },
            });
          });
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

  // Independent overlay visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("nlcd-landcover", "visibility", layers.landcover ? "visible" : "none");
    map.setLayoutProperty("nlcd-impervious", "visibility", layers.impervious ? "visible" : "none");
  }, [ready, layers]);

  // Shared opacity slider — immediately updates raster-opacity on both layers
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    OVERLAYS.forEach(({ layerId }) => map.setPaintProperty(layerId, "raster-opacity", opacity));
  }, [ready, opacity]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-destructive">
        Map failed to load: {loadError}
      </div>
    );
  }
  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}