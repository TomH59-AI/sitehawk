// SiteHawkVerificationMap — shared config: Midnight Hawk theme, basemaps,
// raster/WMS overlays and ArcGIS FeatureServer vector overlays.

export const THEME = {
  bg: "#0a0e17",
  panel: "#111827",
  border: "#1e293b",
  accent: "#00d4ff",
};

// Candidate pin color by score: Green 75+, Cyan 60-74, Amber <60.
export const scoreColor = (s) =>
  Number(s) >= 75 ? "#10b981" : Number(s) >= 60 ? "#00d4ff" : "#f59e0b";

export const BASEMAPS = [
  { id: "satellite", label: "Mapbox Satellite" },
  {
    id: "usgs_topo",
    label: "USGS Topo",
    tiles: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
  },
  {
    id: "usgs_relief",
    label: "USGS Shaded Relief",
    tiles: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}",
  },
];

export const RASTER_OVERLAYS = [
  {
    id: "wetlands",
    label: "USFWS Wetlands (NWI)",
    tiles:
      "https://www.fws.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:0&dpi=96&f=image",
    tileSize: 512,
  },
  {
    id: "hydro",
    label: "USGS Hydrography (NHD)",
    tiles:
      "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&dpi=96&f=image",
    tileSize: 512,
  },
  {
    id: "nlcd",
    label: "NLCD Land Cover",
    tiles:
      "https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wms?service=WMS&version=1.1.1&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}",
    tileSize: 256,
  },
];

export const VECTOR_OVERLAYS = {
  substations: {
    label: "Electric Substations",
    url: "https://services6.arcgis.com/OO2s4OoyCZkYJ6oE/arcgis/rest/services/Substations/FeatureServer/0/query",
    color: "#FF5A00",
  },
  transmission: {
    label: "Transmission Lines",
    url: "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query",
    color: "#9b30ff",
  },
};

export const OVERLAY_LABELS = {
  wetlands: "Wetlands (NWI)",
  hydro: "Hydrography (NHD)",
  nlcd: "NLCD Land Cover",
  substations: "Electric Substations",
  transmission: "Transmission Lines",
  towers: "Existing Towers (OpenCellID)",
  rf: "RF Coverage (CloudRF)",
  fiber: "Fiber Lit Buildings (CarrierFinder)",
  db_airports: "Airports (SiteHawk Data)",
  db_cellsites: "Cell Sites (SiteHawk Data)",
};