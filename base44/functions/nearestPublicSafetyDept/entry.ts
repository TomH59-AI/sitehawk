// Nearest Police + Fire department (non-emergency contacts) for a Target A point,
// from the PublicSafetyAgency directory (currently FL + GA).
// Police (FBI CDE) records carry coordinates → nearest by distance.
// Fire (USFA registry) records carry address/phone but no coords → matched by county.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { scrapePsapNonEmergencyPhone } from '../../shared/psapPhoneScrape.ts';

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.7613, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const pick = (a) => a && {
  name: a.name,
  street_address: a.street_address || null,
  city: a.city || null,
  state: a.state,
  zip: a.zip || null,
  phone: a.phone || null,
  website: a.website || null,
  department_type: a.department_type || null,
  county: a.county || null,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    // Resolve state + county via Mapbox reverse geocoding
    const token = Deno.env.get('MAPBOX_API_KEY');
    const geoRes = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=district,region&access_token=${token}`
    );
    const geo = await geoRes.json();
    let state = null, county = null;
    for (const f of geo.features || []) {
      if (f.place_type?.includes('region')) state = (f.properties?.short_code || f.short_code || '').replace('US-', '').toUpperCase();
      if (f.place_type?.includes('district')) county = f.text?.replace(/ County$/i, '').toUpperCase();
    }

    if (!state) return Response.json({ error: 'Could not resolve state for coordinates' }, { status: 422 });

    // Police — nearest by coordinates within the state
    const police = await base44.entities.PublicSafetyAgency.filter({ category: 'police', state }, undefined, 5000);
    let nearestPolice = null, bestD = Infinity;
    for (const p of police) {
      if (p.latitude == null || p.longitude == null) continue;
      const d = haversineMi(lat, lon, p.latitude, p.longitude);
      if (d < bestD) { bestD = d; nearestPolice = p; }
    }

    // Fire — matched by county (registry has no coordinates)
    let fireMatches = [];
    if (county) {
      fireMatches = await base44.entities.PublicSafetyAgency.filter({ category: 'fire', state, county }, undefined, 100);
    }
    // Prefer Career departments (staffed non-emergency lines), then any with a phone.
    fireMatches.sort((a, b) =>
      (b.department_type === 'Career') - (a.department_type === 'Career') || (!!b.phone - !!a.phone)
    );

    // 911 PSAP — nearest primary answering point from the FCC Master PSAP Registry.
    // Registry has no address/phone, so enrich via web-grounded lookup.
    let psap = null;
    try {
      const psaps = await base44.entities.PSAP.filter({ state }, undefined, 5000);
      const isPrimary = (p) => !/orphaned|secondary|duplicate/i.test(p.type_of_change || '');
      const coordsOf = (p) => {
        const m = (p.geocode_city_level || '').match(/\((-?\d+\.?\d*),\s*(-?\d+\.?\d*)\)/);
        return m ? [Number(m[1]), Number(m[2])] : null;
      };
      let candidates = county
        ? psaps.filter((p) => (p.county || '').toUpperCase() === county && isPrimary(p))
        : [];
      if (!candidates.length) candidates = psaps.filter(isPrimary);
      let best = null, bestPD = Infinity;
      for (const p of candidates) {
        const c = coordsOf(p);
        const d = c ? haversineMi(lat, lon, c[0], c[1]) : Infinity;
        if (d < bestPD || (!best && d === Infinity)) { best = p; bestPD = d; }
      }
      if (best) {
        psap = {
          psap_id: best.psap_id,
          name: best.psap_name,
          county: best.county || null,
          city: best.city || null,
          state: best.state,
          distance_mi: Number.isFinite(bestPD) ? Math.round(bestPD * 10) / 10 : null,
          address: null,
          phone: null,
          phone_source: null,
          phone_source_url: null,
        };
        // 1) Scrapfly — read the number off the agency's own public page.
        const scraped = await scrapePsapNonEmergencyPhone(best, Deno.env.get('SCRAPFLY_API_KEY'));
        if (scraped) {
          psap.phone = scraped.phone;
          psap.phone_source = 'source-scraped';
          psap.phone_source_url = scraped.source_url;
        }
        // 2) Web-grounded lookup — address always, phone only if scraping found none.
        try {
          const info = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Find the public NON-EMERGENCY administrative contact information for this 911 dispatch center (PSAP): "${best.psap_name}" in ${best.city || best.county}, ${best.state} (${best.county} County). Return its street/mailing address and its non-emergency (administrative) phone number. Do NOT return 911. If a value cannot be verified, return null for it.`,
            add_context_from_internet: true,
            response_json_schema: {
              type: 'object',
              properties: {
                address: { type: ['string', 'null'] },
                phone: { type: ['string', 'null'] },
              },
            },
          });
          if (info?.address) psap.address = info.address;
          if (!psap.phone && info?.phone && !/^9-?1-?1$/.test(String(info.phone).trim())) {
            psap.phone = info.phone;
            psap.phone_source = 'web-grounded-unverified';
          }
        } catch (e) {
          console.warn('PSAP contact enrichment failed:', e.message);
        }
      }
    } catch (e) {
      console.warn('PSAP lookup failed:', e.message);
    }

    const covered = police.length > 0;
    return Response.json({
      state,
      county,
      covered,
      note: covered ? null : `${state} is not in the directory yet — Florida and Georgia are loaded, more states coming soon.`,
      police: nearestPolice ? { ...pick(nearestPolice), distance_mi: Math.round(bestD * 10) / 10 } : null,
      fire: fireMatches.length ? pick(fireMatches[0]) : null,
      psap,
    });
  } catch (error) {
    console.error('nearestPublicSafetyDept failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});