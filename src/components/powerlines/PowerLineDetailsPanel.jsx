/**
 * PowerLineDetailsPanel — Sidebar showing details for the currently-clicked
 * transmission line segment: OWNER, VOLTAGE, SUB_1 → SUB_2, type, status.
 */

import { Zap, ArrowRight, X } from "lucide-react";

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-sm py-1.5 border-b border-border/60 last:border-0">
      <div className="text-muted-foreground text-xs uppercase tracking-wider">{label}</div>
      <div className="text-foreground font-medium break-words">{value || <span className="text-muted-foreground italic">—</span>}</div>
    </div>
  );
}

export default function PowerLineDetailsPanel({ selected, onClose }) {
  if (!selected) {
    return (
      <div className="border border-border rounded-lg bg-card p-4 text-sm text-muted-foreground">
        <Zap className="w-5 h-5 text-amber-500 mb-2" />
        Click any transmission line on the map to inspect its owner, voltage, and substation endpoints (SUB_1 → SUB_2).
      </div>
    );
  }

  const p = selected.properties || {};
  const voltage = p.VOLTAGE > 0 ? `${p.VOLTAGE} kV` : (p.VOLT_CLASS || "Unknown");

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="bg-gradient-to-r from-amber-500/20 to-transparent border-b border-border px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <span className="font-heading font-semibold text-sm">Line Segment Details</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3 py-2">
        {/* SUB_1 → SUB_2 highlight */}
        <div className="bg-muted/50 rounded p-2 mb-2">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider mb-1">CONNECTION</div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="truncate">{p.SUB_1 || "—"}</span>
            <ArrowRight className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">{p.SUB_2 || "—"}</span>
          </div>
        </div>
        <Row label="Owner" value={p.OWNER} />
        <Row label="Voltage" value={voltage} />
        <Row label="Volt Class" value={p.VOLT_CLASS} />
        <Row label="Type" value={p.TYPE} />
        <Row label="Status" value={p.STATUS} />
        <Row label="Object ID" value={p.OBJECTID} />
      </div>
    </div>
  );
}