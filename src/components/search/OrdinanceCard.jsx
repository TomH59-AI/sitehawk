import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import TelecomOrdinanceSections from "./TelecomOrdinanceSections";
import ComplianceSummaryTable from "./ComplianceSummaryTable";

export default function OrdinanceCard({ ordinance }) {
  const [expanded, setExpanded] = useState(false);
  if (!ordinance) return null;

  // Fields to skip from the generic grid (handled specially)
  const SKIP = new Set(["section_ref", "section_title", "ldc_display", "jurisdiction", "compliance_summary"]);
  const entries = Object.entries(ordinance).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== "");

  const sections = ordinance.section_title
    ? ordinance.section_title.split(" | ").map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h3 className="font-heading font-semibold text-foreground text-sm">Local Ordinance Data</h3>
          {ordinance.jurisdiction && (
            <p className="text-xs text-muted-foreground">{ordinance.jurisdiction}</p>
          )}
        </div>
        {/* LDC Reference Badge */}
        {ordinance.ldc_display ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-widest font-bold text-cyan-500 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-md">LDC REF</span>
            <span className="font-mono text-sm font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-lg">{ordinance.ldc_display}</span>
          </div>
        ) : (
          <div className="ml-auto">
            <span className="text-xs text-muted-foreground italic">LDC Reference Pending</span>
          </div>
        )}
      </div>

      {/* Stats grid */}
      {entries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-background/40 border border-border/50 px-3 py-2">
              <p className="text-xs text-muted-foreground capitalize mb-0.5">{key.replace(/_/g, " ")}</p>
              <p className="text-xs font-medium text-foreground break-words">{String(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Collapsible sections list */}
      {sections.length > 0 && (
        <div className="border border-cyan-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-cyan-500/5 hover:bg-cyan-500/10 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-cyan-400">View all referenced sections ({sections.length})</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-cyan-400" /> : <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />}
          </button>
          {expanded && (
            <ul className="px-4 py-3 space-y-1.5 bg-background/30">
              {sections.map((sec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="text-cyan-500 mt-0.5 shrink-0">•</span>
                  <span>{sec}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ComplianceSummaryTable summary={ordinance.compliance_summary} />
      <TelecomOrdinanceSections ordinance={ordinance} />
    </div>
  );
}