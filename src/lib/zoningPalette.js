/**
 * zoningPalette — Zoneomics-convention color palette + zone-type categorization
 * for the Section 4 Zoning Map legend. The raster tile colors are baked into the
 * Zoneomics tiles; this palette mirrors that convention so the floating legend
 * swatches match what the user sees on the map.
 *
 * Used ONLY by the Section 4 Zoning Map sub-step (legend + Target A label).
 */

// Standard category palette (matches Zoneomics convention).
export const ZONE_TYPE_COLORS = {
  Residential: ["#FFEB99", "#FFC000"], // light yellow → gold (higher density)
  Commercial: ["#FF7F50", "#C0392B"], // coral → red (heavier commercial)
  Industrial: ["#9B59B6", "#8E44AD"], // purple → dark purple
  Agricultural: ["#82E0AA", "#27AE60"], // light green → dark green
  "Mixed Use": ["#5DADE2", "#5DADE2"], // light blue
  "Public / Institutional": ["#BDC3C7", "#BDC3C7"], // gray
  "Overlay / Special": ["#F1948A", "#F1948A"], // salmon
};

// Sort order for the legend (Residential first, Special / Other last).
const TYPE_ORDER = [
  "Residential",
  "Commercial",
  "Industrial",
  "Agricultural",
  "Mixed Use",
  "Public / Institutional",
  "Overlay / Special",
];

// Normalize an arbitrary Zoneomics zone_type string into a canonical category.
export function normalizeZoneType(rawType, code = "") {
  const t = `${rawType || ""} ${code || ""}`.toLowerCase();
  if (/resid|^r[-\d]|dwelling|housing/.test(t)) return "Residential";
  if (/commerc|^c[-\d]|business|retail|office/.test(t)) return "Commercial";
  if (/indust|^i[-\d]|manufactur|warehouse/.test(t)) return "Industrial";
  if (/agric|^a[-\d]|farm|rural/.test(t)) return "Agricultural";
  if (/mixed|^mu|mu[-\d]/.test(t)) return "Mixed Use";
  if (/public|institut|civic|gov|school|park/.test(t)) return "Public / Institutional";
  if (/overlay|special|planned|pud|pd/.test(t)) return "Overlay / Special";
  return "Overlay / Special";
}

// Pick a swatch color for a district. Uses the category's low color by default,
// bumps to the high color when the code hints at higher density (R-2/C-2/I-2…).
export function swatchColor(category, code = "") {
  const pair = ZONE_TYPE_COLORS[category] || ZONE_TYPE_COLORS["Overlay / Special"];
  const m = String(code).match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 1;
  return n >= 2 ? pair[1] : pair[0];
}

// Build a normalized, de-duped, sorted legend list from raw district entries.
// Each input: { zone_code, zone_name, zone_type }. Output adds: category, color.
export function buildLegend(districts = []) {
  const seen = new Map();
  for (const d of districts) {
    const code = (d.zone_code || "").trim();
    if (!code || seen.has(code)) continue;
    const category = normalizeZoneType(d.zone_type, code);
    seen.set(code, {
      code,
      name: d.zone_name || "",
      type: d.zone_type || category,
      category,
      color: swatchColor(category, code),
    });
  }
  const list = Array.from(seen.values());
  list.sort((a, b) => {
    const oa = TYPE_ORDER.indexOf(a.category);
    const ob = TYPE_ORDER.indexOf(b.category);
    if (oa !== ob) return oa - ob;
    return a.code.localeCompare(b.code);
  });
  return list;
}