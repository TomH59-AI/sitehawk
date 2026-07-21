// Shared SCIP audit engine — deterministic pre-print/pre-submittal checks on a
// ScipRecord. Used by scipQualityAudit (auditor agent) and scipSubmitAudit
// (auto-audit automation). Pure function, never modifies data.

const isBlank = (v) => v == null || String(v).trim() === '';

function haversineMiles(a, b, c, d) {
  const R = 3958.8, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(c - a), dLon = toRad(d - b);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function auditScipRecord(rec) {
  const issues = [];
  const add = (severity, section, message) => issues.push({ severity, section, message });

  // ── 1. Identity / search-ring required fields ──
  const required = [
    ['agent_name', 'Agent name'], ['agent_phone', 'Agent phone'], ['agent_email', 'Agent email'],
    ['submittal_date', 'Submittal date'], ['site_name', 'Site name'],
    ['search_radius', 'Search radius'], ['sarf_height', 'SARF height'],
  ];
  for (const [k, label] of required) {
    if (isBlank(rec[k])) add('critical', 'Site Acquisition', `${label} is blank.`);
  }
  const cLat = Number(rec.latitude), cLon = Number(rec.longitude);
  if (!Number.isFinite(cLat) || !Number.isFinite(cLon) || (cLat === 0 && cLon === 0)) {
    add('critical', 'Search Ring', 'Ring center coordinates are missing or zero.');
  } else if (Math.abs(cLat) > 90 || Math.abs(cLon) > 180) {
    add('critical', 'Search Ring', `Ring center coordinates out of range: ${cLat}, ${cLon}.`);
  }

  // ── 2. SARF map ──
  if (isBlank(rec.map_image_url)) add('critical', 'SARF Map', 'SARF search-ring map has not been generated.');

  // ── 3. Targets + active target completeness ──
  const idx = rec.active_target_index || 0;
  const targets = rec.parcel_targets || [];
  const t = targets[idx];
  if (!targets.length) {
    add('critical', 'Targets', 'No parcel targets — run Section 1 (Targets).');
  } else if (!t) {
    add('critical', 'Targets', `active_target_index is ${idx} but only ${targets.length} target(s) exist.`);
  } else {
    const tFields = [
      ['owner_name', 'Owner name', 'critical'], ['parcel_address', 'Parcel address', 'critical'],
      ['apn', 'Parcel ID (APN)', 'warning'], ['acreage', 'Acreage', 'warning'],
      ['mailing_address', 'Owner mailing address', 'warning'], ['zoning_classification', 'Zoning classification', 'warning'],
      ['fema_risk_factor', 'FEMA flood zone', 'warning'],
    ];
    for (const [k, label, sev] of tFields) {
      if (isBlank(t[k])) add(sev, `Active Target (${t.label || 'Target A'})`, `${label} is blank.`);
    }
    const tLat = Number(t.latitude), tLon = Number(t.longitude);
    if (!Number.isFinite(tLat) || !Number.isFinite(tLon)) {
      add('critical', 'Coordinates', 'Active target has no coordinates.');
    } else if (Number.isFinite(cLat) && Number.isFinite(cLon)) {
      const dist = haversineMiles(cLat, cLon, tLat, tLon);
      const radius = Number(rec.search_radius) || 1;
      if (dist > radius + 0.5) {
        add('critical', 'Coordinates', `Active target is ${dist.toFixed(2)} mi from the ring center — well outside the ${radius} mi search radius. Possible coordinate mismatch.`);
      } else if (dist > radius) {
        add('warning', 'Coordinates', `Active target is ${dist.toFixed(2)} mi from the ring center — slightly outside the ${radius} mi search radius. Confirm this is intentional.`);
      }
    }
  }

  // ── 4. Stale section stamps (generated for a previous target) ──
  const stamps = rec.section_target_index || {};
  for (const [section, stamp] of Object.entries(stamps)) {
    if (Number(stamp) !== Number(idx)) {
      add('critical', 'Stale Sections', `Section "${section}" was generated for target index ${stamp}, but the active target is index ${idx}. Regenerate it.`);
    }
  }

  // ── 5. HAWK MAPS exhibits ──
  const hm = rec.hawk_maps || {};
  const hmChecks = [['aerial_url', 'Aerial map'], ['topography_url', 'Topography map'], ['floodplain_url', 'Floodplain (FEMA) map'], ['zoning_url', 'Zoning map']];
  for (const [k, label] of hmChecks) {
    if (isBlank(hm[k])) add('warning', 'Hawk Maps', `${label} exhibit is missing.`);
  }
  if (hm.center_amsl_ft == null) add('info', 'Hawk Maps', 'Ground elevation (AMSL) not resolved.');

  // ── 6. Power & Airport maps ──
  const pa = rec.power_airport_maps || {};
  if (isBlank(pa.power?.map_url) && isBlank(pa.power?.url)) add('warning', 'Power & Airport', 'Power map exhibit is missing.');
  if (isBlank(pa.airport?.map_url) && isBlank(pa.airport?.url)) add('warning', 'Power & Airport', 'Airport map exhibit is missing.');

  // ── 7. RF enrichment slot for the ACTIVE target ──
  const slot = rec.rf_enrichment?.[String(idx)];
  if (!slot) {
    add('warning', 'RF Coverage', 'No RF proximity/coverage analysis for the active target — run Section 3 (RF).');
  } else {
    if (isBlank(slot.coverage?.png_url)) add('warning', 'RF Coverage', 'CloudRF coverage map is missing from the RF slot.');
    if (slot.rf?.error) add('warning', 'RF Coverage', `RF proximity lookup reported an error: ${slot.rf.error}`);
    if (slot.coverage?.error) add('warning', 'RF Coverage', `Coverage generation reported an error: ${slot.coverage.error}`);
    if (t && Number.isFinite(Number(slot.target_lat)) && Number.isFinite(Number(t.latitude))) {
      const drift = haversineMiles(Number(slot.target_lat), Number(slot.target_lon), Number(t.latitude), Number(t.longitude));
      if (drift > 0.05) add('critical', 'RF Coverage', `RF analysis was run at coordinates ${drift.toFixed(2)} mi away from the current active target — stale RF data.`);
    }
  }

  // ── 8. Existing conditions ──
  const ec = rec.existing_conditions || {};
  const ecFields = [
    ['flood_zone', 'Flood zone'], ['wetland_concerns', 'Wetland concerns'],
    ['water_management_district', 'Water management district'], ['hazardous_waste', 'Hazardous waste concerns'],
    ['access_notes', 'Access notes'], ['local_police', 'Local police'], ['local_fire', 'Local fire dept'],
  ];
  const ecMissing = ecFields.filter(([k]) => isBlank(ec[k]));
  if (ecMissing.length === ecFields.length) {
    add('warning', 'Existing Conditions', 'Existing Conditions section has not been generated.');
  } else {
    for (const [, label] of ecMissing) add('info', 'Existing Conditions', `${label} is blank.`);
  }

  // ── 9. Viewshed ──
  const vs = rec.viewshed || {};
  const dirs = vs.directions || [];
  if (isBlank(vs.aerial_ring_url) && !dirs.length) {
    add('warning', 'Viewshed', 'Viewshed analysis has not been run.');
  } else {
    if (isBlank(vs.aerial_ring_url)) add('warning', 'Viewshed', 'Viewshed aerial ring image is missing.');
    const missingDirs = ['N', 'S', 'E', 'W'].filter((s) => !dirs.find((d) => d.short === s && !isBlank(d.map_url)));
    if (missingDirs.length) add('warning', 'Viewshed', `Missing viewshed map(s): ${missingDirs.join(', ')}.`);
  }

  // ── 10. Zoning report ──
  const zr = rec.zoning_report || {};
  const zrSections = Object.keys(zr);
  if (!zrSections.length) {
    add('warning', 'Zoning & Permitting', 'Zoning & Permitting worksheet has not been generated.');
  } else {
    let blank = 0, total = 0;
    for (const sec of zrSections) {
      for (const row of Object.values(zr[sec] || {})) {
        total++;
        if (isBlank(row?.value)) blank++;
      }
    }
    if (blank > 0) add(blank > total / 2 ? 'warning' : 'info', 'Zoning & Permitting', `${blank} of ${total} zoning worksheet fields are blank.`);
    if (isBlank(rec.zoning_jurisdiction)) add('warning', 'Zoning & Permitting', 'Zoning jurisdiction is not resolved.');
  }

  const counts = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };
  const verdict = counts.critical > 0 ? 'not_ready' : counts.warning > 0 ? 'ready_with_warnings' : 'ready';

  return {
    site_name: rec.site_name,
    active_target_index: idx,
    active_target_label: t?.label || null,
    verdict,
    counts,
    issues,
  };
}