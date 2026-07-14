// Shared Annual NLCD (National Land Cover Database) raster layer configuration.
// Tiles load directly from the public USGS/MRLC WMS — no Base44 secret or
// backend adapter required.
const WMS_BASE = "https://www.mrlc.gov/geoserver/mrlc_display/wms";

export const NLCD_YEARS = Array.from({ length: 2025 - 1985 + 1 }, (_, i) => 2025 - i);

export const NLCD_LAYERS = {
  nlcd_land_cover: {
    id: "nlcd_land_cover",
    group: "Land intelligence",
    label: "NLCD Land Cover",
    description: "Annual USGS land cover classification — developed, forest, cropland, wetlands",
    color: "#84cc16",
    geometry: "raster",
    source: "USGS / MRLC",
    opacity: 0.6,
    wmsLayerFor: (year) => `mrlc_display:Annual_NLCD_LndCov_${year}_CU_C1V0`,
  },
  nlcd_impervious: {
    id: "nlcd_impervious",
    group: "Land intelligence",
    label: "NLCD % Impervious",
    description: "Annual USGS fractional impervious surface — built-up intensity",
    color: "#f43f5e",
    geometry: "raster",
    source: "USGS / MRLC",
    opacity: 0.6,
    wmsLayerFor: (year) => `mrlc_display:Annual_NLCD_FctImp_${year}_CU_C1V0`,
  },
};

export function nlcdTilesUrl(definition, year) {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: definition.wmsLayerFor(year),
    STYLES: "",
    FORMAT: "image/png",
    TRANSPARENT: "true",
    SRS: "EPSG:3857",
    WIDTH: "256",
    HEIGHT: "256",
  });
  return `${WMS_BASE}?${params.toString()}&BBOX={bbox-epsg-3857}`;
}