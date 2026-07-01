/**
 * regridEnrich — Regrid precision enrichment layer for the parcel pipeline.
 * Calls the Supabase edge function regrid-parcel-search (mode=click) per target
 * lat/lon. Additive only — never blocks or replaces base Realie data.
 * In-memory cache keyed by coordinates so re-renders never re-fetch.
 */

const ENDPOINT = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/regrid-parcel-search";
const APIKEY = "sb_publishable_GMm2u8HJeCv8vboySM8CNg_IAdbCS27";

// coords key → Promise (dedupes in-flight requests too)
const cache = new Map();

export async function regridEnrichTarget(lat, lon) {
  const key = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  if (cache.has(key)) return cache.get(key);
  const promise = fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: APIKEY,
      Authorization: `Bearer ${APIKEY}`,
    },
    body: JSON.stringify({ mode: "click", lat: Number(lat), lon: Number(lon) }),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`Regrid enrichment failed (${res.status})`);
    return res.json();
  });
  cache.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

// Normalize the edge-function response (flat or nested under `parcel`) into
// the fields the UI displays.
export function normalizeRegridEnrich(raw) {
  if (!raw) return null;
  const p = raw.parcel || raw.result || raw;
  return {
    data_source: raw.data_source || p.data_source || null,
    zoning_code_link: p.zoning_code_link || raw.zoning_code_link || null,
    site_intel: p.site_intel || raw.site_intel || null,
    lbcs: p.lbcs || raw.lbcs || null,
    demographics: p.demographics || raw.demographics || null,
  };
}

export const isRegridSource = (e) =>
  e?.data_source === "regrid" || e?.data_source === "regrid-cache";

export function regridFemaLabel(e) {
  const zone = e?.site_intel?.fema_flood_zone;
  if (!zone) return "";
  const sub = e.site_intel.fema_flood_zone_subtype;
  return `FEMA Zone: ${zone}${sub ? ` (${sub})` : ""}`;
}

export function regridPowerLabel(e) {
  const d = e?.site_intel?.transmission_line_distance;
  if (d == null || d === "") return null;
  return `⚡ ${Number(d).toLocaleString()} ft to nearest transmission line`;
}

export function regridElevationLabel(e) {
  const v = e?.site_intel?.elevation_high_ft;
  if (v == null || v === "") return null;
  return `${Number(v).toLocaleString()} ft AMSL`;
}

export function regridLbcsLabel(e) {
  const parts = [e?.lbcs?.structure_desc, e?.lbcs?.activity_desc].filter(Boolean);
  if (!parts.length) return null;
  return `🏗 ${parts.join(" · ")}`;
}