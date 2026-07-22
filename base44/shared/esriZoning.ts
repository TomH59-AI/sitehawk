// Shared ESRI Living Atlas "USA Zoning" point lookup — nationwide zoning layer.
// Used as the final zoning-classification backstop by esriZoningFallback and
// scipBestParcels so every target parcel always carries a zoning value.
const USA_ZONING_URL =
  "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Zoning/FeatureServer/0/query";

export async function esriZoning(lat: number, lon: number, apiKey: string) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    f: "geojson",
    token: apiKey,
  });
  const r = await fetch(`${USA_ZONING_URL}?${params.toString()}`);
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (data?.error) {
    console.error("esriZoning ESRI query error:", JSON.stringify(data.error));
    return null;
  }
  const f = data?.features?.[0];
  if (!f) return null;
  const props = f.properties || {};
  const zoning = props.ZONE_CODE || props.zone_code || props.ZONING || null;
  const land_use = props.ZONE_TYPE || props.zone_type || props.GEN_USE || null;
  if (!zoning && !land_use) return null;
  return {
    zoning,
    land_use,
    jurisdiction: props.JURISDICTN || props.jurisdiction || props.MUNICIPALITY || null,
    zoning_polygon: f.geometry
      ? { type: "Feature", geometry: f.geometry, properties: { zoning: zoning || land_use || "—" } }
      : null,
    source: "ESRI",
  };
}