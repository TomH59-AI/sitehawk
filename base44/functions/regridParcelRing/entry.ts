/**
 * regridParcelRing — Fetch parcels in a radius using the Regrid API v2 /query endpoint.
 *
 * Used EXCLUSIVELY for the Section 4 Parcel Map overlay (Map #9) + the new
 * ROW / Premium data step so Regrid credits are spent only there, while
 * Realie handles the SARF ring scan and Target selection.
 *
 * Regrid docs: GET /api/v2/parcels/query?lat=&lon=&radius=<meters>&token=
 * Premium plan includes: ROW indicators, stacked parcels, transmission line
 * distance, building footprints, zoning type/subtype, vacancy, crop data,
 * elevation/env hazard ratings, census growth indicators, UUIDs.
 *
 * Input:  { lat, lon, radius_miles (default 0.5, max 1.0) }
 * Output: { parcels: [...normalized], count, center, target_a_enrichment }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ll_row_parcel (premium schema) stores the criteria that flagged the parcel as ROW.
const ROW_CRITERIA_LABELS = {
  parcel_number: "Parcel number indicates ROW",
  land_use: "Land use indicates ROW",
  perimeter_ratio: "Street-network geometry (perimeter ratio)",
  hull_ratio: "Street-network geometry (hull ratio)",
};
// Roadway ROW (RROW) road_type codes — US Census route type classification.
const ROAD_TYPE_LABELS = { C: "County", I: "Interstate", M: "Common Name", O: "Other", S: "Statewide", U: "US" };

function normalize(feature) {
  const f = feature?.properties?.fields || feature?.properties || {};
  const geom = feature?.geometry || null;
  const rowParcel = f.ll_row_parcel || null;

  return {
    // ── Core identifiers ──
    apn: f.parcelnumb || f.apn || f.parcel_id || null,
    ll_uuid: f.ll_uuid || null,

    // ── Ownership ──
    owner_name: f.owner || f.owner2 || null,
    mailing_address: [f.mailadd, f.mail_city, f.mail_state2, f.mail_zip].filter(Boolean).join(", ") || null,
    parcel_address: f.address || f.siteaddr || null,

    // ── Geometry & area ──
    acreage: f.ll_gisacre ?? f.gisacre ?? null,
    ll_gisacre: f.ll_gisacre ?? null,
    ll_gissqft: f.ll_gissqft ?? null,
    latitude: f.lat ?? null,
    longitude: f.lon ?? null,
    parcel_geometry: geom,

    // ── Land use & zoning ──
    land_use: f.usedesc || f.zoning_description || null,
    zoning: f.zoning || null,
    zoning_type: f.zoning_type || null,
    zoning_subtype: f.zoning_subtype || null,
    zoning_description: f.zoning_description || null,
    lbcs_activity: f.lbcs_activity ?? null,
    lbcs_function: f.lbcs_function ?? null,
    lbcs_structure: f.lbcs_structure ?? null,
    lbcs_site: f.lbcs_site ?? null,
    lbcs_ownership: f.lbcs_ownership ?? null,

    // ── Assessment & tax ──
    assessed_value: f.parval ?? null,
    land_value: f.landval ?? null,
    improvement_value: f.improvval ?? null,
    last_sale_date: f.saledatetx || f.saledate || null,
    last_sale_price: f.saleprice ?? null,

    // ── Buildings & structures ──
    ll_bldg_count: f.ll_bldg_count ?? null,
    ll_bldg_sq_ft: f.ll_bldg_sq_ft ?? null,
    num_stories: f.numstories ?? null,
    year_built: f.yearbuilt ?? null,
    struct_present: f.struct ?? null,

    // ── Residential & vacancy ──
    usps_vacancy: f.usps_vacancy || null,
    rdi: f.rdi || null,                         // Residential Delivery Indicator
    ll_address_count: f.ll_address_count ?? null,

    // ── ROW (Right-of-Way) indicators — premium schema `ll_row_parcel` ──
    ll_row_parcel: rowParcel,                              // criteria value when parcel is ROW
    row_flag: rowParcel ? true : (f.row_flag ?? f.ll_row_flag ?? null),
    row_type: rowParcel
      ? (ROW_CRITERIA_LABELS[rowParcel] || rowParcel)
      : (f.row_type || f.ll_row_type || null),
    // ── Roadway ROW (RROW) product attributes (when included in account schema) ──
    road_type: f.road_type ? (ROAD_TYPE_LABELS[f.road_type] || f.road_type) : null,
    mtfcc: f.mtfcc || null,
    mtfcc_name: f.mtfcc_name || null,

    // ── Stacked parcel indicators ──
    ll_stack_uuid: f.ll_stack_uuid || null,     // non-null = stacked parcel
    stacked: !!(f.ll_stack_uuid),

    // ── Infrastructure & proximity ──
    transmission_line_dist_m: f.dist_nearest_transmission_line_m ?? f.ll_transmission_dist ?? null,

    // ── Elevation & environmental hazards ──
    fema_flood_zone: f.fema_flood_zone || null,
    fema_flood_zone_raw: f.fema_flood_zone_raw || null,
    risk_rating_score: f.risk_rating_score ?? null,
    parcel_elevation_ft: f.ll_elevation_ft ?? f.parcel_elevation_ft ?? null,
    cdl_majority_category: f.cdl_majority_category || null,  // crop data layer
    cdl_majority_percent: f.cdl_majority_percent ?? null,

    // ── Census & socioeconomics ──
    census_tract: f.census_tract || null,
    census_blockgroup: f.census_blockgroup || null,
    qoz: f.qoz || null,                         // Qualified Opportunity Zone
    geoid: f.geoid || null,

    // ── Source & lineage ──
    county: f.county || f.scounty || null,
    state: f.state2 || null,
    path: f.path || null,
    ll_last_refresh: f.ll_last_refresh || null,
  };
}

/** Pull the closest-matching parcel to (lat, lon) from a normalized list. */
function findTargetParcel(parcels, lat, lon) {
  if (!parcels.length) return null;
  let best = null, bestDist = Infinity;
  for (const p of parcels) {
    if (p.latitude == null || p.longitude == null) continue;
    const d = Math.hypot(p.latitude - lat, p.longitude - lon);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best || parcels[0];
}

// ── RING/POINT RESULT CACHE ─────────────────────────────────────────────────
// Same rounded center + radius + mode within 30 days → serve the stored result
// instead of re-spending Regrid parcel-record credits. Payload lives in a
// private JSON file so entity records stay small.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cacheKey(lat, lon, radiusMiles, mode) {
  const r = mode === "point" ? "point" : String(Number(radiusMiles));
  return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)},${r},${mode}`;
}

async function cacheGet(base44, key) {
  const rows = await base44.asServiceRole.entities.RegridRingCache.filter({ cache_key: key }, "-fetched_at", 1);
  const row = rows?.[0];
  if (!row?.payload_uri) return null;
  if (Date.now() - new Date(row.fetched_at || row.created_date).getTime() > CACHE_TTL_MS) return null;
  const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: row.payload_uri });
  const res = await fetch(signed_url);
  if (!res.ok) return null;
  return await res.json();
}

async function cachePut(base44, key, mode, payload, parcelCount) {
  const file = new File([JSON.stringify(payload)], "regrid-cache.json", { type: "application/json" });
  const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
  await base44.asServiceRole.entities.RegridRingCache.create({
    cache_key: key,
    mode,
    payload_uri: file_uri,
    parcel_count: parcelCount,
    fetched_at: new Date().toISOString(),
  });
}

// ── USAGE COUNTER ────────────────────────────────────────────────────────────
// Increment the global + per-user daily Regrid counter ONLY on a live fetch
// (cache hits stay free and are not counted). `parcelsBilled` = parcel records
// returned by this live pull, which is what Regrid bills against.
async function bumpUsage(base44, userEmail, parcelsBilled) {
  const date = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const inc = Math.max(1, Number(parcelsBilled) || 0);
  for (const scope of ["global", "user"]) {
    const q = scope === "global"
      ? { scope: "global", date }
      : { scope: "user", date, user_email: userEmail };
    try {
      const rows = await base44.asServiceRole.entities.RegridUsage.filter(q, "-date", 1);
      if (rows?.[0]) {
        await base44.asServiceRole.entities.RegridUsage.update(rows[0].id, {
          count: (Number(rows[0].count) || 0) + inc,
        });
      } else {
        await base44.asServiceRole.entities.RegridUsage.create({
          date, scope, user_email: scope === "user" ? userEmail : null, count: inc,
        });
      }
    } catch (e) {
      console.warn(`[regridParcelRing] usage bump failed (${scope}):`, e.message);
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = Deno.env.get("REGRID_API_KEY");
    if (!token) return Response.json({ error: "REGRID_API_KEY not configured" }, { status: 500 });

    const { lat, lon, radius_miles = 0.5, mode = "ring", force_refresh = false } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // Cache check — shared across all users, all sections, both modes.
    const key = cacheKey(lat, lon, radius_miles, mode);
    if (!force_refresh) {
      try {
        const cached = await cacheGet(base44, key);
        if (cached) {
          console.log(`[regridParcelRing] CACHE HIT ${key} — 0 Regrid credits spent`);
          return Response.json({ ...cached, cached: true });
        }
      } catch (e) {
        console.warn("[regridParcelRing] cache read failed, fetching live:", e.message);
      }
    }

    // ── POINT mode: single parcel lookup at a specific lat/lon ──
    // Used by the Zoning and FLUM map steps to get Regrid zoning + FLU fields
    // for Target A without pulling the full ring. No extra credit cost vs ring.
    if (mode === "point") {
      const url = new URL("https://app.regrid.com/api/v2/parcels/query");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("radius", "100"); // ~100m — just the parcel under the point
      url.searchParams.set("token", token);
      url.searchParams.set("limit", "5");
      url.searchParams.set("return_geometry", "true");
      url.searchParams.set("return_custom", "true");
      console.log(`[regridParcelRing/point] lat=${lat} lon=${lon}`);
      const res = await fetch(url.toString());
      if (!res.ok) {
        const errText = await res.text();
        console.error("[regridParcelRing/point] error", res.status, errText.slice(0, 200));
        return Response.json({ error: `Regrid HTTP ${res.status}` }, { status: 502 });
      }
      const data = await res.json();
      const features = data?.parcels?.features || data?.features || [];
      const parcels = features.map(normalize);
      const target = findTargetParcel(parcels, lat, lon) || parcels[0] || null;
      console.log(`[regridParcelRing/point] zoning=${target?.zoning} flu=${target?.land_use}`);
      const payload = { ok: true, parcel: target, parcels };
      try { await cachePut(base44, key, "point", payload, parcels.length); } catch (e) { console.warn("[regridParcelRing] cache write failed:", e.message); }
      await bumpUsage(base44, user.email, parcels.length);
      return Response.json(payload);
    }

    // ── RING mode (default) ──
    // Regrid radius param is in meters, max 32000m. We cap at 1mi.
    const radiusMeters = Math.min(Number(radius_miles), 1.0) * 1609.34;

    const url = new URL("https://app.regrid.com/api/v2/parcels/query");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("radius", String(Math.round(radiusMeters)));
    url.searchParams.set("token", token);
    url.searchParams.set("limit", "100");
    url.searchParams.set("return_geometry", "true");
    url.searchParams.set("return_custom", "true");      // pass through all county fields

    console.log(`[regridParcelRing] lat=${lat} lon=${lon} radius=${radius_miles}mi (${Math.round(radiusMeters)}m)`);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errText = await res.text();
      console.error("[regridParcelRing] Regrid error", res.status, errText.slice(0, 300));
      return Response.json({ error: `Regrid HTTP ${res.status}: ${errText.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json();
    const features = data?.parcels?.features || data?.features || [];
    const parcels = features.map(normalize).filter((p) => p.apn || p.owner_name);

    // Build a Target A enrichment summary — the parcel closest to the query point
    const targetParcel = findTargetParcel(parcels, lat, lon);

    // Count ROW, stacked, and vacancy stats across the ring
    const rowCount = parcels.filter((p) => p.row_flag === true || p.row_flag === "true" || p.row_type).length;
    const stackedCount = parcels.filter((p) => p.stacked).length;
    const vacantCount = parcels.filter((p) => p.usps_vacancy === "V").length;

    console.log(`[regridParcelRing] returned ${parcels.length} parcels | ROW: ${rowCount} | Stacked: ${stackedCount} | Vacant: ${vacantCount}`);

    const payload = {
      ok: true,
      count: parcels.length,
      center: { lat, lon },
      radius_miles: Number(radius_miles),
      parcels,
      // Convenience: enrichment block for Target A display card
      target_a_enrichment: targetParcel,
      ring_stats: {
        total: parcels.length,
        row_count: rowCount,
        stacked_count: stackedCount,
        vacant_count: vacantCount,
      },
    };
    try { await cachePut(base44, key, "ring", payload, parcels.length); } catch (e) { console.warn("[regridParcelRing] cache write failed:", e.message); }
    await bumpUsage(base44, user.email, parcels.length);
    return Response.json(payload);
  } catch (err) {
    console.error("[regridParcelRing] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});