import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ASCE_BASE = "https://gis.asce.org/arcgis/rest/services/ASCE722/w2022_Tile_RC_IV_SI/MapServer";

// Convert WGS84 lat/lon to Web Mercator (EPSG:3857)
function toWebMercator(lat, lon) {
  const x = lon * 20037508.342 / 180;
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180) * 20037508.342 / 180;
  return { x, y };
}

// Classify wind risk for cell tower structural purposes
function classifyRisk(mph) {
  if (!mph) return "unknown";
  if (mph >= 150) return "extreme";
  if (mph >= 130) return "high";
  if (mph >= 110) return "moderate";
  return "low";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    const { x, y } = toWebMercator(lat, lon);
    const delta = 0.1; // ~11km extent for mapExtent param
    const mapExtent = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;

    // Use MapServer identify — queries all layers at once including the CONUS raster (layer 6)
    const identifyUrl = `${ASCE_BASE}/identify?` + new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all",
      tolerance: "5",
      mapExtent,
      imageDisplay: "400,400,96",
      returnGeometry: "false",
      f: "json",
    });

    // Also query Hurricane Prone Region (layer 1) and Special Wind Region (layer 3) polygon layers
    const bbox = encodeURIComponent(JSON.stringify({
      xmin: x - 2000, ymin: y - 2000,
      xmax: x + 2000, ymax: y + 2000,
      spatialReference: { wkid: 102100 }
    }));
    const polyQuery = `geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=102100&outFields=*&returnGeometry=false&f=json`;

    const [identifyRes, specialRes, hurricaneRes] = await Promise.all([
      fetch(identifyUrl),
      fetch(`${ASCE_BASE}/3/query?${polyQuery}`),
      fetch(`${ASCE_BASE}/1/query?${polyQuery}`),
    ]);

    const [identifyData, specialData, hurricaneData] = await Promise.all([
      identifyRes.json(),
      specialRes.json(),
      hurricaneRes.json(),
    ]);

    // Extract wind speed from raster identify result (layer 6 = Wind Speed CONUS)
    let wind_speed_mph = null;
    let wind_mri = "700-Year MRI (Risk Category II)"; // ASCE 7-22 standard

    const conusLayer = identifyData.results?.find(r => r.layerId === 6 || r.layerName?.includes("CONUS"));
    if (conusLayer) {
      // The raster returns m/s — multiply by 2.237 to get mph, or it may already be mph
      const rawVal = parseFloat(conusLayer.attributes?.["Classify.Pixel Value"] || conusLayer.attributes?.["Pixel Value"] || 0);
      // If value is in m/s range (20-70), convert to mph; if already mph (80-200), use directly
      if (rawVal > 0 && rawVal < 75) {
        wind_speed_mph = Math.round(rawVal * 2.23694); // m/s to mph
      } else if (rawVal >= 75) {
        wind_speed_mph = Math.round(rawVal);
      }
    }

    const in_special_wind_region = (specialData.features?.length > 0) || false;
    const in_hurricane_prone_region = (hurricaneData.features?.length > 0) || false;
    const wind_risk_level = classifyRisk(wind_speed_mph);

    console.log(`Wind lookup ${lat},${lon}: ${wind_speed_mph} mph (raw: ${conusLayer?.attributes?.["Classify.Pixel Value"]}), hurricane=${in_hurricane_prone_region}, special=${in_special_wind_region}`);

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