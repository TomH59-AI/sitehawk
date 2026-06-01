import { Check, X } from "lucide-react";
import { TRIGGERS, triggersFired, NEPA_BADGE, HC } from "./complianceConst";

// The 8 NEPA triggers with check/X, a "triggers fired" count, and the NEPA determination badge.
export default function TriggersPanel({ flags, determination, onToggle, disturbanceArea, disturbanceDepth, projectType, onField }) {
  const fired = triggersFired(flags);
  const badge = NEPA_BADGE[determination] || NEPA_BADGE["Not Started"];

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-heading font-semibold">NEPA Pre-Screen · 47 CFR 1.1307(a)</h3>
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ background: badge.bg, color: badge.color || "#fff" }}>{badge.label}</span>
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: fired.length ? HC.amber : HC.ok, color: fired.length ? "#1a1a1a" : "#fff" }}>
          {fired.length} triggers fired
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2 mb-5">
        {TRIGGERS.map((t) => {
          const on = !!flags[t.key];
          return (
            <button key={t.key} onClick={() => onToggle(t.key)} className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border text-left hover:bg-muted/40 transition-colors">
              {on ? <X className="w-4 h-4 mt-0.5 shrink-0" style={{ color: HC.red }} /> : <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: HC.ok }} />}
              <div className="min-w-0">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-[11px] text-muted-foreground">{t.source}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">Project Type</span>
          <select value={projectType} onChange={(e) => onField("projectType", e.target.value)} className="w-full mt-1 border border-border rounded-lg px-2 py-1.5 bg-background">
            <option value="new_tower">New Tower</option>
            <option value="collocation">Collocation</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">Disturbance Area (sq ft)</span>
          <input type="number" value={disturbanceArea ?? ""} onChange={(e) => onField("groundDisturbanceArea", e.target.value === "" ? null : Number(e.target.value))} className="w-full mt-1 border border-border rounded-lg px-2 py-1.5 bg-background" />
        </label>
        <label className="text-sm">
          <span className="text-xs text-muted-foreground">Disturbance Depth (in)</span>
          <input type="number" value={disturbanceDepth ?? ""} onChange={(e) => onField("groundDisturbanceDepth", e.target.value === "" ? null : Number(e.target.value))} className="w-full mt-1 border border-border rounded-lg px-2 py-1.5 bg-background" />
        </label>
      </div>
    </div>
  );
}