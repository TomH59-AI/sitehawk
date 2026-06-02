/**
 * targetScorecard — DISPLAY-ONLY Target Selection Scorecard derivation.
 *
 * This NEVER changes Target A/B/C ranking. It only explains, from data already
 * on the ScipRecord, why each parcel_target was selected and its strengths/risks.
 *
 * Rules:
 *  - If the app already computed an overall score (target.score), use it and
 *    mark the scorecard source as "saved".
 *  - Otherwise derive a transparent, display-only overall from the per-category
 *    scores and label it "estimated".
 *  - Per-category: only score from real fields. If a category has no data,
 *    return score=null with note "Not scored: data unavailable." — never invent.
 */

const REC_STATUS = {
  0: "Primary recommendation",
  1: "Backup option",
  2: "Backup option",
};

export function recommendationFor(index, label) {
  if ((label || "").toLowerCase().startsWith("extra")) return "Reviewed but not selected";
  return REC_STATUS[index] ?? "Reviewed but not selected";
}

// clamp to 0..100
const c = (n) => Math.max(0, Math.min(100, Math.round(n)));
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// Each category builder returns { score|null, explanation, source }.
function cat(score, explanation, source) {
  if (score === null || score === undefined) return { score: null, explanation: "Not scored: data unavailable.", source: source || "" };
  return { score: c(score), explanation, source: source || "" };
}

// ── RF Fit — proximity to ring center (closer = better) + any saved RF enrichment.
function rfFit(target, center, rf) {
  if (rf?.rf && (rf.rf.verdict || rf.rf.tower)) {
    const ok = /clear|good|viable|suitable/i.test(rf.rf.verdict || "");
    return cat(ok ? 88 : 70, rf.rf.verdict || "RF proximity analysis available for this target.", "rf_enrichment.rf");
  }
  if (center && has(target.latitude) && has(target.longitude)) {
    const d = haversineMi(center.lat, center.lon, Number(target.latitude), Number(target.longitude));
    // within 0.25mi ≈ 92, at 1.0mi ≈ 60
    const score = 92 - Math.min(35, d * 32);
    return cat(score, `~${d.toFixed(2)} mi from search-ring center.`, "parcel_targets.latitude/longitude");
  }
  return cat(null, null, "rf_enrichment / parcel_targets coordinates");
}

// ── Zoning Fit — has a zoning classification (non-residential favored).
function zoningFit(target) {
  if (!has(target.zoning_classification)) return cat(null, null, "parcel_targets.zoning_classification");
  const z = String(target.zoning_classification).toLowerCase();
  const residential = /\br-?\d|resid/i.test(z);
  return residential
    ? cat(55, `Zoned ${target.zoning_classification} — residential context may complicate approval.`, "parcel_targets.zoning_classification")
    : cat(85, `Zoned ${target.zoning_classification} — generally workable for tower siting.`, "parcel_targets.zoning_classification");
}

// ── Parcel Size / Buildability — acreage threshold for a compound.
function parcelSize(target) {
  if (!has(target.acreage)) return cat(null, null, "parcel_targets.acreage");
  const a = Number(target.acreage);
  let score, note;
  if (a >= 2) { score = 92; note = `${a.toFixed(2)} ac — ample room for the compound + setbacks.`; }
  else if (a >= 1) { score = 82; note = `${a.toFixed(2)} ac — meets typical compound + setback needs.`; }
  else if (a >= 0.5) { score = 68; note = `${a.toFixed(2)} ac — workable but tighter for setbacks.`; }
  else { score = 45; note = `${a.toFixed(2)} ac — small; verify setbacks/fall zone fit.`; }
  return cat(score, note, "parcel_targets.acreage");
}

// ── Utility Access — power provider identified (record-level power data).
function utilityAccess(power) {
  const name = power?.power?.provider_name || power?.power?.company || power?.power?.utility;
  const dist = power?.power?.distance_miles ?? power?.power?.transmission_distance_miles;
  if (has(name) || has(dist)) {
    const note = [has(name) ? `Power provider: ${name}.` : "Power provider identified.", has(dist) ? `~${Number(dist).toFixed(2)} mi to power.` : ""].filter(Boolean).join(" ");
    return cat(has(dist) ? c(90 - Math.min(30, Number(dist) * 18)) : 80, note, "power_airport_maps.power");
  }
  return cat(null, null, "power_airport_maps.power");
}

// ── Fiber Access — saved fiber distance/operator on the record.
function fiberAccess(rec) {
  const ec = rec?.existing_conditions || {};
  const fiberOp = rec?.power_airport_maps?.fiber?.operator || ec.fiber_operator;
  const fiberDist = rec?.power_airport_maps?.fiber?.distance_miles ?? ec.fiber_distance_miles;
  if (has(fiberOp) || has(fiberDist)) {
    const note = [has(fiberOp) ? `Fiber: ${fiberOp}.` : "Fiber infrastructure mapped nearby.", has(fiberDist) ? `~${Number(fiberDist).toFixed(2)} mi.` : ""].filter(Boolean).join(" ");
    return cat(has(fiberDist) ? c(88 - Math.min(30, Number(fiberDist) * 14)) : 75, note, "fiber data");
  }
  return cat(null, null, "fiber data");
}

// ── Access Road Potential — existing_conditions.access_notes.
function accessRoad(rec) {
  const notes = rec?.existing_conditions?.access_notes;
  if (!has(notes)) return cat(null, null, "existing_conditions.access_notes");
  const risky = /no access|landlock|no frontage|easement needed|difficult/i.test(notes);
  return cat(risky ? 55 : 80, notes, "existing_conditions.access_notes");
}

// ── Airport / FAA Risk — nearest airport distance (farther = lower risk).
function airportRisk(rec) {
  const ap = rec?.power_airport_maps?.airport || {};
  const dist = ap.distance_miles ?? ap.crow_miles;
  if (!has(dist)) return cat(null, null, "power_airport_maps.airport");
  const d = Number(dist);
  let score, note;
  if (d >= 5) { score = 90; note = `Nearest airport ~${d.toFixed(1)} mi — lower apparent FAA risk.`; }
  else if (d >= 2) { score = 72; note = `Nearest airport ~${d.toFixed(1)} mi — review FAA 7460 obstruction.`; }
  else { score = 50; note = `Nearest airport ~${d.toFixed(1)} mi — close; FAA review likely.`; }
  return cat(score, note, "power_airport_maps.airport");
}

// ── Environmental / Flood Risk — FEMA flood zone (lower risk = higher score).
function floodRisk(target, rec) {
  const fema = target.fema_risk_factor || rec?.existing_conditions?.flood_zone;
  const wet = rec?.existing_conditions?.wetland_concerns;
  if (!has(fema) && !has(wet)) return cat(null, null, "fema_risk_factor / existing_conditions");
  const high = /\b(AE|A|VE|V|AO|AH)\b|high/i.test(fema || "");
  const wetlandFlag = has(wet) && !/none|no known|n\/a/i.test(wet);
  const note = [has(fema) ? `FEMA: ${fema}.` : "", wetlandFlag ? `Wetlands: ${wet}.` : ""].filter(Boolean).join(" ") || "Low apparent flood/wetland risk.";
  let score = 85;
  if (high) score -= 30;
  if (wetlandFlag) score -= 15;
  return cat(score, note, "fema_risk_factor / existing_conditions");
}

// ── Owner Outreach Readiness — owner name + mailing address present.
function ownerReadiness(target) {
  const owner = has(target.owner_name);
  const mail = has(target.mailing_address);
  if (!owner && !mail) return cat(null, null, "parcel_targets.owner_name/mailing_address");
  if (owner && mail) return cat(90, "Owner name and mailing address available — ready for outreach.", "parcel_targets.owner_name/mailing_address");
  return cat(60, owner ? "Owner name available; mailing address missing." : "Mailing address available; owner name missing.", "parcel_targets.owner_name/mailing_address");
}

export const CATEGORY_ORDER = [
  "RF Fit", "Zoning Fit", "Parcel Size / Buildability", "Utility Access",
  "Fiber Access", "Access Road Potential", "Airport / FAA Risk",
  "Environmental / Flood Risk", "Owner Outreach Readiness",
];

/**
 * buildScorecard(record, index) → {
 *   label, recommendation, overall, overallSource ("saved"|"estimated"|null),
 *   categories: { [name]: {score, explanation, source} },
 *   whyBullets: string[],
 * }
 */
export function buildScorecard(record, index) {
  const targets = Array.isArray(record?.parcel_targets) ? record.parcel_targets : [];
  const target = targets[index] || {};
  const label = target.label || ["Target A", "Target B", "Target C"][index] || `Target ${index + 1}`;
  const center = (has(record?.latitude) && has(record?.longitude)) ? { lat: Number(record.latitude), lon: Number(record.longitude) } : null;

  // RF enrichment is keyed by active_target_index; only Target A normally has it.
  const rfSlot = record?.rf_enrichment?.[String(index)] || (index === (record?.active_target_index || 0) ? record?.rf_enrichment?.[String(record?.active_target_index || 0)] : null);
  // Power/airport maps are generated for the active Target A only.
  const power = index === (record?.active_target_index || 0) ? record?.power_airport_maps : null;

  const categories = {
    "RF Fit": rfFit(target, center, rfSlot),
    "Zoning Fit": zoningFit(target),
    "Parcel Size / Buildability": parcelSize(target),
    "Utility Access": utilityAccess(power),
    "Fiber Access": index === (record?.active_target_index || 0) ? fiberAccess(record) : cat(null, null, "fiber data"),
    "Access Road Potential": index === (record?.active_target_index || 0) ? accessRoad(record) : cat(null, null, "existing_conditions.access_notes"),
    "Airport / FAA Risk": airportRisk(power ? record : {}),
    "Environmental / Flood Risk": floodRisk(target, index === (record?.active_target_index || 0) ? record : {}),
    "Owner Outreach Readiness": ownerReadiness(target),
  };

  // Overall: use the saved score if present, else average the scored categories.
  let overall = null, overallSource = null;
  if (has(target.score)) {
    overall = c(Number(target.score));
    overallSource = "saved";
  } else {
    const scored = Object.values(categories).map((x) => x.score).filter((s) => s !== null);
    if (scored.length) {
      overall = c(scored.reduce((a, b) => a + b, 0) / scored.length);
      overallSource = "estimated";
    }
  }

  return {
    label,
    recommendation: recommendationFor(index, label),
    overall,
    overallSource,
    categories,
    whyBullets: whyBullets(record, index, target, categories),
  };
}

// "Why this target?" — 3-6 bullets from available data only. Never invents.
function whyBullets(record, index, target, categories) {
  const out = [];
  // Saved score reasons take priority (already factual from the ranking fn).
  if (Array.isArray(target.score_reasons) && target.score_reasons.length) {
    target.score_reasons.slice(0, 6).forEach((r) => has(r) && out.push(r));
  }
  if (out.length < 6) {
    const center = (has(record?.latitude) && has(record?.longitude) && has(target.latitude) && has(target.longitude))
      ? haversineMi(Number(record.latitude), Number(record.longitude), Number(target.latitude), Number(target.longitude)) : null;
    if (center !== null && !out.some((b) => /ring/i.test(b))) out.push(`~${center.toFixed(2)} mi from search-ring center.`);
    if (has(target.acreage) && !out.some((b) => /ac\b|acre/i.test(b))) out.push(`Parcel size ${Number(target.acreage).toFixed(2)} ac.`);
    if (has(target.zoning_classification) && !out.some((b) => /zon/i.test(b))) out.push(`Zoned ${target.zoning_classification}.`);
    if (categories["Airport / FAA Risk"].score !== null && !out.some((b) => /airport|faa/i.test(b))) out.push(categories["Airport / FAA Risk"].explanation);
    if (categories["Utility Access"].score !== null && !out.some((b) => /power|provider/i.test(b))) out.push(categories["Utility Access"].explanation);
    if (has(target.mailing_address) && !out.some((b) => /mail/i.test(b))) out.push("Owner mailing address available.");
  }
  if (index > 0 && index <= 2) out.push("Backup target retained in case Target A is rejected.");
  // de-dupe & cap 6
  const seen = new Set();
  return out.filter((b) => { const k = b.toLowerCase().trim(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
}

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.7613, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}