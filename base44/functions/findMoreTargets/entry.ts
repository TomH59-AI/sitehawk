import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SiteHawk — Find 5 More Targets ($1 add-on).
// Reuses the proven realieParcelsInRing lookup, then scores parcels for
// tower-lease friendliness (bigger lots + closer = better) and returns the 5
// best NEW targets (excluding owners already in the user's list). Falls back to
// the situs parcel address when no separate owner mailing address is available.

function haversineMiles(a, b, c, d) {
  const R = 3958.8, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(c - a), dLon = toRad(d - b);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function scoreParcel(p, centerLat, centerLon) {
  let score = 0;
  const lu = String(p.land_use || "").toLowerCase();
  if (/vacant|agri|farm|ranch|timber|rural|undevelop/.test(lu)) score += 40;
  const acres = Number(p.acreage || 0) || 0;
  if (acres >= 5) score += 30;
  else if (acres >= 1) score += 18;
  else if (acres > 0) score += 6;
  if (p.latitude && p.longitude) {
    const dist = haversineMiles(centerLat, centerLon, Number(p.latitude), Number(p.longitude));
    score += Math.max(0, 25 - dist * 10); // closer = better
  }
  return score;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, exclude_owners = [], limit = 5 } = (await req.json()) ?? {};
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    // Same Realie Location Search the rest of the pipeline uses (max radius 2mi, 100 results).
    const url = `https://app.realie.ai/api/public/property/location/?latitude=${lat}&longitude=${lon}&radius=1&limit=100`;
    const r = await fetch(url, { headers: { Authorization: apiKey } });
    if (!r.ok) {
      const txt = await r.text();
      return Response.json({ error: `Realie HTTP ${r.status}: ${txt.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    const items = data.properties || data.results || (Array.isArray(data) ? data : []);
    const parcels = items.map((p) => ({
      owner_name: p.ownerName || p.owner_name || p.owner || null,
      parcel_address: p.address || p.fullAddress || p.site_address || null,
      mailing_address: p.ownerMailingAddress ||
        [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip].filter(Boolean).join(", ") || null,
      acreage: p.acres || p.acreage || p.lotSizeAcres || null,
      land_use: p.landUse || p.land_use || p.useDescription || p.zoning || null,
      latitude: p.latitude || p.lat || null,
      longitude: p.longitude || p.lon || p.lng || null,
    }));

    const excluded = new Set(exclude_owners.map((o) => String(o || "").trim().toLowerCase()));

    const ranked = parcels
      .filter((p) => p.owner_name && !excluded.has(p.owner_name.trim().toLowerCase()))
      // need somewhere to mail to — fall back to the situs address.
      .filter((p) => p.mailing_address || p.parcel_address)
      .map((p) => ({ ...p, _score: scoreParcel(p, Number(lat), Number(lon)) }))
      .sort((a, b) => b._score - a._score);

    const seen = new Set();
    const targets = [];
    for (const p of ranked) {
      const k = p.owner_name.trim().toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      targets.push({
        owner_name: p.owner_name,
        parcel_address: p.parcel_address,
        mailing_address: p.mailing_address || p.parcel_address,
        acreage: p.acreage,
        land_use: p.land_use,
        latitude: p.latitude,
        longitude: p.longitude,
      });
      if (targets.length >= limit) break;
    }

    console.log(`findMoreTargets: ${targets.length} new targets from ${parcels.length} parcels near ${lat},${lon} for ${user.email}`);
    return Response.json({ count: targets.length, targets });
  } catch (error) {
    console.error("findMoreTargets error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});