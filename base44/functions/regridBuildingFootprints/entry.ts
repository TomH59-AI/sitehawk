import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * regridBuildingFootprints — Regrid Premium "Matched Building Footprints" add-on.
 * Given a point + radius, returns real building footprint polygons near the
 * tower location so the Tower Siter can measure separation to the EDGE of each
 * structure (not a point). Each footprint carries its parcel context
 * (address, land use, zoning) so residential structures can be flagged.
 *
 * Payload: { lat, lon, radius_ft?: number (default 500, max 2500) }
 * Returns: { buildings: FeatureCollection, count, parcels_scanned }
 */

const isResidential = (p) => {
  const s = `${p?.usedesc || ""} ${p?.zoning || ""} ${p?.zoning_description || ""} ${p?.lbcs_activity_desc || ""} ${p?.building || ""}`.toLowerCase();
  return /resid|single family|multi family|duplex|dwelling|mobile home|apartment|condo|townho|house/.test(s);
};

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

async function osmBuildings(lat, lon, radiusM) {
  const query = `[out:json][timeout:25];way(around:${radiusM},${lat},${lon})[building];(._;>;);out body;`;
  let lastError = "No Overpass endpoint responded";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SiteHawk-TowerSiter/1.0" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!response.ok) { lastError = `Overpass HTTP ${response.status}`; continue; }
      const data = await response.json();
      const nodes = new Map((data.elements || []).filter((item) => item.type === "node").map((item) => [item.id, [item.lon, item.lat]]));
      const features = (data.elements || []).filter((item) => item.type === "way" && item.tags?.building && item.nodes?.length >= 4).map((item) => {
        const coordinates = item.nodes.map((id) => nodes.get(id)).filter(Boolean);
        if (coordinates.length < 4) return null;
        if (coordinates[0][0] !== coordinates.at(-1)[0] || coordinates[0][1] !== coordinates.at(-1)[1]) coordinates.push(coordinates[0]);
        return {
          type: "Feature",
          properties: {
            id: `osm-way-${item.id}`,
            parcel_address: [item.tags?.["addr:housenumber"], item.tags?.["addr:street"]].filter(Boolean).join(" ") || null,
            building: item.tags.building,
            residential: isResidential(item.tags),
            source: "OpenStreetMap",
          },
          geometry: { type: "Polygon", coordinates: [coordinates] },
        };
      }).filter(Boolean);
      return { type: "FeatureCollection", features };
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(lastError);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_ft = 500 } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }
    const token = Deno.env.get('REGRID_API_KEY');
    if (!token) return Response.json({ error: 'REGRID_API_KEY not set' }, { status: 500 });

    const radiusM = Math.min(Math.round(Number(radius_ft) * 0.3048), 762); // cap ~2500 ft

    const url = new URL('https://app.regrid.com/api/v2/parcels/point');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('radius', String(radiusM));
    url.searchParams.set('limit', '100');
    url.searchParams.set('return_matched_buildings', 'true');
    url.searchParams.set('token', token);

    const r = await fetch(url.toString());
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.warn(`Regrid matched buildings unavailable (${r.status}); using OpenStreetMap building footprints.`);
      const buildings = await osmBuildings(Number(lat), Number(lon), radiusM);
      return Response.json({ buildings, count: buildings.features.length, parcels_scanned: 0, source: "OpenStreetMap" });
    }

    const parcelFeats = j?.parcels?.features || [];
    const buildings = [];
    for (const f of parcelFeats) {
      const p = f?.properties?.fields || f?.properties || {};
      const ctx = {
        parcel_address: p.address || p.saddress || null,
        usedesc: p.usedesc || null,
        zoning: p.zoning || null,
        residential: isResidential(p),
      };
      // Matched buildings appear under properties.buildings (array of features
      // or geometries) — handle both shapes defensively.
      const blds = f?.properties?.buildings || f?.buildings || [];
      for (const b of blds) {
        const geom = b?.geometry || (b?.type && b?.coordinates ? b : null);
        if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) continue;
        buildings.push({
          type: 'Feature',
          properties: { ...ctx, ...(b?.properties || {}) },
          geometry: geom,
        });
      }
    }

    return Response.json({
      buildings: { type: 'FeatureCollection', features: buildings },
      count: buildings.length,
      parcels_scanned: parcelFeats.length,
    });
  } catch (error) {
    console.log(`[ERROR] regridBuildingFootprints: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});