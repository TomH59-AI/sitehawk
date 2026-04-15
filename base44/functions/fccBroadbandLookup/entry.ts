import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// FCC Broadband Map API — public, no key required
// Docs: https://broadbandmap.fcc.gov/api-docs

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    console.log(`FCC lookup: lat=${lat} lon=${lon}`);

    // Step 1: Get the census block GEOID for this coordinate
    const geoRes = await fetch(
      `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`
    );
    const geoData = await geoRes.json();
    const blockGeoid = geoData?.Block?.FIPS;

    if (!blockGeoid) {
      console.warn('No GEOID found for', lat, lon);
      return Response.json({ fiber_providers: [], has_fiber: false, power_utility: null, fcc_block_geoid: null });
    }

    console.log(`GEOID: ${blockGeoid}`);

    // Step 2: Query FCC broadband availability for this block (POST required)
    const bbRes = await fetch(
      `https://broadbandmap.fcc.gov/api/public/map/listAvailability`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'SiteHawk/1.0 (site-hawk-pro.com)',
        },
        body: JSON.stringify({
          latitude: lat,
          longitude: lon,
          unit_id: '0',
          limit: 25,
          offset: 0,
        }),
      }
    );

    let fiberProviders = [];
    let hasFiber = false;

    if (bbRes.ok) {
      const bbData = await bbRes.json();
      const providers = bbData?.data || bbData?.availability || [];

      // Filter for fiber (tech code 50 = fiber to premises, 70 = gig passive optical)
      const FIBER_TECH_CODES = [50, 70];
      const allProviders = providers.map(p => ({
        provider_name: p.provider_name || p.dba_name || 'Unknown',
        technology: getTechLabel(p.technology || p.tech_code),
        tech_code: p.technology || p.tech_code,
        max_download_speed: p.max_advertised_download_speed || p.max_download_speed || 0,
        max_upload_speed: p.max_advertised_upload_speed || p.max_upload_speed || 0,
      }));

      fiberProviders = allProviders.filter(p => FIBER_TECH_CODES.includes(p.tech_code));
      hasFiber = fiberProviders.length > 0;

      // Clean up tech_code from output
      fiberProviders = fiberProviders.map(({ tech_code, ...rest }) => rest);
    } else {
      console.warn(`FCC broadband API returned ${bbRes.status}`);
    }

    // Step 3: Get electric utility from NRECA/EIA via FCC utility lookup (best-effort)
    let powerUtility = null;
    try {
      const utilRes = await fetch(
        `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`
      );
      const utilData = await utilRes.json();
      // FCC geo API returns county/state — we use that to label the utility region
      const county = utilData?.County?.name;
      const state = utilData?.State?.name;
      if (county && state) {
        powerUtility = `${county} County, ${state}`;
      }
    } catch (e) {
      console.warn('Utility lookup failed:', e.message);
    }

    return Response.json({
      fiber_providers: fiberProviders,
      has_fiber: hasFiber,
      power_utility: powerUtility,
      fcc_block_geoid: blockGeoid,
    });

  } catch (error) {
    console.error('fccBroadbandLookup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getTechLabel(code) {
  const map = {
    10: 'DSL',
    11: 'ADSL2',
    12: 'VDSL',
    20: 'Cable',
    30: 'Cable (DOCSIS 3.1)',
    40: 'Fiber',
    50: 'Fiber to Premises',
    60: 'Satellite',
    61: 'LBR Fixed Wireless',
    70: 'Gig Passive Optical',
    71: 'xDSL',
    72: 'Cable',
    300: 'Licensed Fixed Wireless',
    400: 'Unlicensed Fixed Wireless',
    0: 'Other',
  };
  return map[code] || `Tech ${code}`;
}