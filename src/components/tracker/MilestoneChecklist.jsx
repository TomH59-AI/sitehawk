import { useState } from "react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MILESTONES, STATUS_META, STATUS_ORDER } from "@/lib/hawkTracker";

// The 19-gate checklist for one site. Display order only — every row updates
// independently. `rows` = HawkTrackerMilestone records for this site.
export default function MilestoneChecklist({ rows, onUpdate }) {
  const byKey = Object.fromEntries((rows || []).map((r) => [r.milestone, r]));
  const [noteDrafts, setNoteDrafts] = useState({});

  return (
    <div className="divide-y divide-border">
      {MILESTONES.map((m, i) => {
        const row = byKey[m.key];
        if (!row) return null;
        const meta = STATUS_META[row.status] || STATUS_META.pending;
        const isNa = row.status === "na";
        const draft = noteDrafts[row.id];
        return (
          <div key={m.key} className={`py-2 px-1 flex flex-col sm:flex-row sm:items-center gap-2 ${isNa ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-2 sm:w-72 shrink-0">
              <span className="text-[10px] font-mono text-muted-foreground w-5 text-right">{i + 1}</span>
              <span className={`text-sm font-medium ${row.status === "complete" ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
                {m.label}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Select value={row.status} onValueChange={(v) => onUpdate(row, { status: v })}>
                <SelectTrigger className={`w-32 h-7 text-xs border ${meta.badge}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {row.completed_at && row.status === "complete" && (
                <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                  {format(new Date(row.completed_at), "MMM d, yyyy")}
                </span>
              )}
              <Input
                placeholder="Call notes…"
                className="h-7 text-xs flex-1"
                value={draft !== undefined ? draft : (row.notes || "")}
                onChange={(e) => setNoteDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                onBlur={() => {
                  if (draft !== undefined && draft !== (row.notes || "")) onUpdate(row, { notes: draft });
                  setNoteDrafts((p) => { const n = { ...p }; delete n[row.id]; return n; });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}