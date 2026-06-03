import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * section7Infrastructure — single gated data load for the HAWK INFRASTRUCTURE
 * VISION (Section 6/7). Target A only. AUTHORITATIVE sources only — NO OpenStreetMap
 * Overpass (it was slow/unreliable and hung the whole map chain).
 *
 *   POWER  — high-voltage transmission lines from HIFLD (hifldTransmissionLines,
 *            ArcGIS FeatureServer) within a bbox around Target A, plus the UTILITY
 *            COMPANY to contact + phone via electricProviderContact.
 *   FIBER  — fiber-lit buildings (named carriers) + incumbent telco contact from
 *            CarrierFinder (carrierFinderFiber).
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

Deno.serve(async (req) => {
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
    try {
      const [w, s, e, n] = bboxAround(cLat, cLon, Math.max(radiusMi, 1.5)); // widen so we catch nearby lines
      const params = new URLSearchParams({
        where: "1=1",
        geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
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
        return lineCoords(f.geometry).map((coords, li) => ({
          id: `PWR-L-${fi + 1}-${li + 1}`,
          coords,
          voltage: props.VOLTAGE && props.VOLTAGE > 0 ? `${props.VOLTAGE} kV` : (props.VOLT_CLASS && props.VOLT_CLASS !== "NOT AVAILABLE" ? props.VOLT_CLASS : null),
          operator: props.OWNER && props.OWNER !== "NOT AVAILABLE" ? props.OWNER : null,
        }));
      });
    } catch (e) {
      console.log(`[section7Infrastructure] HIFLD power lines failed: ${e.message}`);
    }

    // 2) Resolve the utility company to contact (name + phone) for this area.
    let utility = null;
    try {
      const contactRes = await base44.functions.invoke('electricProviderContact', { lat: cLat, lon: cLon });
      utility = contactRes?.data?.match || null;
    } catch (e) {
      console.log(`[section7Infrastructure] utility contact lookup failed: ${e.message}`);
    }

    // 3) CarrierFinder — fiber-lit buildings (named carriers) + incumbent telco.
    let litBuildings = [];
    let telco = null;
    try {
      const cfRes = await base44.functions.invoke('carrierFinderFiber', {
        lat: cLat, lon: cLon, radius_miles: radiusMi,
      });
      litBuildings = cfRes?.data?.lit_buildings || [];
      telco = cfRes?.data?.telco || null;
    } catch (e) {
      console.log(`[section7Infrastructure] CarrierFinder lookup failed: ${e.message}`);
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
        // Fiber runs/splices came only from OSM — removed. CarrierFinder lit
        // buildings now carry the fiber story (see `carriers`).
        lines: [],
        points: [],
        count: 0,
      },
      carriers: {
        lit_buildings: litBuildings,
        telco,
        count: litBuildings.length,
      },
    });
  } catch (error) {
    console.error('section7Infrastructure error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});