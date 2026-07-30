import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

const EXPORT_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/export";
const HALF = 20037508.342789244;

// Census TIGERweb boundaries as a tiled ArcGIS dynamic-export overlay.
// The service's WMS endpoint doesn't expose counties/states, so we request the
// REST export image per tile instead.
const BoundaryTileLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const size = (HALF * 2) / Math.pow(2, coords.z);
    const x0 = -HALF + coords.x * size;
    const y1 = HALF - coords.y * size;
    const bbox = [x0, y1 - size, x0 + size, y1].join(",");
    const layers = this.options.layerIds.join(",");
    return `${EXPORT_URL}?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&layers=show:${layers}&format=png32&transparent=true&f=image`;
  },
});

export default function TigerBoundaryLayer({ layerIds }) {
  const map = useMap();

  useEffect(() => {
    if (!layerIds.length) return;
    const layer = new BoundaryTileLayer("", {
      layerIds,
      opacity: 0.9,
      maxZoom: 19,
      zIndex: 10,
    });
    layer.addTo(map);
    return () => map.removeLayer(layer);
  }, [map, layerIds.join(",")]);

  return null;
}