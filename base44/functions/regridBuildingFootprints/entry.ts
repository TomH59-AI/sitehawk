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
  const s = `${p?.usedesc || ""} ${p?.zoning || ""} ${p?.zoning_description || ""} ${p?.lbcs_activity_desc || ""}`.toLowerCase();
  return /resid|single family|multi family|duplex|dwelling|mobile home|apartment|condo|townho/.test(s);
};

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
      console.log(`[ERROR] Regrid HTTP ${r.status}: ${JSON.stringify(j).slice(0, 500)}`);
      return Response.json({ error: `Regrid HTTP ${r.status}`, detail: j }, { status: 502 });
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