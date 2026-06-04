// Canonical SCIP Target A helpers.
//
// After target selection, parcel_targets[active_target_index] is the SINGLE
// source of truth for every SCIP section. No section should re-discover or
// re-choose a target — they all read Target A from here.
//
// Each flat-field section (hawk_maps, power_airport_maps, existing_conditions,
// etc.) is stamped with the active_target_index it was generated for,
// stored on record.section_target_index[section_key]. When active_target_index
// changes, any section whose stamp no longer matches is "stale" and should be
// regenerated. (HawkRFCoverage already keys its enrichment by index directly.)

export const SECTION_KEYS = {
  parcel_targets: "parcel_targets",
  sarf_map: "sarf_map",
  parcel_boundary: "parcel_boundary",
  zoning: "zoning",
  rf_airport_tower: "rf_airport_tower",
  coverage_viewshed: "coverage_viewshed",
  utility_fiber_electric: "utility_fiber_electric",
  scorecard: "scorecard",
  mailers: "mailers",
  documents: "documents",
  crm: "crm",
  hawk_maps: "hawk_maps",
  power_airport: "power_airport",
  existing_conditions: "existing_conditions",
  // Legacy data key retained so old records can still be read without breaking.
  viewshed: "viewshed",
};

// ───────────────────────────────────────────────────────────────────────────
// CANONICAL SCIP SECTION ORDER — the single source of truth for how SCIP
// sections are numbered and displayed. The displayed number is PURELY
// presentational; every section is still identified internally by its
// section_key string. Change the order here and the whole UI follows.
// ───────────────────────────────────────────────────────────────────────────
export const SCIP_SECTION_ORDER = [
  { key: "parcel_targets", title: "Hawk Parcel Data" },
  { key: SECTION_KEYS.hawk_maps, title: "HAWK MAPS" },
  { key: SECTION_KEYS.coverage_viewshed, title: "RF Proximity & Coverage" },
  { key: SECTION_KEYS.zoning, title: "Hawk Zoning & Permitting" },
  { key: SECTION_KEYS.power_airport, title: "Power & Airport" },
  { key: SECTION_KEYS.existing_conditions, title: "Existing Conditions" },
];

// 1-based display number for a section_key per the canonical order (0 if absent).
export function sectionNumber(key) {
  const i = SCIP_SECTION_ORDER.findIndex((s) => s.key === key);
  return i === -1 ? 0 : i + 1;
}

// Full "Section N — Title" label for a section_key, derived from the one list.
export function sectionLabel(key) {
  const i = SCIP_SECTION_ORDER.findIndex((s) => s.key === key);
  if (i === -1) return "";
  return `Section ${i + 1} — ${SCIP_SECTION_ORDER[i].title}`;
}

// The canonical active target index (0 = Target A).
export function activeIndex(record) {
  return record?.active_target_index || 0;
}

// The canonical Target A object — what every section must build from.
export function targetA(record) {
  const targets = record?.parcel_targets || [];
  return targets[activeIndex(record)] || null;
}

// Resolve the lat/lon a section should use, falling back to the SCIP centroid.
export function targetCoords(record) {
  const t = targetA(record);
  return {
    lat: Number(t?.latitude ?? record?.latitude),
    lon: Number(t?.longitude ?? record?.longitude),
  };
}

// The index a given section was last generated for (null = never generated).
export function sectionStampIndex(record, sectionKey) {
  const map = record?.section_target_index || {};
  return Object.prototype.hasOwnProperty.call(map, sectionKey) ? map[sectionKey] : null;
}

// True when a section's stored output was built for a DIFFERENT Target A than
// the one currently active — i.e. it needs regeneration.
export function isSectionStale(record, sectionKey, hasData) {
  if (!hasData) return false; // nothing generated yet — not "stale", just empty
  const stamp = sectionStampIndex(record, sectionKey);
  if (stamp === null) return false; // legacy data with no stamp — leave it alone
  return stamp !== activeIndex(record);
}

// Build the section_target_index patch to merge into a ScipRecord.update() so
// the section is stamped with the index it was just generated for.
export function stampPatch(record, sectionKey) {
  const map = { ...(record?.section_target_index || {}) };
  map[sectionKey] = activeIndex(record);
  return { section_target_index: map };
}
