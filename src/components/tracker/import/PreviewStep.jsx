import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { MILESTONE_LABELS } from "@/lib/hawkTracker";

// Step 3 — preview: first 10 rows as they will import, per-row flags, counts,
// skipped list, and the "update existing instead of skipping" toggle.
export default function PreviewStep({ plan, updateExisting, onToggleUpdate }) {
  const { creates, updates, skipped, warningCount } = plan;
  const previewRows = [...creates, ...updates].slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 font-semibold">{creates.length} sites ready</span>
        {updates.length > 0 && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-300 font-semibold">{updates.length} existing sites will update</span>}
        <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 font-semibold">{warningCount} with warnings</span>
        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-300 font-semibold">{skipped.length} skipped</span>
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
        <Checkbox checked={updateExisting} onCheckedChange={onToggleUpdate} />
        Update status/notes on existing sites instead of skipping duplicates
      </label>

      <div className="rounded-lg border border-border overflow-auto max-h-[40vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="px-2 py-1.5">Row</th>
              <th className="px-2 py-1.5">Site</th>
              <th className="px-2 py-1.5">Carrier</th>
              <th className="px-2 py-1.5">Market</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">On-Air</th>
              <th className="px-2 py-1.5">Flags</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((r) => (
              <tr key={r.rowNum} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.rowNum}</td>
                <td className="px-2 py-1.5 font-medium">
                  {r.data.site_name}
                  {r.data.carrier_site_number ? <span className="font-mono text-muted-foreground"> #{r.data.carrier_site_number}</span> : null}
                  {r.existing && <span className="ml-1 text-blue-600 font-semibold">(updates existing)</span>}
                </td>
                <td className="px-2 py-1.5">{r.data.carrier || "—"}</td>
                <td className="px-2 py-1.5">{r.data.market || "—"}</td>
                <td className="px-2 py-1.5">{MILESTONE_LABELS[r.data.current_status]}{r.data.is_blocked ? " ⛔" : ""}</td>
                <td className="px-2 py-1.5 font-mono">{r.data.target_on_air || "—"}</td>
                <td className="px-2 py-1.5">
                  {r.warnings.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="w-3 h-3" /> {r.warnings.join("; ")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creates.length + updates.length > 10 && (
        <div className="text-[11px] text-muted-foreground">Showing first 10 of {creates.length + updates.length} rows.</div>
      )}

      {skipped.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-2 max-h-32 overflow-auto">
          <div className="text-[11px] font-semibold text-foreground mb-1">Skipped rows</div>
          {skipped.map((s, i) => (
            <div key={i} className="text-[11px] text-muted-foreground">
              Row {s.rowNum}: {s.reason}{s.data?.site_name ? ` — "${s.data.site_name}"` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}