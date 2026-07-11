// Nearest Police + Fire department (non-emergency contacts) for a Target A point,
// from the PublicSafetyAgency directory (currently FL + GA).
// Police (FBI CDE) records carry coordinates → nearest by distance.
// Fire (USFA registry) records carry address/phone but no coords → matched by county.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const covered = police.length > 0;
    return Response.json({
      state,
      county,
      covered,
      note: covered ? null : `${state} is not in the directory yet — Florida and Georgia are loaded, more states coming soon.`,
      police: nearestPolice ? { ...pick(nearestPolice), distance_mi: Math.round(bestD * 10) / 10 } : null,
      fire: fireMatches.length ? pick(fireMatches[0]) : null,
    });
  } catch (error) {
    console.error('nearestPublicSafetyDept failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});