import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// BIA American Indian / Alaska Native Land Area Representation (LAR) — the
// authoritative federal trust / restricted-fee boundary service. The service
// exposes Map export only (no cached tiles, no WMS), so each Leaflet tile is
// requested as a reprojected export image.
const EXPORT_URL =
  "https://biamaps.geoplatform.gov/server/rest/services/DivLTR/BIA_AIAN_National_LAR/MapServer/export";

const ArcGISExportLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const map = this._map;
    const size = this.getTileSize();
    const nwPoint = coords.scaleBy(size);
    const sePoint = nwPoint.add(size);
    const nw = L.CRS.EPSG3857.project(map.unproject(nwPoint, coords.z));
    const se = L.CRS.EPSG3857.project(map.unproject(sePoint, coords.z));
    const params = new URLSearchParams({
      bbox: `${nw.x},${se.y},${se.x},${nw.y}`,
      bboxSR: "3857",
      imageSR: "3857",
      size: `${size.x},${size.y}`,
      dpi: "96",
      format: "png32",
      transparent: "true",
      layers: "show:0",
      f: "image",
    });
    return `${EXPORT_URL}?${params.toString()}`;
  },
});

export default function TribalLandLayer({ opacity = 0.55 }) {
  const map = useMap();
  useEffect(() => {
    const layer = new ArcGISExportLayer("", {
      opacity,
      pane: "overlayPane",
      attribution: "Tribal lands: BIA AIAN LAR",
    });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, opacity]);
  return null;
}