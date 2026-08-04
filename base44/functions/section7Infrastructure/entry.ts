import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * section7Infrastructure — single gated data load for the HAWK INFRASTRUCTURE
 * VISION (Section 6/7). Target A only. AUTHORITATIVE sources only — NO OpenStreetMap
 * Overpass (it was slow/unreliable and hung the whole map chain).
 *
 *   POWER  — high-voltage transmission lines from HIFLD (hifldTransmissionLines,
 *            ArcGIS FeatureServer) within a bbox around Target A, plus the UTILITY
 *            COMPANY to contact + phone via electricProviderContact.
 *   FIBER  — official FCC BDC block-group availability summary and provider count.
 *            No private route, central-office, or lit-building records are inferred.
 *
 * Returns clean arrays for the Mapbox layers + contact cards. Power is delivered
 * as `power.lines` (HIFLD line segments); `power.points` stays empty.
 */

const HIFLD_URL =
  "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0/query";

// Build a WGS84 bbox [w,s,e,n] around a center point given a radius in miles.
function bboxAround(lat, lon, radiusMi) {
  const latPad = radiusMi / 69.0;
  const lonPad = radiusMi / (69.0 * Math.cos((lat * Math.PI) / 180));
  return [lon - lonPad, lat - latPad, lon + lonPad, lat + latPad];
}

// Flatten a GeoJSON LineString / MultiLineString into arrays of [lon,lat] coords.
function lineCoords(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

// Haversine distance in miles between two [lat,lon] points.
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Clip a line's vertex list to only the contiguous runs whose vertices fall
// within keepMi of the center. A single HIFLD line can span 80+ miles, so we
// keep ONLY the portion near Target A (plus one bridging vertex on each side so
// the kept run still connects). Returns an array of coord runs (each ≥2 points).
function clipLineNearCenter(cLat, cLon, coords, keepMi) {
  const near = coords.map(([lon, lat]) => haversineMiles(cLat, cLon, lat, lon) <= keepMi);
  const runs = [];
  let cur = [];
  for (let i = 0; i < coords.length; i++) {
    if (near[i]) {
      // bridge: include the previous vertex so the run enters from outside.
      if (!cur.length && i > 0) cur.push(coords[i - 1]);
      cur.push(coords[i]);
    } else if (cur.length) {
      cur.push(coords[i]); // bridge out
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles = 0.5 } = await req.json();
    const cLat = Number(lat);
    const cLon = Number(lon);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }
    const radiusMi = Number(radius_miles) || 0.5;

    // 1) POWER — HIFLD transmission lines within a bbox around Target A.
    // Called DIRECTLY (the ArcGIS service is public) — no sub-invoke, no OSM.
    let powerLines = [];
    // Only keep transmission lines whose nearest vertex is within this radius of
    // Target A (so the map shows POWER NEAR the target, not far-away lines).
    const powerKeepMi = Math.max(radiusMi, 3);
    try {
      const [w, s, e, n] = bboxAround(cLat, cLon, powerKeepMi);
      // ArcGIS envelope as a comma string "xmin,ymin,xmax,ymax" — the JSON-string
      // form was being ignored by the GeoJSON query, returning unfiltered lines.
      const params = new URLSearchParams({
        where: "1=1",
        geometry: `${w},${s},${e},${n}`,
        geometryType: "esriGeometryEnvelope",
        inSR: "4326", outSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: "OBJECTID,OWNER,VOLTAGE,VOLT_CLASS,TYPE,STATUS",
        returnGeometry: "true", f: "geojson", resultRecordCount: "500",
      });
      const hifldResp = await fetch(`${HIFLD_URL}?${params.toString()}`);
      const fc = hifldResp.ok ? await hifldResp.json() : { features: [] };
      const features = fc.features || [];
      powerLines = features.flatMap((f, fi) => {
        const props = f.properties || {};
        const voltage = props.VOLTAGE && props.VOLTAGE > 0 ? `${props.VOLTAGE} kV` : (props.VOLT_CLASS && props.VOLT_CLASS !== "NOT AVAILABLE" ? props.VOLT_CLASS : null);
        const operator = props.OWNER && props.OWNER !== "NOT AVAILABLE" ? props.OWNER : null;
        // Clip every part to only the run(s) near Target A.
        return lineCoords(f.geometry).flatMap((coords, li) =>
          clipLineNearCenter(cLat, cLon, coords, powerKeepMi).map((run, ri) => ({
            id: `PWR-L-${fi + 1}-${li + 1}-${ri + 1}`,
            coords: run,
            voltage,
            operator,
          }))
        );
      });
      console.log(`[section7Infrastructure] HIFLD line runs within ${powerKeepMi}mi: ${powerLines.length}`);
    } catch (e) {
      console.log(`[section7Infrastructure] HIFLD power lines failed: ${e.message}`);
    }

    // 2) Resolve the utility company to contact (name + phone) for this area.
    // base44.functions.invoke returns the parsed JSON body directly; some SDK
    // versions wrap it in `.data`. Read both so the utility always resolves.
    let utility = null;
    try {
      const contactRes = await base44.functions.invoke('electricProviderContact', { lat: cLat, lon: cLon });
      const body = contactRes?.data ?? contactRes;
      utility = body?.match || null;
    } catch (e) {
      console.log(`[section7Infrastructure] utility contact lookup failed: ${e.message}`);
    }

    // 3) FCC BDC — official block-group fiber availability summary.
    let fccCoverage = null;
    try {
      const fccRes = await base44.functions.invoke('fccBdcConnectivity', { lat: cLat, lon: cLon });
      fccCoverage = fccRes?.data ?? fccRes;
    } catch (e) {
      console.log(`[section7Infrastructure] FCC BDC lookup failed: ${e.message}`);
    }

    const utilityName = utility?.name || null;

    return Response.json({
      center: { lat: cLat, lon: cLon },
      radius_miles: radiusMi,
      utility,                                        // { name, phone, website, ... } | null
      power: {
        points: [],
        lines: powerLines.map((l) => ({ ...l, operator: l.operator || utilityName })),
        count: powerLines.length,
      },
      fiber: {
        // FCC BDC is an availability dataset, not a physical route or facility dataset.
        lines: [],
        points: [],
        count: 0,
      },
      carriers: {
        lit_buildings: [],
        telco: null,
        coverage: fccCoverage,
        count: fccCoverage?.provider_count ?? 0,
      },
    });
  } catch (error) {
    console.error('section7Infrastructure error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}