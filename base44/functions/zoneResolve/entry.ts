import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { findOrdinance } from '../../shared/telecomOrdinance.ts';

/**
 * zoneResolve — NATIVE Base44 implementation (Supabase edge function retired).
 * For a {lat, lon} returns, in the exact legacy response shape:
 *   - jurisdiction / county / state  — US Census geocoder (nationwide)
 *   - flu / flu_polygon              — UF GeoPlan Level 2 Future Land Use 2020
 *                                      statewide ArcGIS layer (Florida)
 *   - telecom_ordinances             — TelecomOrdinance entity (migrated registry)
 *   - zoning_polygon                 — null (parity: the legacy resolver never
 *                                      returned a county zoning layer either)
 * Used by Section 4 Map 4/5 and GenerateScipButton.
 */

const FLU_URL = "https://services.arcgis.com/LBbVDC0hKPAnLRpO/arcgis/rest/services/FLU_L2_2020/FeatureServer/0/query";
const CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";

const titleCase = (s) =>
  String(s || "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim() || null;

async function fetchFlu(lat, lon) {
  const params = new URLSearchParams({
    f: "geojson",
    geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "JURISDICT,COUNTY,FLU_L1,FLU_L1_DESC,FLU_L2,FLU_L2_DESC,DESCRIPT",
    returnGeometry: "true",
    outSR: "4326",
    where: "1=1",
  });
  const r = await fetch(`${FLU_URL}?${params}`);
  if (!r.ok) throw new Error(`FLU ArcGIS HTTP ${r.status}`);
  const fc = await r.json();
  if (fc?.error) throw new Error(`FLU ArcGIS: ${fc.error.message || JSON.stringify(fc.error.details || [])}`);
  const feat = fc?.features?.[0] || null;
  if (!feat) return null;
  const a = feat.properties || {};
  return {
    code: a.FLU_L2 || a.FLU_L1 || null,
    label: titleCase(a.DESCRIPT || a.FLU_L2_DESC || a.FLU_L1_DESC),
    field_used: "FLU_L2",
    jurisdict: titleCase(a.JURISDICT),
    county: titleCase(a.COUNTY),
    geojson: { type: "Feature", geometry: feat.geometry, properties: a },
  };
}

async function fetchCensus(lat, lon) {
  const params = new URLSearchParams({
    x: String(lon),
    y: String(lat),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "Incorporated Places,Counties,States",
    format: "json",
  });
  const r = await fetch(`${CENSUS_URL}?${params}`);
  if (!r.ok) throw new Error(`Census geocoder HTTP ${r.status}`);
  const data = await r.json();
  const g = data?.result?.geographies || {};
  const place = (g["Incorporated Places"] || [])[0] || null;
  const county = (g["Counties"] || [])[0] || null;
  const state = (g["States"] || [])[0] || null;
  // Census place NAMEs carry a lowercase type suffix ("Rockledge city") —
  // strip it so ordinance-registry matching works.
  const cleanPlace = place?.NAME
    ? place.NAME.replace(/\s+(city|town|village|borough|municipality|CDP)$/i, "").trim()
    : null;
  return {
    place: cleanPlace,
    county: county?.BASENAME || county?.NAME || null,
    state: state?.STUSAB || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }

    const [fluRes, censusRes] = await Promise.allSettled([
      fetchFlu(Number(lat), Number(lon)),
      fetchCensus(Number(lat), Number(lon)),
    ]);
    const flu = fluRes.status === "fulfilled" ? fluRes.value : null;
    if (fluRes.status === "rejected") console.error("zoneResolve FLU:", fluRes.reason?.message);
    const census = censusRes.status === "fulfilled" ? censusRes.value : null;
    if (censusRes.status === "rejected") console.error("zoneResolve Census:", censusRes.reason?.message);

    const state = census?.state || (flu ? "FL" : null);
    const county = census?.county || flu?.county || null;
    // Incorporated place governs; unincorporated areas fall to the county.
    const jurisdiction = census?.place
      || (flu?.jurisdict && flu.jurisdict.toUpperCase() !== (county || "").toUpperCase() ? flu.jurisdict : null)
      || (county ? `${county} County` : null);

    // Telecom ordinance rules from the migrated Base44 registry.
    let rules = null;
    if (state && jurisdiction) {
      const found = await findOrdinance(base44, state, jurisdiction).catch(() => ({ rules: null }));
      rules = found.rules;
    }

    console.log('zoneResolve ok:', JSON.stringify({
      lat, lon, jurisdiction, county, state,
      has_flu: !!flu, registry_hit: !!rules,
    }));

    return Response.json({
      jurisdiction,
      county,
      state,
      zoning_polygon: null,
      flu: flu && flu.geojson ? { code: flu.code, label: flu.label, field_used: flu.field_used, geojson: flu.geojson } : null,
      flu_polygon: flu?.geojson ?? null,
      telecom_ordinances: rules,
      meta: { source: "native", flu_source: "UF GeoPlan FLU L2 2020", jurisdiction_source: census ? "US Census" : (flu ? "GeoPlan" : null) },
    });
  } catch (error) {
    console.error('zoneResolve error:', error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});