/**
 * SourceBadge — tiny inline provenance tag shown next to each Section 2 zoning
 * field value. Muted, small-caps. Maps a raw source string to one of the
 * canonical SCIP tags: [Notion] · [Zoneomics] · [AI] · [Manual] · [Manual edit].
 */

const STYLES = {
  notion:        { label: "Notion",      cls: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  zoneomics:     { label: "Zoneomics",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  ai:            { label: "AI",          cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  manual:        { label: "Manual",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  "manual edit": { label: "Manual edit", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
};

// Normalize any backend source string → one of the canonical tag keys.
export function normalizeSource(source, hasValue) {
  const s = String(source || "").toLowerCase();
  if (s === "manual edit") return "manual edit";
  if (!hasValue) return "manual";
  if (s.includes("notion")) return "notion";
  if (s.includes("zoneomic")) return "zoneomics";
  if (s === "ai" || s.includes("web") || s.includes("oxylabs") || s.includes("municode") || s.includes("realie")) return "ai";
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