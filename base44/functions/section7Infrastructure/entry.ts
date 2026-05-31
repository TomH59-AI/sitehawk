import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * section7Infrastructure — single gated data load for the HAWK INFRASTRUCTURE
 * VISION (Section 7). Target A only. Pulls the SAME working sources the app
 * already uses, within the SARF radius around Target A:
 *
 *   POWER  — power poles + transformers (and substations) from the existing
 *            infrastructureAssets source (OSM Overpass "powertransmissionpoles"
 *            style points), enriched with the UTILITY COMPANY to contact + phone
 *            via the existing electricProviderContact directory lookup.
 *   FIBER  — fiber runs (lines) + splice points / handholes (markers) from the
 *            same infrastructureAssets fiber source the app uses now.
 *
 * Returns clean GeoJSON-ready arrays for the Mapbox layers + contact cards.
 */

const MI_TO_M = 1609.34;

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

    const radius_m = Math.round(Number(radius_miles) * MI_TO_M);

    // 1) Pull the existing infrastructure assets (power + fiber) for the radius.
    const assetsRes = await base44.functions.invoke('infrastructureAssets', {
      lat: cLat, lon: cLon, radius_m,
    });
    const assets = assetsRes?.data || {};
    const electric = assets.electric || { points: [], lines: [] };
    const fiber = assets.fiber || { points: [], lines: [] };

    // 2) Resolve the utility company to contact (name + phone) for this area.
    let utility = null;
    try {
      const contactRes = await base44.functions.invoke('electricProviderContact', {
        lat: cLat, lon: cLon,
      });
      utility = contactRes?.data?.match || null;
    } catch (e) {
      console.log(`[section7Infrastructure] utility contact lookup failed: ${e.message}`);
    }

    // ── POWER points: poles + transformers (+ substations) as markers ──
    const utilityName = utility?.name || null;
    const utilityPhone = utility?.phone || null;
    const powerPoints = (electric.points || []).map((p, i) => ({
      id: `PWR-${i + 1}`,
      kind: p.kind,                                   // pole | transformer | substation | tower
      lat: p.lat,
      lon: p.lon,
      voltage: p.voltage || null,
      operator: p.operator || utilityName,            // mapped operator, else area utility
      utility_company: utilityName,
      utility_phone: utilityPhone,
    }));

    // ── FIBER: runs (lines) + splice points / handholes (markers) ──
    const fiberLines = (fiber.lines || []).map((l, i) => ({
      id: `FIB-L-${i + 1}`,
      coords: l.coords,                               // [[lon,lat], ...]
      fiber_company: l.operator || null,
    }));
    const fiberPoints = (fiber.points || []).map((p, i) => ({
      id: `FIB-P-${i + 1}`,
      kind: p.kind,                                   // splice | manhole | telecom | exchange
      lat: p.lat,
      lon: p.lon,
      fiber_company: p.operator || null,
    }));

    return Response.json({
      center: { lat: cLat, lon: cLon },
      radius_miles: Number(radius_miles),
      utility,                                        // { name, phone, website, ... } | null
      power: {
        points: powerPoints,
        count: powerPoints.length,
      },
      fiber: {
        lines: fiberLines,
        points: fiberPoints,
        count: fiberLines.length + fiberPoints.length,
      },
    });
  } catch (error) {
    console.error('section7Infrastructure error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});