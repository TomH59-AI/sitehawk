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

function normalize(feature) {
  const f = feature?.properties?.fields || feature?.properties || {};
  const geom = feature?.geometry || null;

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

    // ── ROW (Right-of-Way) indicators ──
    row_flag: f.row_flag ?? f.ll_row_flag ?? null,         // true = parcel is ROW
    row_type: f.row_type || f.ll_row_type || null,         // road, rail, utility, etc.
    roadway_row: f.roadway_row ?? null,

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = Deno.env.get("REGRID_API_KEY");
    if (!token) return Response.json({ error: "REGRID_API_KEY not configured" }, { status: 500 });

    const { lat, lon, radius_miles = 0.5, mode = "ring" } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
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
      return Response.json({ ok: true, parcel: target, parcels });
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

    return Response.json({
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
    });
  } catch (err) {
    console.error("[regridParcelRing] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});