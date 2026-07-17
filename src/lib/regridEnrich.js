/**
 * regridEnrich — per-target precision enrichment layer for the parcel pipeline.
 * NOW ROUTED THROUGH REALIE. Calls the authenticated `realieParcelsInRing`
 * backend function in click mode (single parcel under the target lat/lon), so
 * every per-target enrichment is served by Realie — our primary provider — not
 * Regrid. Additive only — never blocks or replaces base parcel data.
 * In-memory cache keyed by coordinates so re-renders never re-fetch.
 *
 * (Kept the historical `regridEnrichTarget`/`normalizeRegridEnrich` names so the
 * many call sites don't need touching; the data now comes from Realie.)
 */

import { realieParcelsInRing } from "@/functions/realieParcelsInRing";

// coords key → Promise (dedupes in-flight requests too)
const cache = new Map();

export async function regridEnrichTarget(lat, lon) {
  const key = `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`;
  if (cache.has(key)) return cache.get(key);
  const promise = realieParcelsInRing({ mode: "click", lat: Number(lat), lon: Number(lon) })
    .then((res) => res?.data ?? res);
  cache.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

// Normalize the enrichment response into the fields the UI displays.
// Prefers the Realie click-mode shape ({ parcel } or { parcels:[...] } with
// flat zoning/land_use/data_source fields); falls back to the legacy
// site_intel/lbcs shape for any older cached responses.
export function normalizeRegridEnrich(raw) {
  if (!raw) return null;
  const p = raw.parcel || raw.result || raw.parcels?.[0] || raw;
  return {
    data_source: raw.data_source || p.data_source || "realie",
    zoning: p.zoning || p.zoning_code || p.site_intel?.zoning || null,
    zoning_description: p.zoning_description || p.land_use || p.site_intel?.zoning_description || null,
    zoning_type: p.zoning_type || p.zone_class || p.site_intel?.zoning_type || null,
    zoning_code_link: p.zoning_code_link || raw.zoning_code_link || null,
    site_intel: p.site_intel || raw.site_intel || null,
    lbcs: p.lbcs || raw.lbcs || null,
    demographics: p.demographics || raw.demographics || null,
  };
}

export const isRegridSource = (e) =>
  e?.data_source === "realie" || e?.data_source === "regrid" || e?.data_source === "regrid-cache";

// "AG-1 — Agricultural District (Agriculture)" style label from Regrid zoning fields.
export function regridZoningLabel(e) {
  if (!e?.zoning && !e?.zoning_description) return null;
  const base = [e.zoning, e.zoning_description].filter(Boolean).join(" — ");
  return e.zoning_type && e.zoning_type !== e.zoning_description ? `${base} (${e.zoning_type})` : base;
}

export function regridFemaLabel(e) {
  const zone = e?.site_intel?.fema_flood_zone;
  if (!zone) return "";
  const sub = e.site_intel.fema_flood_zone_subtype;
  return `FEMA Zone: ${zone}${sub ? ` (${sub})` : ""}`;
}

export function regridFloodComposition(e) {
  const raw = e?.site_intel?.fema_flood_zone_raw;
  if (!Array.isArray(raw) || !raw.length) return null;
  return [...raw]
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
    .map((z) => `${Math.min(100, Math.round(z.percent ?? 0))}% ${z.zone}${z.subtype ? ` (${String(z.subtype).toLowerCase()})` : ""}`)
    .join(", ");
}

export function regridSfhaWarning(e) {
  const raw = e?.site_intel?.fema_flood_zone_raw;
  if (!Array.isArray(raw)) return null;
  const sfha = raw.find((z) => /^[AV]/i.test(String(z.zone ?? "")) && (z.percent ?? 0) >= 1);
  if (!sfha) return null;
  return `Partial SFHA: Zone ${sfha.zone} covers ~${Math.round(sfha.percent)}% of parcel — verify compound placement outside SFHA`;
}

export function regridNriLabel(e) {
  const r = e?.site_intel?.fema_nri_risk_rating;
  if (!r) return null;
  return `NRI Hazard Risk: ${r}`;
}

export function regridFirmDateLabel(e) {
  const d = e?.site_intel?.fema_flood_zone_date;
  if (!d) return null;
  return `FIRM effective ${d}`;
}

export function regridPowerLabel(e) {
  const d = e?.site_intel?.transmission_line_distance_ft ?? e?.site_intel?.transmission_line_distance;
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

// LBCS Ownership — who owns the parcel class (private, government, utility, religious…).
// Changes the outreach playbook before any mailer goes out.
export function regridOwnershipLabel(e) {
  const v = e?.lbcs?.ownership_desc || e?.lbcs?.ownership_description || null;
  if (!v) return null;
  return `🏛 ${v}`;
}

// Top 1–2 NRI hazard drivers (e.g. "Wind: Very High · Wildfire: Low").
// Accepts either an array of {hazard/name, rating} objects or plain strings.
export function regridNriDriversLabel(e) {
  const si = e?.site_intel || {};
  const raw = si.fema_nri_top_hazards || si.fema_nri_hazards || si.nri_hazards || null;
  if (!Array.isArray(raw) || !raw.length) return null;
  const parts = raw.slice(0, 2).map((h) => {
    if (typeof h === "string") return h;
    const name = h.hazard || h.name || h.type;
    const rating = h.rating || h.risk_rating || h.rating_desc;
    return [name, rating].filter(Boolean).join(": ");
  }).filter(Boolean);
  return parts.length ? `🌪 ${parts.join(" · ")}` : null;
}