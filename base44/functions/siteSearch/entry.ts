import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ────────────────────────────────────────────────────────────────────────────
// SiteSearch — Realie API is now the SINGLE source of parcel data.
// All previous sources (state-level ArcGIS, county feeds, Regrid, Supabase
// scip_parcels cache) have been removed per requirements.
// ────────────────────────────────────────────────────────────────────────────

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
const REALIE_API_KEY = Deno.env.get("REALIE_API_KEY");

// ── Helpers ─────────────────────────────────────────────────────────────────
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Map Realie useCode → zoning label (for residential filtering + display)
function useCodeToZoning(code, zoningCode) {
  if (zoningCode) return zoningCode;
  const c = parseInt(code) || 0;
  if (c >= 1000 && c <= 1999) return "Residential";
  if (c >= 2000 && c <= 2999) return "Commercial";
  if (c >= 3000 && c <= 3999) return "Commercial Office";
  if (c >= 4000 && c <= 4999) return "Recreational";
  if (c >= 5000 && c <= 5999) return "Industrial";
  if (c >= 6000 && c <= 6999) return "Agricultural";
  if (c >= 7000 && c <= 7999) return "Vacant / Special";
  if (c >= 8000 && c <= 8999) return "Public / Institutional";
  if (c >= 9000 && c <= 9999) return "Government / Exempt";
  return code ? `UC-${code}` : "Unknown";
}

function isResidentialUseCode(code) {
  const c = parseInt(code) || 0;
  return c >= 1000 && c <= 1999;
}

function zoningBonus(useCode) {
  const c = parseInt(useCode) || 0;
  if (c >= 6000 && c <= 6999) return 8;  // agricultural / vacant ag
  if (c >= 5000 && c <= 5999) return 5;  // industrial
  if (c >= 2000 && c <= 3999) return 4;  // commercial / office
  if (c >= 7000 && c <= 7999) return 10; // vacant / undeveloped
  if (c >= 1000 && c <= 1999) return -8; // residential
  if (c >= 8000 && c <= 9999) return -15; // institutional / government
  return 0;
}

function genericScore(acres, distMeters, useCode) {
  let score = 65;
  if (acres >= 5) score += 15;
  else if (acres >= 2) score += 8;
  else if (acres > 0 && acres < 0.25) score -= 15;
  const distMiles = distMeters / 1609.344;
  if (distMiles <= 0.1) score += 5;
  else if (distMiles > 0.4) score -= 5;
  score += zoningBonus(useCode);
  return Math.max(10, Math.min(99, Math.round(score)));
}

function normalizeRealie(p, centerLat, centerLon) {
  if (p.latitude == null || p.longitude == null) return null;
  const distMeters = haversineMeters(centerLat, centerLon, p.latitude, p.longitude);

  const acres = p.acres != null ? parseFloat(parseFloat(p.acres).toFixed(2)) : null;
  const zoning = useCodeToZoning(p.useCode, p.zoningCode);

  const physAddr = [p.addressRaw, p.city, p.state, p.zipCode].filter(Boolean).join(", ");
  const mailingAddr = [
    p.mailerAddress || p.ownerAddressLine1,
    p.mailingCity || p.ownerCity,
    p.mailingState || p.ownerState,
    p.mailingZip5 || p.ownerZipCode,
  ].filter(Boolean).join(", ");

  return {
    site_name: physAddr || `Realie Parcel ${p.parcelId}`,
    owner_name: p.ownerName || "Unknown Owner",
    parcel_address: physAddr || "—",
    parcel_id: p.parcelId || "—",
    parcel_size_acres: acres,
    zoning,
    owner_mailing_address: mailingAddr || null,
    latitude: p.latitude,
    longitude: p.longitude,
    parcel_geometry: null, // Realie does not return parcel polygons
    fema_risk: null,
    phone: null,
    email: null,
    // Assessed / market values (preserved for SCIP downstream)
    land_value: p.totalLandValue ?? p.assessedLandValue ?? null,
    improvement_value: p.assessedBuildingValue ?? null,
    total_value: p.totalAssessedValue ?? p.totalMarketValue ?? null,
    sale_date: p.transferDate || p.purchaseSaleDate || null,
    county: p.county || null,
    state: p.state || null,
    use_code: p.useCode || null,
    match_score: genericScore(acres || 0, distMeters, p.useCode),
    match_reason: `Realie cadastral · ${zoning} · ${acres ? acres + " acres" : "size unknown"} · ${(distMeters / 1609.344).toFixed(2)} mi`,
  };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_MINUTE = 5;

function isRateLimited(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= MAX_REQUESTS_PER_MINUTE) return true;
  entry.count++;
  rateLimitMap.set(userId, entry);
  return false;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const tier = user.tier || 'blind';
    const isFreeTrialEligible = (tier === 'blind' || tier === 'free') && !user.free_trial_used;

    if ((tier === 'blind' || tier === 'free') && !isFreeTrialEligible) {
      return Response.json({ error: 'Upgrade required' }, { status: 403 });
    }

    if (isFreeTrialEligible) {
      console.log(`Free trial scan: user=${user.email}`);
      const users = await base44.asServiceRole.entities.User.filter({ email: user.email });
      if (users.length) {
        await base44.asServiceRole.entities.User.update(users[0].id, { free_trial_used: true });
      }
    }

    if (isRateLimited(user.id)) {
      console.warn(`Rate limit hit for user: ${user.email}`);
      return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    if (!REALIE_API_KEY) {
      console.error("REALIE_API_KEY is not set");
      return Response.json({ error: "Parcel data service is not configured." }, { status: 500 });
    }

    const body = await req.json();
    const { lat, lon, radius_miles } = body;

    if (!lat || !lon) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    // Realie Location Search caps at 2 miles, max 100 results
    const radiusMiles = Math.min(parseFloat(radius_miles) || 0.5, 2);

    const url = `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=${radiusMiles}&limit=100`;
    console.log(`Realie scan: user=${user.email} lat=${lat} lon=${lon} radius=${radiusMiles}mi`);

    let data;
    try {
      const res = await fetch(url, { headers: { "Authorization": REALIE_API_KEY } });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Realie HTTP ${res.status}: ${text}`);
        return Response.json({
          error: `Parcel data service returned ${res.status}. Please try again.`,
        }, { status: 502 });
      }
      data = await res.json();
    } catch (e) {
      console.error(`Realie network error: ${e.message}`);
      return Response.json({
        error: "Parcel data service is temporarily unavailable. Please try again.",
      }, { status: 502 });
    }

    const properties = Array.isArray(data?.properties) ? data.properties : [];

    // Normalize, drop residential, sort by score, take top 5
    const candidates = properties
      .filter((p) => !isResidentialUseCode(p.useCode))
      .map((p) => normalizeRealie(p, lat, lon))
      .filter(Boolean)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 5);

    return Response.json({
      candidates,
      ordinance: null,
      source: "realie",
      total_returned: properties.length,
    });

  } catch (error) {
    console.error('siteSearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});