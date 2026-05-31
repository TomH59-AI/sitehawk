/**
 * SourceBadge — tiny inline provenance tag shown next to each Section 2 zoning
 * field value. Muted, small-caps. Canonical tags:
 *   [Zoneomics] · [Realie] · [AI] · [Manual] · [Manual edit]
 *
 * ZONEOMICS PROMOTED TO PRIMARY (paid tier $189/mo).
 */

const STYLES = {
  zoneomics:     { label: "Zoneomics",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  realie:        { label: "Realie",      cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  ai:            { label: "AI",          cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  manual:        { label: "Manual",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "manual edit": { label: "Manual edit", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

// Normalize any backend source string → one of the canonical tag keys.
export function normalizeSource(source, hasValue) {
  const s = String(source || "").toLowerCase();
  if (s === "manual edit") return "manual edit";
  if (!hasValue) return "manual";
  if (s.includes("zoneomics")) return "zoneomics";
  if (s.includes("realie")) return "realie";
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