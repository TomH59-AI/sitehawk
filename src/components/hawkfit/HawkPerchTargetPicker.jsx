import { Copy, Play, Trash2 } from "lucide-react";

const LABELS = ["Target D", "Target E", "Target F"];

export default function HawkPerchTargetPicker({ targets, onClear, onRun }) {
  const copy = (target) => navigator.clipboard.writeText(`${target.lat.toFixed(6)}, ${target.lng.toFixed(6)}`);
  const nextLabel = LABELS[targets.findIndex((target) => !target)];
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div>
        <h3 className="font-heading font-bold text-sm text-foreground">Pick Three More Sites</h3>
        <p className="text-[11px] text-muted-foreground">
          {nextLabel ? `Click an allowable point on the HawkPerch map to save ${nextLabel}.` : "Targets D, E, and F are saved."}
        </p>
      </div>
      {LABELS.map((label, index) => {
        const target = targets[index];
        return (
          <div key={label} className="rounded-lg border border-border bg-background p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">{label}</span>
              {target && <button onClick={() => onClear(index)} className="text-muted-foreground hover:text-destructive" title={`Clear ${label}`}><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
            {target ? <>
              <p className="font-mono text-[11px] text-foreground">{target.lat.toFixed(6)}, {target.lng.toFixed(6)}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => copy(target)} className="inline-flex items-center justify-center gap-1 rounded border border-border py-1.5 text-[11px] font-semibold hover:bg-muted"><Copy className="w-3 h-3" /> Copy</button>
                <button onClick={() => onRun(target, label)} className="inline-flex items-center justify-center gap-1 rounded bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"><Play className="w-3 h-3" /> Run SARF</button>
              </div>
            </> : <p className="rounded border border-dashed border-primary/40 py-2 text-center text-[11px] font-semibold text-primary">Waiting for allowable map click</p>}
          </div>
        );
      })}
    </div>
  );
}