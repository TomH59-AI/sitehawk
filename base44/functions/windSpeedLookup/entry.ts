import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ASCE 7-22 Wind Speed — w2022_Tile_RC_II_new MapServer
// Layer 5 = Wind Speed CONUS (Vmph) — identify returns pixel value already in mph
const ASCE_BASE = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_II_new/MapServer";

function classifyRisk(mph) {
  if (!mph) return "unknown";
  if (mph >= 150) return "extreme";
  if (mph >= 130) return "high";
  if (mph >= 110) return "moderate";
  return "low";
}

// ASCE 7-22 §26.5.1 — Hurricane Prone Region: Atlantic/Gulf coast where Vult > 115 mph
function isHurricaneProne(mph, lat, lon) {
  if (!mph || mph < 115) return false;
  // Gulf Coast + Atlantic seaboard band
  const isCoastal = lon >= -98 && lon <= -65 && lat >= 24 && lat <= 48;
  return isCoastal;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    const delta = 0.1;
    const mapExtent = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;

    // Identify — pulls raster pixel from layer 5 (CONUS wind speed, values in mph)
    const identifyUrl = `${ASCE_BASE}/identify?` + new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "visible",
      tolerance: "20",
      mapExtent,
      imageDisplay: "800,600,96",
      returnGeometry: "false",
      f: "json",
    });

    const identifyRes = await fetch(identifyUrl);
    const identifyData = identifyRes.ok ? await identifyRes.json() : { results: [] };

    console.log(`[ASCE wind] identify results: ${identifyData.results?.length ?? 0}`);
    identifyData.results?.forEach(r =>
      console.log(`  layer ${r.layerId} "${r.layerName}": ${JSON.stringify(r.attributes)}`)
    );

    // Extract wind speed from any result that has a pixel value
    let wind_speed_mph = null;
    const wind_mri = "700-Year MRI (Risk Category II)";

    for (const r of (identifyData.results || [])) {
      const raw = r.attributes?.["Classify.Pixel Value"]
        || r.attributes?.["Pixel Value"]
        || r.attributes?.["pixel_value"];

      if (!raw || raw === "NoData" || raw === "null") continue;
      const val = parseFloat(raw);
      if (isNaN(val) || val <= 0) continue;

      // Layer 5 of w2022_Tile_RC_II_new returns mph directly (85–200 mph range for CONUS)
      wind_speed_mph = Math.round(val);
      break;
    }

    const in_hurricane_prone_region = isHurricaneProne(wind_speed_mph, lat, lon);
    const wind_risk_level = classifyRisk(wind_speed_mph);

    // Special Wind Region check via the dedicated polygon service
    let in_special_wind_region = false;
    try {
      const swrUrl = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Special_Wind_Regions/MapServer/0/query?" + new URLSearchParams({
        geometry: `${lon},${lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "OBJECTID",
        returnGeometry: "false",
        f: "json",
      });
      const swrRes = await fetch(swrUrl);
      if (swrRes.ok) {
        const swrData = await swrRes.json();
        in_special_wind_region = (swrData.features?.length > 0);
      }
    } catch (e) {
      console.warn("[ASCE wind] Special wind region check failed:", e.message);
    }

    console.log(`[ASCE wind] final: ${wind_speed_mph} mph | hurricane=${in_hurricane_prone_region} | special=${in_special_wind_region} | risk=${wind_risk_level}`);

    return Response.json({
      wind_speed_mph,
      wind_mri: wind_speed_mph ? wind_mri : null,
      in_hurricane_prone_region,
      in_special_wind_region,
      wind_risk_level,
    });

  } catch (error) {
    console.error('windSpeedLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});