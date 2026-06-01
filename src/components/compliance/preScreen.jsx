// Pre-screening engine — derives the 8 NEPA trigger flags from data the
// SiteSearch pipeline already collected on the linked ScipRecord. No new
// network calls in Phase 1; external sources (EPA/USFWS/NPS) are left as
// manual entry until those lookups are wired.

const RESIDENTIAL_RE = /\b(R-?\d|RES|RESIDENTIAL|SINGLE.?FAMILY|MULTI.?FAMILY|RR|RU|RA\b)/i;
const FLOOD_RE = /\b(A|AE|AO|AH|VE|V)\b/i; // FEMA Special Flood Hazard Area zones

// scip: a ScipRecord. Returns { flags, notes } — flags is a partial of nepaTriggerFlags.
export function preScreenFromScip(scip) {
  const flags = {
    floodplain: false,
    wetlands: false,
    listedSpeciesHabitat: false,
    historicDistrict: false,
    indianReligiousSite: false,
    residentialArea: false,
    hazardousWasteSite: false,
    lightingMigratoryBirdImpact: false,
  };
  const notes = [];

  // 1. FEMA floodplain — from existing_conditions.flood_zone or hawk_maps / verification_map
  const floodZone =
    scip?.existing_conditions?.flood_zone ||
    scip?.parcel_targets?.[scip?.active_target_index || 0]?.fema_risk_factor ||
    "";
  if (floodZone && FLOOD_RE.test(floodZone) && !/zone x\b/i.test(floodZone)) {
    flags.floodplain = true;
    notes.push(`Floodplain: FEMA zone "${floodZone}"`);
  }

  // 2. NWI wetlands — from existing_conditions.wetland_concerns or verification_map.wetlands
  const wetlandConcern = scip?.existing_conditions?.wetland_concerns || "";
  const vmWet = scip?.verification_map?.wetlands?.present;
  if (vmWet === true || (wetlandConcern && !/none|no known|n\/a/i.test(wetlandConcern))) {
    flags.wetlands = true;
    notes.push("Wetlands present on/adjacent to parcel (NWI).");
  }

  // 3. Residential zoning — from active parcel target zoning_classification
  const zoning = scip?.parcel_targets?.[scip?.active_target_index || 0]?.zoning_classification || "";
  if (zoning && RESIDENTIAL_RE.test(zoning)) {
    flags.residentialArea = true;
    notes.push(`Residential area: zoning "${zoning}"`);
  }

  // 7. Tower lighting — towers >= 200 ft AGL require FAA lighting
  const towerHeight = Number(scip?.sarf_height) || Number(scip?.viewshed?.tower_height_ft) || 0;
  if (towerHeight >= 200) {
    flags.lightingMigratoryBirdImpact = true;
    notes.push(`Lighting: tower height ${towerHeight} ft AGL ≥ 200 ft (FAA lighting required).`);
  }

  return { flags, notes };
}

// Resolve "Site Name" + owner + lat/lon from a ScipRecord for display.
export function scipDisplay(scip) {
  const t = scip?.parcel_targets?.[scip?.active_target_index || 0] || {};
  return {
    siteName: scip?.site_name || "Untitled Site",
    ownerName: t.owner_name || "—",
    lat: scip?.latitude,
    lon: scip?.longitude,
    county: scip?.county || "",
    state: scip?.state || "",
  };
}