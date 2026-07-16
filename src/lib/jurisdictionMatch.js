// Parcel → jurisdiction matching for the Jurisdiction Resource Registry.
// Matches a ScipRecord to a JurisdictionRegistry record using the parcel data
// SiteHawk already collected (zoning_jurisdiction string, county, state).
// Never guesses: below-threshold matches are returned as "likely" candidates
// so the user can confirm or manually choose, per the registry business rules.

import { base44 } from "@/api/base44Client";

const STOPWORDS = /\b(city|town|village|township|county|of|the)\b/g;
const norm = (s) =>
  (s || "").toLowerCase().replace(STOPWORDS, "").replace(/[^a-z0-9]/g, "").trim();

// Pull "FL" out of strings like "City of Rockledge, FL"
function stateFrom(str) {
  const m = /,\s*([A-Z]{2})\b/.exec(str || "");
  return m ? m[1] : "";
}

/**
 * @returns {Promise<{best, confidence, method, countyFallback, candidates}>}
 *  best: matched JurisdictionRegistry record or null
 *  confidence: 0–100
 *  method: 'parcel_data' | 'geocoding' | null
 *  countyFallback: the county-level record for the site's county, if any
 */
export async function matchScipJurisdiction(record) {
  const state = (record.state || stateFrom(record.zoning_jurisdiction) || "").toUpperCase();
  const county = norm(record.county);
  const zjName = norm((record.zoning_jurisdiction || "").split(",")[0]);

  const pool = state
    ? await base44.entities.JurisdictionRegistry.filter({ state, active: true })
    : await base44.entities.JurisdictionRegistry.filter({ active: true }, "-updated_date", 200);

  let best = null;
  let confidence = 0;
  let method = null;

  // 1) Parcel-data name match against the SCIP's resolved zoning jurisdiction
  if (zjName) {
    const exact = pool.find((j) => norm(j.name) === zjName);
    if (exact) {
      best = exact;
      confidence = 90;
      method = "parcel_data";
    } else {
      const partial = pool.find(
        (j) => norm(j.name) && (norm(j.name).includes(zjName) || zjName.includes(norm(j.name)))
      );
      if (partial) {
        best = partial;
        confidence = 65;
        method = "parcel_data";
      }
    }
  }

  // County fallback record (also becomes best if nothing else matched)
  const countyFallback =
    (county &&
      pool.find(
        (j) =>
          ["county", "unincorporated_county"].includes(j.jurisdiction_type) &&
          norm(j.county) === county
      )) ||
    null;

  if (!best && countyFallback) {
    best = countyFallback;
    confidence = 50;
    method = "geocoding";
  }

  return { best, confidence, method, countyFallback, candidates: pool };
}

/** Search the registry for the manual picker. */
export async function searchJurisdictions(query) {
  const all = await base44.entities.JurisdictionRegistry.list("-updated_date", 500);
  const q = (query || "").toLowerCase().trim();
  if (!q) return all.filter((j) => j.active !== false);
  return all.filter(
    (j) =>
      j.active !== false &&
      [j.name, j.state, j.county].some((f) => (f || "").toLowerCase().includes(q))
  );
}