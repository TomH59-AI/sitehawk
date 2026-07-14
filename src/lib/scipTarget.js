// Canonical SCIP Target A helpers.
//
// After target selection, parcel_targets[active_target_index] is the SINGLE
// source of truth for every SCIP section. No section should re-discover or
// re-choose a target — they all call resolveScipActiveTarget() from here.
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
  // Zoning runs FIRST — right after the SARF, before the 3-target parcel pick —
  // so parcel scoring and HAWK MAPS' jurisdiction cache use real zoning data.
  // Canonical pipeline: SARF → Zoning → Targets A/B/C → Maps.
  { key: SECTION_KEYS.zoning, title: "Hawk Zoning & Permitting" },
  { key: "parcel_targets", title: "Hawk Parcel Data" },
  { key: SECTION_KEYS.hawk_maps, title: "HAWK MAPS" },
  { key: SECTION_KEYS.coverage_viewshed, title: "RF Proximity & Coverage" },
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

// ───────────────────────────────────────────────────────────────────────────
// CANONICAL ACTIVE TARGET RESOLVER
//
// The SINGLE function every section must call to get the active target context.
// Handles all edge cases:
//   - active_target_index missing/null/NaN/negative/out-of-range → defaults to 0
//   - parcel_targets empty → falls back to legacy record lat/lon with warnings
//   - missing geometry / lat / lon → populates warnings array
//
// Returns:
//   {
//     target_index,        // number, always 0+ and in-range
//     target_label,        // "Target A" / "Target B" / etc.
//     lat, lon,            // number | null
//     parcel_address,      // string
//     apn,                 // string
//     owner_name,          // string
//     acreage,             // number | null
//     zoning_classification, // string
//     mailing_address,     // string
//     parcel_geometry,     // GeoJSON | null
//     source_search_result_id, // string | null
//     is_legacy_fallback,  // true when no parcel_targets exist
//     warnings,            // string[]
//   }
// ───────────────────────────────────────────────────────────────────────────
const TARGET_LABELS = ["Target A", "Target B", "Target C"];

export function resolveScipActiveTarget(record) {
  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  const warnings = [];

  // Validate active_target_index — must be a non-negative integer within range
  const raw = record?.active_target_index;
  const parsedIdx = typeof raw === "number" ? Math.floor(raw) : parseInt(raw, 10);
  let idx = 0;
  if (!Number.isFinite(parsedIdx) || parsedIdx < 0) {
    // null / undefined / NaN / negative → default to 0
    idx = 0;
  } else if (targets.length > 0 && parsedIdx >= targets.length) {
    // Out-of-range → clamp to last valid target
    idx = targets.length - 1;
    warnings.push(`active_target_index ${parsedIdx} is out of range (${targets.length} targets) — defaulted to index ${idx}.`);
  } else {
    idx = parsedIdx;
  }

  const label = TARGET_LABELS[idx] || `Target ${idx + 1}`;

  // No targets at all — legacy fallback to SCIP centroid fields
  if (targets.length === 0) {
    const lat = record?.latitude != null ? Number(record.latitude) : null;
    const lon = record?.longitude != null ? Number(record.longitude) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      warnings.push("No parcel targets selected and no SCIP centroid lat/lon available — cannot determine site coordinates.");
    } else {
      warnings.push("No parcel targets selected yet — using SCIP search ring centroid as a legacy fallback. Run 'Find 3 Best Parcels' to set Target A.");
    }
    return {
      target_index: 0,
      target_label: "Target A (legacy centroid)",
      lat,
      lon,
      parcel_address: record?.site_name || "",
      apn: null,
      owner_name: null,
      acreage: null,
      zoning_classification: null,
      mailing_address: null,
      parcel_geometry: null,
      source_search_result_id: null,
      is_legacy_fallback: true,
      warnings,
    };
  }

  const t = targets[idx] || {};

  // Resolve lat/lon — prefer target coordinates, fall back to SCIP centroid
  const lat = t.latitude != null ? Number(t.latitude) : (record?.latitude != null ? Number(record.latitude) : null);
  const lon = t.longitude != null ? Number(t.longitude) : (record?.longitude != null ? Number(record.longitude) : null);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    warnings.push(`${label} has no usable coordinates. Maps and enrichment cannot be generated until a valid location is available.`);
  }
  if (!t.parcel_address && !t.apn) {
    warnings.push(`${label} is missing both parcel_address and APN — the target data may be incomplete.`);
  }

  return {
    target_index: idx,
    target_label: label,
    lat,
    lon,
    parcel_address: t.parcel_address || "",
    apn: t.apn || null,
    owner_name: t.owner_name || null,
    acreage: t.acreage != null ? Number(t.acreage) : null,
    zoning_classification: t.zoning_classification || null,
    mailing_address: t.mailing_address || null,
    parcel_geometry: t.geometry || null,
    source_search_result_id: t.source_search_result_id || null,
    is_legacy_fallback: false,
    warnings,
  };
}

// ─── Convenience shims (keep backward-compat with callers using old helpers) ──

// The canonical active target index (0 = Target A). Never returns NaN or negative.
export function activeIndex(record) {
  return resolveScipActiveTarget(record).target_index;
}

// The canonical active target object — what every section must build from.
export function targetA(record) {
  const targets = record?.parcel_targets || [];
  const idx = resolveScipActiveTarget(record).target_index;
  return targets[idx] || null;
}

// Resolve the lat/lon a section should use, falling back to the SCIP centroid.
export function targetCoords(record) {
  const { lat, lon } = resolveScipActiveTarget(record);
  return { lat, lon };
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

// Build a request_hash string for DataSourceSnapshot deduplication.
// Includes target index + lat/lon/APN/address + key parameters.
export function buildRequestHash(record, sectionKey, extraParams = {}) {
  const ctx = resolveScipActiveTarget(record);
  const parts = [
    sectionKey,
    `ti:${ctx.target_index}`,
    `lat:${ctx.lat != null ? ctx.lat.toFixed(5) : "null"}`,
    `lon:${ctx.lon != null ? ctx.lon.toFixed(5) : "null"}`,
    `apn:${ctx.apn || ""}`,
  ];
  for (const [k, v] of Object.entries(extraParams)) {
    parts.push(`${k}:${v}`);
  }
  return parts.join("|");
}

// ─── Unit-test assertions (run in dev console: import and call runSelf Tests) ──
export function runSelfTests() {
  const tests = [
    // 1. Missing active_target_index → 0
    {
      desc: "missing active_index → 0",
      record: { parcel_targets: [{ latitude: 1, longitude: 2, parcel_address: "A" }] },
      expect: 0,
    },
    // 2. null active_target_index → 0
    {
      desc: "null active_index → 0",
      record: { parcel_targets: [{ latitude: 1, longitude: 2, parcel_address: "A" }], active_target_index: null },
      expect: 0,
    },
    // 3. NaN active_target_index → 0
    {
      desc: "NaN active_index → 0",
      record: { parcel_targets: [{ latitude: 1, longitude: 2, parcel_address: "A" }], active_target_index: NaN },
      expect: 0,
    },
    // 4. negative active_target_index → 0
    {
      desc: "negative active_index → 0",
      record: { parcel_targets: [{ latitude: 1, longitude: 2, parcel_address: "A" }], active_target_index: -1 },
      expect: 0,
    },
    // 5. valid active_target_index 1 → 1
    {
      desc: "valid active_index 1 → 1",
      record: { parcel_targets: [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4, parcel_address: "B" }], active_target_index: 1 },
      expect: 1,
    },
    // 6. out-of-range active_target_index → clamped to last
    {
      desc: "out-of-range active_index → last valid",
      record: { parcel_targets: [{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: 4 }], active_target_index: 5 },
      expect: 1,
    },
    // 7. no parcel_targets → legacy fallback with target_index 0
    {
      desc: "no parcel_targets → legacy fallback index 0",
      record: { parcel_targets: [], latitude: 29.7, longitude: -95.3 },
      expect: 0,
      expectLegacy: true,
    },
    // 8. active_target_index 0 (explicit) → 0, NOT defaulted away
    {
      desc: "explicit active_index 0 → 0",
      record: { parcel_targets: [{ latitude: 1, longitude: 2 }], active_target_index: 0 },
      expect: 0,
    },
  ];

  let passed = 0;
  for (const t of tests) {
    const result = resolveScipActiveTarget(t.record);
    const ok = result.target_index === t.expect && (!t.expectLegacy || result.is_legacy_fallback === true);
    if (ok) { passed++; }
    else { console.error(`FAIL [${t.desc}]: got index=${result.target_index}, legacy=${result.is_legacy_fallback}, expected index=${t.expect}`); }
  }
  console.log(`scipTarget self-tests: ${passed}/${tests.length} passed`);
  return passed === tests.length;
}