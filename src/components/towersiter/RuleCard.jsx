import { Link } from "react-router-dom";
import { ExternalLink, ScrollText, AlertTriangle } from "lucide-react";

const fmt = (v, suffix = "") => (v == null ? "—" : `${v}${suffix}`);
const yn = (v) => (v === true ? "Yes" : v === false ? "No" : "—");

// Ordinance rule card — cites section_ref + source_url. When no ordinance row
// (or structured cols NULL) → Unverified mode banner with a Run Zoning link.
export default function RuleCard({ rules, jurisdiction, unverified }) {
  if (!rules) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">No ordinance on file for {jurisdiction || "this jurisdiction"}</span> — using
          conservative 1:1 height setback.{" "}
          <Link to="/search" className="underline font-semibold hover:text-amber-100">Run Zoning to verify →</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-2 font-heading font-bold text-white text-sm">
        <ScrollText className="w-4 h-4 text-cyan-400" /> {rules.jurisdiction || jurisdiction} — Tower Rules
        {unverified && <span className="text-amber-300 font-normal text-[10px]">(setback rule unverified — 1:1 applied)</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-white/60">
        <span>Height limit: <b className="text-white/90">{fmt(rules.height_limit_ft, "′")}</b></span>
        <span>Setback rule: <b className="text-white/90">{rules.setback_rule || "—"}</b></span>
        <span>Setback: <b className="text-white/90">{fmt(rules.setback_ft, "′")}</b></span>
        <span>Fall zone: <b className="text-white/90">{fmt(rules.fall_zone_ft, "′")}</b></span>
        <span>Permit: <b className="text-white/90">{rules.permit_type || "—"}</b></span>
        <span>PE fall-zone allowed: <b className="text-white/90">{yn(rules.pe_fall_zone_allowed)}</b></span>
        <span>Residential sep.: <b className="text-white/90">{fmt(rules.residential_separation_ft, "′")}</b></span>
        <span>Tower sep.: <b className="text-white/90">{fmt(rules.tower_separation_ft, "′")}</b></span>
        <span>Stealth required: <b className="text-white/90">{yn(rules.stealth_required)}</b></span>
        <span>Collocation req.: <b className="text-white/90">{yn(rules.collocation_required)}</b></span>
      </div>
      <div className="pt-1 border-t border-white/10 text-white/40 flex items-center gap-2 flex-wrap">
        {rules.section_ref && <span>§ {rules.section_ref}</span>}
        {rules.source_url && (
          <a href={rules.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            Source <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}