/**
 * RF Intelligence Engine — shared config (carrier colors, frequency bands,
 * signal ramp, dead-zone style). Mirrors the RFI Engine spec so the map layer,
 * legend, and filters all read from one source of truth.
 */

// Carrier → dot fill color (Mapbox 'match' expression order).
export const CARRIER_COLORS = {
  ATT: "#0078D4",
  VZW: "#CC0000",
  TMO: "#E20074",
  DISH: "#FF9900",
  OTHER: "#888888",
};

export const CARRIERS = [
  { code: "ATT", label: "AT&T" },
  { code: "VZW", label: "Verizon" },
  { code: "TMO", label: "T-Mobile" },
  { code: "DISH", label: "DISH" },
  { code: "OTHER", label: "Other / Regional" },
];

// Frequency band → stroke color (matches the < frequency_mhz thresholds).
export const BAND_RAMP = [
  { label: "< 1 GHz (Low-Band)", color: "#0000FF", max: 1000 },
  { label: "1–3 GHz (Mid-Band)", color: "#00FF00", max: 3000 },
  { label: "3–6 GHz (C-Band)", color: "#FFA500", max: 6000 },
  { label: "> 6 GHz (mmWave)", color: "#800080", max: Infinity },
];

export const BANDS = [
  { code: "Low-Band", label: "Low-Band (< 1 GHz)" },
  { code: "Mid-Band", label: "Mid-Band (1–3 GHz)" },
  { code: "C-Band", label: "C-Band (3–6 GHz)" },
  { code: "mmWave", label: "mmWave (> 6 GHz)" },
];

export const TECHNOLOGIES = ["5G NR", "LTE", "UMTS", "GSM", "CDMA"];

// Coverage fill signal-strength ramp (dBm → color).
export const SIGNAL_RAMP = [
  { dbm: -120, color: "#000000", label: "-120 dBm" },
  { dbm: -110, color: "#FF0000", label: "-110 dBm" },
  { dbm: -100, color: "#FFAA00", label: "-100 dBm" },
  { dbm: -90, color: "#FFFF00", label: "-90 dBm" },
  { dbm: -80, color: "#00FF00", label: "-80 dBm (strong)" },
];

export const DEADZONE_COLOR = "#222222";

// Carrier presets for the on-demand CloudRF coverage draw.
export const CARRIER_PRESET_KEY = {
  ATT: "att",
  VZW: "verizon",
  TMO: "tmobile",
  DISH: "generic",
  OTHER: "generic",
};

// Base map options. "dark" is the native Mapbox style; the rest are free USGS
// The National Map (apps.nationalmap.gov) ArcGIS raster tile services that we
// render UNDER all RF layers so towers/coverage/dead zones stay on top.
export const USGS_ATTRIBUTION = "USGS The National Map";
export const BASE_LAYERS = [
  { id: "dark", label: "Dark", type: "style" },
  {
    id: "usgs_topo", label: "USGS Topo", type: "raster",
    tiles: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
  },
  {
    id: "usgs_imagery_topo", label: "Imagery Topo", type: "raster",
    tiles: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}",
  },
  {
    id: "usgs_imagery", label: "Imagery", type: "raster",
    tiles: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
  },
];