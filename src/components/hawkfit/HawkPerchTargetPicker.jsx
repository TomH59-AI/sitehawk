import { Copy, MapPin, Play, Trash2 } from "lucide-react";

const LABELS = ["Target D", "Target E", "Target F"];

export default function HawkPerchTargetPicker({ targets, activeSlot, onArm, onClear, onRun }) {
  const copy = (target) => navigator.clipboard.writeText(`${target.lat.toFixed(6)}, ${target.lng.toFixed(6)}`);
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div>
        <h3 className="font-heading font-bold text-sm text-foreground">Pick Three More Sites</h3>
        <p className="text-[11px] text-muted-foreground">Choose D, E, or F, then click the HawkPerch map. Run starts again at SARF.</p>
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
            </> : <button onClick={() => onArm(activeSlot === index ? null : index)} className={`w-full inline-flex items-center justify-center gap-1 rounded border py-1.5 text-[11px] font-semibold ${activeSlot === index ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 text-primary hover:bg-primary/10"}`}><MapPin className="w-3 h-3" /> {activeSlot === index ? "Click map now" : `Pick ${label}`}</button>}
          </div>
        );
      })}
    </div>
  );
}