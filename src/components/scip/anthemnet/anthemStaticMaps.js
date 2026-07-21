// Printable static-map URL builders for the AnthemNet SCIP (Mapbox Static Images API).
import simplify from "@turf/simplify";

// USFWS National Wetlands Inventory export — ~1 mile bbox around the site.
// Deterministic public map service; no token required.
export function wetlandsStaticUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const b = 0.0145; // ~1 mile
  const params = new URLSearchParams({
    bbox: `${lon - b},${lat - b},${lon + b},${lat + b}`,
    bboxSR: "4326",
    imageSR: "3857",
    size: "1700,2200",
    dpi: "200",
    format: "png32",
    transparent: "false",
    f: "image",
  });
  return `https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export?${params}`;
}

// ASCE 7-22 wind speed raster (Risk Category II) export around the site.
export function windStaticUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const b = 0.35; // regional context view
  const params = new URLSearchParams({
    bbox: `${lon - b},${lat - b},${lon + b},${lat + b}`,
    bboxSR: "4326",
    imageSR: "3857",
    size: "1280,800",
    dpi: "150",
    format: "png32",
    transparent: "false",
    f: "image",
  });
  return `https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer/export?${params}`;
}

// Interactive ASCE Hazard Tool deep-link for the site (reference link).
export function asceHazardToolUrl(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return `https://ascehazardtool.org/#lat=${lat}&lon=${lon}&z=5&r=default&sc=0&sv=7-22&m=imperial&v=`;
}

// Site → destination proximity exhibit (airport / cell tower): two pins, auto-fit.
export function proximityStaticUrl(token, site, dest) {
  if (!token || !Number.isFinite(site?.lat) || !Number.isFinite(site?.lon) ||
      !Number.isFinite(dest?.lat) || !Number.isFinite(dest?.lon)) return null;
  const pins = `pin-s-a+16a34a(${site.lon},${site.lat}),pin-s-b+0891b2(${dest.lon},${dest.lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${pins}/auto/640x400@2x?padding=60&access_token=${token}`;
}

// Parcel boundary exhibit: simplified GeoJSON overlay on satellite + center pin.
export function parcelStaticUrl(token, geometry, lat, lon) {
  if (!token || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const pin = `pin-s+ef4444(${lon},${lat})`;
  let overlay = null;
  if (geometry) {
    try {
      const simplified = simplify(
        { type: "Feature", properties: {}, geometry },
        { tolerance: 0.00005, highQuality: false }
      );
      const feature = {
        type: "Feature",
        properties: { stroke: "#16a34a", "stroke-width": 3, fill: "#16a34a", "fill-opacity": 0.15 },
        geometry: simplified.geometry,
      };
      const enc = encodeURIComponent(JSON.stringify(feature));
      if (enc.length < 7000) overlay = `geojson(${enc})`;
    } catch { overlay = null; }
  }
  const layers = overlay ? `${overlay},${pin}` : pin;
  const view = overlay ? "auto" : `${lon},${lat},16`;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${layers}/${view}/640x400@2x?padding=50&access_token=${token}`;
}