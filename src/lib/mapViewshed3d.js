// Shared Mapbox GL helpers — CloudRF viewshed image overlay, 3D terrain toggle,
// and a to-scale extruded tower column at the tower's location.
const FT_TO_M = 0.3048;

// CloudRF /area bounds arrive as [north, east, south, west]. Normalize defensively.
export function viewshedCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) return null;
  const b = bounds.map(Number);
  if (b.some((v) => !Number.isFinite(v))) return null;
  const north = Math.max(b[0], b[2]), south = Math.min(b[0], b[2]);
  const east = Math.max(b[1], b[3]), west = Math.min(b[1], b[3]);
  return [[west, north], [east, north], [east, south], [west, south]];
}

export function addViewshedOverlay(map, { png_url, bounds }, opacity = 0.55) {
  const coordinates = viewshedCoordinates(bounds);
  if (!map || !png_url || !coordinates) return false;
  removeViewshedOverlay(map);
  map.addSource("cloudrf-viewshed", { type: "image", url: png_url, coordinates });
  map.addLayer({
    id: "cloudrf-viewshed-layer",
    type: "raster",
    source: "cloudrf-viewshed",
    paint: { "raster-opacity": opacity, "raster-fade-duration": 0 },
  });
  return true;
}

export function removeViewshedOverlay(map) {
  try {
    if (map.getLayer("cloudrf-viewshed-layer")) map.removeLayer("cloudrf-viewshed-layer");
    if (map.getSource("cloudrf-viewshed")) map.removeSource("cloudrf-viewshed");
  } catch { /* map may be mid-style-change */ }
}

// Small circle polygon (meters radius) used as the tower's extrusion footprint.
function towerFootprint(lon, lat, radiusM = 4, steps = 16) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function addTowerExtrusion(map, lon, lat, heightFt = 199) {
  removeTowerExtrusion(map);
  map.addSource("tower-3d", { type: "geojson", data: towerFootprint(lon, lat) });
  map.addLayer({
    id: "tower-3d-layer",
    type: "fill-extrusion",
    source: "tower-3d",
    paint: {
      "fill-extrusion-color": "#e11d48",
      "fill-extrusion-height": (Number(heightFt) || 199) * FT_TO_M,
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.95,
    },
  });
}

export function removeTowerExtrusion(map) {
  try {
    if (map.getLayer("tower-3d-layer")) map.removeLayer("tower-3d-layer");
    if (map.getSource("tower-3d")) map.removeSource("tower-3d");
  } catch { /* ignore */ }
}

export function setTerrain3D(map, on, exaggeration = 1.5) {
  if (on) {
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
    }
    map.setTerrain({ source: "mapbox-dem", exaggeration });
    map.easeTo({ pitch: 60, duration: 700 });
  } else {
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }
}