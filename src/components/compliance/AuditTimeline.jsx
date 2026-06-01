import { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { HC } from "./complianceConst";

export default function AuditTimeline({ log = [] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...log].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-muted/40">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4" style={{ color: HC.green }} />
          <h3 className="font-heading font-semibold text-sm">Activity</h3>
          <span className="text-xs text-muted-foreground">({log.length})</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4">
          {!sorted.length && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          <div className="space-y-2.5">
            {sorted.map((e, i) => (
              <div key={i} className="flex gap-3 text-sm border-l-2 pl-3" style={{ borderColor: HC.green }}>
                <div className="flex-1">
                  <div className="font-medium">
                    {e.action?.replace(/_/g, " ")}
                    {e.field ? <span className="text-muted-foreground"> · {e.field}</span> : null}
                  </div>
                  {(e.oldValue || e.newValue) && (
                    <div className="text-xs text-muted-foreground">
                      {e.oldValue ? `${e.oldValue} → ` : ""}{e.newValue}
                    </div>
                  )}
                  {e.note && <div className="text-xs text-muted-foreground italic">{e.note}</div>}
                </div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}<br />{e.user}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}