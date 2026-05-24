/**
 * generatePropertyInfoTargets
 *
 * Pulls parcels within 1-mile ring via Realie, filters out residential zoning,
 * ranks remaining parcels by ordinance fit (setback + height + fall-zone + tower-type
 * + SUP-allowed zoning), picks Top 3. Target A is the best.
 *
 * Skip-traces Target A only via Enformion (Supabase sitehawk-skip-trace edge fn).
 * Saves all 3 as CRMDeal records.
 *
 * Output shape:
 *   { targets: [{label:"A", ...}, {label:"B", ...}, {label:"C", ...}], saved_deal_ids: [...] }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
const SKIPTRACE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-skip-trace";

// ─── Residential exclusion ─────────────────────────────────────────────────
// Reject parcels whose zoning / land use clearly indicates residential.
const RESIDENTIAL_PATTERNS = [
  /\bresidential\b/i,
  /\bsingle.?family\b/i,
  /\bmulti.?family\b/i,
  /\bduplex\b/i,
  /\btownhouse\b/i,
  /\bcondo\b/i,
  /\bapartment\b/i,
  /\bmobile home\b/i,
  /^R-?\d/i,    // R-1, R1, R-2, R2A...
  /^RS-?\d/i,   // RS-1
  /^RM-?\d/i,   // RM-1
  /^RR\b/i,     // RR rural residential
];

function isResidential(p) {
  const txt = `${p.land_use || ""} ${p.zoning || ""}`.trim();
  if (!txt) return false; // unknown — don't exclude
  return RESIDENTIAL_PATTERNS.some((re) => re.test(txt));
}

// ─── Realie ────────────────────────────────────────────────────────────────
function normalizeRealie(p) {
  return {
    apn: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    owner_name: p.ownerName || p.owner_name || p.owner || null,
    mailing_address:
      p.ownerMailingAddress ||
      [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip]
        .filter(Boolean)
        .join(", ") ||
      null,
    parcel_address: p.address || p.fullAddress || p.site_address || null,
    acreage: p.acres || p.acreage || p.lotSizeAcres || null,
    land_use: p.landUse || p.land_use || p.useDescription || null,
    zoning: p.zoning || p.zoning_code || null,
    latitude: p.latitude || p.lat || null,
    longitude: p.longitude || p.lon || p.lng || null,
  };
}

async function fetchRealieParcels(lat, lon, apiKey) {
  const url = `${REALIE_URL}?latitude=${lat}&longitude=${lon}&radius=1&limit=100`;
  const r = await fetch(url, { headers: { Authorization: apiKey } });
  if (!r.ok) throw new Error(`Realie HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const items = data.properties || data.results || (Array.isArray(data) ? data : []);
  return items.map(normalizeRealie).filter((p) => p.apn || p.owner_name || p.parcel_address);
}

// ─── Ordinance-fit ranking ─────────────────────────────────────────────────
// Required parcel footprint in feet = tower height (fall zone) + 2 * setback, then 100x100 compound.
// We require acreage >= computedMinAcres. Score = (acreage / minAcres) * 100, capped at 200.
// Non-residential, non-residential zoning code adjacency bumps score. Zoning that explicitly
// allows wireless via SUP (A-1, AG, I-1, I-2, M-1, C-2, PUD, etc.) gets +25.
const SUP_FRIENDLY_PATTERNS = [
  /\bA-?\d?\b/i,    // Agricultural
  /\bAG\b/i,
  /\bI-?\d\b/i,     // Industrial
  /\bM-?\d\b/i,     // Manufacturing
  /\bC-?[23]\b/i,   // Heavier commercial
  /\bPUD\b/i,
  /\bRU\b/i,        // Rural
  /\bU\b/i,         // Utility
];

function computeMinAcres(towerHeightFt, setbackFt) {
  // Need square that contains: fall-zone radius (= tower height) + setback on each side + 100ft compound
  const sideFt = (towerHeightFt * 2) + (setbackFt * 2) + 100;
  const sqFt = sideFt * sideFt;
  return sqFt / 43560;
}

function scoreParcel(p, ctx) {
  const acreage = Number(p.acreage) || 0;
  if (acreage < ctx.minAcres) return -1; // disqualified
  let score = Math.min((acreage / ctx.minAcres) * 100, 200);

  const zoningText = `${p.zoning || ""} ${p.land_use || ""}`;
  if (SUP_FRIENDLY_PATTERNS.some((re) => re.test(zoningText))) score += 25;

  // Distance penalty — closer to search center is better
  if (p.latitude != null && p.longitude != null && ctx.lat != null && ctx.lon != null) {
    const dLat = (p.latitude - ctx.lat) * 69;
    const dLon = (p.longitude - ctx.lon) * 54.6;
    const distMiles = Math.sqrt(dLat * dLat + dLon * dLon);
    score -= distMiles * 5; // 5 pts per mile
  }
  return score;
}

// ─── Jurisdiction (FCC) ────────────────────────────────────────────────────
async function getJurisdiction(lat, lon) {
  try {
    const r = await fetch(
      `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`
    );
    const d = await r.json();
    const county = d?.County?.name;
    const state = d?.State?.code;
    if (!county) return state || "";
    // FCC sometimes returns "Marion" and sometimes "Marion County" — normalize so we don't say "X County County"
    const countyClean = county.replace(/\s+County$/i, "").trim();
    return state ? `${countyClean} County, ${state}` : countyClean;
  } catch (_) {
    return "";
  }
}

// ─── Enformion skip trace (phone only, Target A only) ──────────────────────
// Re-uses the existing `skipTrace` backend function so the user's auth is carried,
// and the same Enformion/Supabase edge function is hit.
async function skipTraceTargetA(base44, target) {
  try {
    const res = await base44.functions.invoke("skipTrace", {
      owner_name: target.owner_name,
      mailing_address: target.mailing_address,
    });
    const data = res?.data || res || {};
    const phones = data?.phones || data?.result?.phones || [];
    const first = phones[0];
    return first?.number || first || null;
  } catch (e) {
    console.warn("Skip trace failed:", e?.message || e);
    return null;
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const {
      lat,
      lon,
      tower_height_ft = 199,
      setback_ft = 50,
      search_id = null,
    } = await req.json();

    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const realieKey = Deno.env.get("REALIE_API_KEY");
    if (!realieKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    // 1. Pull parcels + jurisdiction in parallel
    const [parcels, jurisdiction] = await Promise.all([
      fetchRealieParcels(lat, lon, realieKey),
      getJurisdiction(lat, lon),
    ]);

    // 2. Filter residential
    const nonResidential = parcels.filter((p) => !isResidential(p));

    // 3. Rank by ordinance fit
    const minAcres = computeMinAcres(Number(tower_height_ft), Number(setback_ft));
    const ctx = { minAcres, lat, lon };
    const ranked = nonResidential
      .map((p) => ({ ...p, _score: scoreParcel(p, ctx) }))
      .filter((p) => p._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 3);

    if (ranked.length === 0) {
      return Response.json({
        error: "No qualifying non-residential parcels found in 1-mile ring.",
        min_acres_required: minAcres,
        total_parcels_pulled: parcels.length,
        non_residential_count: nonResidential.length,
      }, { status: 404 });
    }

    // 4. Skip trace Target A only (re-uses skipTrace backend fn for proper auth)
    const phoneA = await skipTraceTargetA(base44, ranked[0]);

    // 5. Build labeled targets
    const labels = ["A", "B", "C"];
    const targets = ranked.map((p, i) => ({
      label: labels[i],
      owner_name: p.owner_name || "Unknown",
      parcel_address: p.parcel_address || "—",
      parcel_id: p.apn || "—",
      parcel_size_acres: p.acreage || null,
      jurisdiction: jurisdiction || "—",
      zoning_classification: p.zoning || p.land_use || "—",
      owner_mailing_address: p.mailing_address || "—",
      latitude: p.latitude,
      longitude: p.longitude,
      phone: i === 0 ? (phoneA || null) : null,
      score: Math.round(p._score),
    }));

    // 6. Save all 3 as CRMDeal records (as the user via SDK)
    const savedDealIds = [];
    for (const t of targets) {
      try {
        const deal = await base44.entities.CRMDeal.create({
          owner_name: t.owner_name,
          parcel_address: t.parcel_address,
          owner_mailing_address: t.owner_mailing_address,
          search_id: search_id,
          stage: "prospect",
          phone: t.phone || "",
          notes: `Target ${t.label} • ${jurisdiction} • Zoning: ${t.zoning_classification} • ${t.parcel_size_acres || "?"} ac`,
          match_score: t.score,
          latitude: t.latitude,
          longitude: t.longitude,
        });
        savedDealIds.push(deal.id);
      } catch (e) {
        console.warn(`CRMDeal create failed for Target ${t.label}:`, e.message);
      }
    }

    console.log(`generatePropertyInfoTargets: user=${user.email} jurisdiction=${jurisdiction} pulled=${parcels.length} nonRes=${nonResidential.length} top=${targets.length} phoneA=${!!phoneA} dealsSaved=${savedDealIds.length}`);

    return Response.json({
      jurisdiction,
      tower_height_ft,
      setback_ft,
      min_acres_required: Math.round(minAcres * 100) / 100,
      total_parcels_pulled: parcels.length,
      non_residential_count: nonResidential.length,
      targets,
      saved_deal_ids: savedDealIds,
    });
  } catch (error) {
    console.error("generatePropertyInfoTargets error:", error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});