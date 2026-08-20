/**
 * SourceBadge — tiny inline provenance tag shown next to each Section 2 zoning
 * field value. Muted, small-caps. Canonical tags:
 *   [Ordinance] · [Verified] · [Parcel Data] · [AI Research] · [Manual] · [Manual edit]
 *
 * "Ordinance" is the strongest tag we can show: the value came out of the
 * SiteHawk ordinance registry, quoted from the jurisdiction's published code and
 * carrying its section number. Before this existed, registry-sourced values fell
 * through normalizeSource's final `return "manual"` and were badged MANUAL —
 * our best-sourced data was being presented to subscribers as if a human had
 * typed it in, and it was counted in the "Manual" tally on the header strip.
 */

const STYLES = {
  ordinance:     { label: "Ordinance",    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  verified:      { label: "Verified",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  parcel:        { label: "Parcel Data",  cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  ai:            { label: "AI Research",  cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  shared:        { label: "Team entry",   cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  manual:        { label: "Manual",       cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "manual edit": { label: "Manual edit",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

// Normalize any backend source string → one of the canonical tag keys.
export function normalizeSource(source, hasValue) {
  const s = String(source || "").toLowerCase();
  if (s === "manual edit") return "manual edit";
  if (!hasValue) return "manual";
  // A value another subscriber researched and confirmed by hand. Checked BEFORE
  // the registry test because its source string also contains "SiteHawk" — and
  // a human's entry must never be dressed up as a cited ordinance value.
  if (s.includes("user") || s.includes("team entry")) return "shared";
  // "SiteHawk Registry" and "SiteHawk Registry (cited)" — our own ordinance library.
  if (s.includes("registry") || s.includes("sitehawk")) return "ordinance";
  if (s.includes("zoneomics")) return "verified";
  // Realie is the primary parcel source; Regrid is the fallback behind it.
  if (s.includes("realie") || s.includes("regrid")) return "parcel";
  if (s === "ai" || s.includes("web") || s.includes("research") || s.includes("notion")) return "ai";
  return "manual";
}

export default function SourceBadge({ tag }) {
  const cfg = STYLES[tag] || STYLES.manual;
  return (
    <span
      className={`inline-block ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider align-middle ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
