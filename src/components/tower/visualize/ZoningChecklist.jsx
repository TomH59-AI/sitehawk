/**
 * ZoningChecklist — renders the CUP + PE structural-letter compliance badges
 * derived from the Notion zoning lookup. Tiny, presentational only.
 */

import { CheckCircle2, AlertTriangle, FileText, Loader2 } from "lucide-react";

export default function ZoningChecklist({ flags, loading }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking Notion zoning rules…
      </div>
    );
  }
  if (!flags) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Zoning compliance flags will appear here once analysis runs.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {flags.jurisdiction && (
        <div className="text-[10px] font-mono tracking-wider text-muted-foreground uppercase">
          Jurisdiction · {flags.jurisdiction}
        </div>
      )}

      {flags.requires_cup ? (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs font-bold">⚠️ Conditional Use Permit Required</div>
            <div className="text-[11px] opacity-80">Public hearing + neighbor notice will likely be needed.</div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs font-bold">By-right — no CUP needed</div>
            <div className="text-[11px] opacity-80">Administrative approval pathway available.</div>
          </div>
        </div>
      )}

      {flags.requires_pe_letter && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300">
          <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs font-bold">📋 PE Structural Letter Required</div>
            <div className="text-[11px] opacity-80">Licensed PE must certify foundation + fall-zone.</div>
          </div>
        </div>
      )}

      {flags.evidence && (
        <div className="text-[10px] font-mono text-muted-foreground italic pl-2 border-l-2 border-border">
          {flags.evidence}
        </div>
      )}
    </div>
  );
}