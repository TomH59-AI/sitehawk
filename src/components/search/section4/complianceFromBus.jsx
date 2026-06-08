// Pre-screen the 8 NEPA trigger flags directly from the SiteSearch pipeline —
// Target A + the Section 4 data bus (fema, wetlands, zoneomicsDistrict) and the
// SARF tower height. Mirrors components/compliance/preScreen.js but reads the
// live pipeline bus instead of a stored ScipRecord.

const RESIDENTIAL_RE = /\b(R-?\d|RES|RESIDENTIAL|SINGLE.?FAMILY|MULTI.?FAMILY|RR|RU|RA\b)/i;
const FLOOD_RE = /\b(A|AE|AO|AH|VE|V)\b/i; // FEMA Special Flood Hazard Area zones

// targetA: Section 3 lead parcel. sectionData: the live bus. towerHeightFt: SARF height.
// Returns { flags, notes }.
export function preScreenFromBus(targetA, sectionData = {}, towerHeightFt = 0) {
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

  // 1. FEMA floodplain — from the §4 FEMA centroid lookup (bus) or Target A.
  const floodZone =
    sectionData?.fema?.flood_zone ||
    targetA?.fema_risk_factor ||
    "";
  if (floodZone && FLOOD_RE.test(floodZone) && !/zone x\b/i.test(floodZone)) {
    flags.floodplain = true;
    notes.push(`Floodplain: FEMA zone "${floodZone}"`);
  }

  // 2. Wetlands — from the quiet wetlandsLookup emitted to the bus.
  if (sectionData?.wetlands?.present === true) {
    flags.wetlands = true;
    notes.push(`Wetlands present on/adjacent to parcel${sectionData.wetlands.type ? ` (${sectionData.wetlands.type})` : " (NWI)"}.`);
  }

  // 4. Historic sites — from the quiet NPS National Register lookup (bus). Counts
  //    listed historic properties within 0.5 mi of the target (47 CFR 1.1307 historic trigger).
  if (sectionData?.historic?.present === true && (sectionData.historic.count || 0) > 0) {
    flags.historicDistrict = true;
    const c = sectionData.historic.count;
    notes.push(`Historic: ${c} National Register site${c !== 1 ? "s" : ""} within 0.5 mi${sectionData.historic.site_names?.[0] ? ` (e.g. ${sectionData.historic.site_names[0]})` : ""}.`);
  }

  // 6. Residential zoning — from Zoneomics district (bus) or Target A classification.
  const zoning =
    sectionData?.zoneomicsDistrict?.zone_code ||
    targetA?.zoning_classification ||
    "";
  if (zoning && RESIDENTIAL_RE.test(zoning)) {
    flags.residentialArea = true;
    notes.push(`Residential area: zoning "${zoning}"`);
  }

  // 8. Tower lighting — towers >= 200 ft AGL require FAA lighting.
  const h = Number(towerHeightFt) || 0;
  if (h >= 200) {
    flags.lightingMigratoryBirdImpact = true;
    notes.push(`Lighting: tower height ${h} ft AGL ≥ 200 ft (FAA lighting required).`);
  }

  return { flags, notes };
}