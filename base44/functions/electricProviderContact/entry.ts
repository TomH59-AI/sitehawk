import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Haversine distance in miles
function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function norm(s) {
  return (s || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * electricProviderContact — finds electric provider contact info (name, phone,
 * website) for a search area. Matches the ElectricProvider directory by:
 *   1) owner_name (if provided, e.g. from PowerTransmissionLine.owner) — fuzzy name match
 *   2) nearest provider by coordinates
 *   3) optionally filtered by zip / state
 * Returns the best match + a few nearby alternatives.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { lat, lon, zip, state, owner_name } = body || {};

    if ((lat == null || lon == null) && !zip && !owner_name) {
      return Response.json({ error: 'Provide lat/lon, zip, or owner_name' }, { status: 400 });
    }

    // Narrow the candidate set: prefer state filter to keep it small & fast.
    let candidates = [];
    if (state) {
      candidates = await base44.asServiceRole.entities.ElectricProvider.filter(
        { STATE: state.toUpperCase() }, undefined, 2000
      );
    } else if (zip) {
      candidates = await base44.asServiceRole.entities.ElectricProvider.filter(
        { ZIP: String(zip) }, undefined, 500
      );
    }
    // Fallback: if state/zip yielded nothing, pull full list (2325 rows is fine)
    if (!candidates.length) {
      candidates = await base44.asServiceRole.entities.ElectricProvider.list(undefined, 3000);
    }

    if (!candidates.length) {
      return Response.json({ match: null, nearby: [], reason: 'no_providers_in_directory' });
    }

    // 1) Try owner-name match first (exact-ish), e.g. transmission line owner
    let nameMatch = null;
    if (owner_name) {
      const target = norm(owner_name);
      nameMatch = candidates.find((c) => {
        const n = norm(c.NAME);
        return n === target || n.includes(target) || target.includes(n);
      });
    }

    // 2) Distance ranking (if coords available)
    let ranked = candidates;
    if (lat != null && lon != null) {
      ranked = candidates
        .filter((c) => c.LATITUDE != null && c.LONGITUDE != null)
        .map((c) => ({
          ...c,
          distance_miles: parseFloat(
            haversineMiles(Number(lat), Number(lon), Number(c.LATITUDE), Number(c.LONGITUDE)).toFixed(2)
          ),
        }))
        .sort((a, b) => a.distance_miles - b.distance_miles);
    }

    const toContact = (c) => c ? {
      name: c.NAME,
      type: c.TYPE || null,
      phone: c.TELEPHONE || null,
      website: c.WEBSITE || null,
      address: [c.ADDRESS, c.CITY, c.STATE, c.ZIP].filter(Boolean).join(', '),
      city: c.CITY || null,
      state: c.STATE || null,
      zip: c.ZIP || null,
      county: c.ZIP_COUNTY || null,
      latitude: c.LATITUDE != null ? Number(c.LATITUDE) : null,
      longitude: c.LONGITUDE != null ? Number(c.LONGITUDE) : null,
      distance_miles: c.distance_miles ?? null,
    } : null;

    // Prefer the name match; otherwise nearest by distance.
    const best = nameMatch || ranked[0] || null;

    return Response.json({
      match: toContact(best),
      match_source: nameMatch ? 'owner_name' : (lat != null ? 'nearest_coordinates' : 'directory'),
      nearby: ranked.slice(0, 5).map(toContact),
      total_in_scope: candidates.length,
    });
  } catch (error) {
    console.log(`[ERROR] electricProviderContact: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});