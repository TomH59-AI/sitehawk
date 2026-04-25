import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// FCC Broadband Map API — public, no key required
// EIA Electric Retail Service Territories — free ArcGIS, no key required
// EIA/ArcGIS Electric Transmission Lines — free ArcGIS, no key required

const EIA_UTILITY_URL = "https://services1.arcgis.com/4yjifSiIG17X0gW4/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0/query";
const EIA_TRANSMISSION_URL = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0/query";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function getEIAUtility(lat, lon) {
  try {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,STATE,HOLDING_CO",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "1",
    });
    const res = await fetch(`${EIA_UTILITY_URL}?${params}`);
    const data = await res.json();
    const feat = data?.features?.[0]?.attributes;
    if (!feat) return null;
    const name = feat.NAME || feat.HOLDING_CO;
    const state = feat.STATE;
    return state ? `${name} (${state})` : name;
  } catch (e) {
    console.warn("EIA utility lookup failed:", e.message);
    return null;
  }
}

async function getNearestTransmissionLine(lat, lon) {
  try {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: "10",                         // search within 10 miles
      units: "esriSRUnit_StatuteMile",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "VOLTAGE,VOLT_CLASS,TYPE",
      returnGeometry: "true",
      f: "geojson",
      resultRecordCount: "5",
      orderByFields: "",
    });
    const res = await fetch(`${EIA_TRANSMISSION_URL}?${params}`);
    const fc = await res.json();
    const features = fc?.features || [];
    if (!features.length) return { distance_miles: null, voltage: null };

    // Find closest line by checking each feature's coordinates
    let minDist = Infinity;
    let closestVoltage = null;

    for (const f of features) {
      const coords = f.geometry?.coordinates || [];
      // LineString or MultiLineString
      const lines = f.geometry?.type === "MultiLineString" ? coords : [coords];
      for (const line of lines) {
        for (const [flon, flat] of line) {
          const d = haversineMiles(lat, lon, flat, flon);
          if (d < minDist) {
            minDist = d;
            const v = f.properties?.VOLTAGE;
            const vc = f.properties?.VOLT_CLASS;
            closestVoltage = v ? `${v} kV` : (vc || null);
          }
        }
      }
    }

    return {
      distance_miles: minDist < Infinity ? parseFloat(minDist.toFixed(2)) : null,
      voltage: closestVoltage,
    };
  } catch (e) {
    console.warn("Transmission line lookup failed:", e.message);
    return { distance_miles: null, voltage: null };
  }
}

function fiberAssetLabel(tags = {}) {
  if (tags["communication:line"]) return `Fiber/telecom line (${tags["communication:line"]})`;
  if (tags["cable"] === "fibre_optic" || tags["cable"] === "fiber_optic") return "Fiber optic cable";
  if (tags["street_cabinet"] === "telecom") return "Telecom street cabinet";
  if (tags["utility"] === "telecom") return "Telecom utility asset";
  if (tags["telecom"]) return `Telecom ${tags["telecom"]}`;
  return "Mapped telecom infrastructure";
}

function collectGeometryPoints(el) {
  if (el.type === "node" && el.lat && el.lon) return [[el.lat, el.lon]];
  if (Array.isArray(el.geometry)) return el.geometry.map(p => [p.lat, p.lon]).filter(([a, b]) => a && b);
  return [];
}

async function getNearestFiberInfrastructure(lat, lon) {
  const radiusMeters = 8047; // 5 miles
  const query = `[out:json][timeout:20];(
    node["telecom"~"exchange|service_device|connection_point|data_center",i](around:${radiusMeters},${lat},${lon});
    node["street_cabinet"="telecom"](around:${radiusMeters},${lat},${lon});
    node["utility"="telecom"](around:${radiusMeters},${lat},${lon});
    way["communication:line"~"fiber|fibre|optical|telecom",i](around:${radiusMeters},${lat},${lon});
    way["cable"~"fiber_optic|fibre_optic",i](around:${radiusMeters},${lat},${lon});
    way["utility"="telecom"](around:${radiusMeters},${lat},${lon});
    way["telecom"~"line|cable|connection_point",i](around:${radiusMeters},${lat},${lon});
  );out body geom 25;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "SiteHawk/1.0",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) {
        console.warn(`OSM fiber lookup ${res.status} from ${endpoint}`);
        continue;
      }

      const data = await res.json();
      let nearest = null;
      for (const el of data.elements || []) {
        const points = collectGeometryPoints(el);
        for (const [flat, flon] of points) {
          const d = haversineMiles(lat, lon, flat, flon);
          if (!nearest || d < nearest.distance_miles) {
            const tags = el.tags || {};
            nearest = {
              distance_miles: d,
              type: fiberAssetLabel(tags),
              operator: tags.operator || tags.name || tags.owner || null,
            };
          }
        }
      }

      if (!nearest) return { distance_miles: null, type: null, operator: null };
      return {
        distance_miles: parseFloat(nearest.distance_miles.toFixed(2)),
        type: nearest.type,
        operator: nearest.operator,
      };
    } catch (e) {
      console.warn("OSM fiber lookup failed:", e.message);
    }
  }

  return { distance_miles: null, type: null, operator: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    console.log(`FCC+EIA lookup: lat=${lat} lon=${lon}`);

    // Run all lookups in parallel
    const [geoRes, utilityName, txLine, fiberInfra] = await Promise.all([
      fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`).then(r => r.json()),
      getEIAUtility(lat, lon),
      getNearestTransmissionLine(lat, lon),
      getNearestFiberInfrastructure(lat, lon),
    ]);

    const blockGeoid = geoRes?.Block?.FIPS || null;

    // FCC broadband availability
    let fiberProviders = [];
    let hasFiber = null;

    if (blockGeoid) {
      const bbRes = await fetch(`https://broadbandmap.fcc.gov/api/public/map/listAvailability`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'SiteHawk/1.0 (site-hawk-pro.com)',
        },
        body: JSON.stringify({ latitude: lat, longitude: lon, unit_id: '0', limit: 25, offset: 0 }),
      });

      if (bbRes.ok) {
        const bbData = await bbRes.json();
        const providers = bbData?.data || bbData?.availability || [];
        const FIBER_TECH_CODES = [50, 70];
        const allProviders = providers.map(p => ({
          provider_name: p.provider_name || p.dba_name || 'Unknown',
          technology: getTechLabel(p.technology || p.tech_code),
          tech_code: p.technology || p.tech_code,
          max_download_speed: p.max_advertised_download_speed || p.max_download_speed || 0,
          max_upload_speed: p.max_advertised_upload_speed || p.max_upload_speed || 0,
        }));
        fiberProviders = allProviders
          .filter(p => FIBER_TECH_CODES.includes(p.tech_code))
          .map(({ tech_code, ...rest }) => rest);
        hasFiber = fiberProviders.length > 0;
      } else {
        console.warn(`FCC broadband API returned ${bbRes.status}`);
      }
    }

    console.log(`EIA utility: ${utilityName} | TX line: ${txLine.distance_miles} mi (${txLine.voltage})`);

    return Response.json({
      fiber_providers: fiberProviders,
      has_fiber: hasFiber,
      fiber_distance_miles: fiberInfra.distance_miles,
      fiber_infrastructure_type: fiberInfra.type,
      fiber_operator: fiberInfra.operator,
      power_utility: utilityName,
      fcc_block_geoid: blockGeoid,
      transmission_line_distance_miles: txLine.distance_miles,
      transmission_line_voltage: txLine.voltage,
    });

  } catch (error) {
    console.error('fccBroadbandLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getTechLabel(code) {
  const map = {
    10: 'DSL', 11: 'ADSL2', 12: 'VDSL', 20: 'Cable', 30: 'Cable (DOCSIS 3.1)',
    40: 'Fiber', 50: 'Fiber to Premises', 60: 'Satellite', 61: 'LBR Fixed Wireless',
    70: 'Gig Passive Optical', 71: 'xDSL', 72: 'Cable',
    300: 'Licensed Fixed Wireless', 400: 'Unlicensed Fixed Wireless', 0: 'Other',
  };
  return map[code] || `Tech ${code}`;
}