import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Tower Siter controls — height, compound W×D (default 75×75), lease area,
// PE-letter toggle + engineered fall radius (default 40% of height).
// PE toggle is DISABLED (greyed + tooltip citing section_ref) when the
// ordinance does not allow PE fall zones, or the tier doesn't include it.
export default function SiterControls({ controls, onChange, rules, peAllowedByTier }) {
  const set = (k, v) => onChange({ ...controls, [k]: v });
  const num = (k) => (e) => set(k, e.target.value === "" ? "" : Number(e.target.value));

  const peOrdinanceOK = rules?.pe_fall_zone_allowed === true;
  const peEnabled = peOrdinanceOK && peAllowedByTier;
  const peTooltip = !peOrdinanceOK
    ? `PE fall-zone reduction not permitted${rules?.section_ref ? ` per § ${rules.section_ref}` : " — no ordinance authorization on file"}`
    : !peAllowedByTier
      ? "PE letter toggle is a HawkVision+ feature"
      : "";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-white/50">Tower height (ft)</Label>
          <Input type="number" min={10} max={2000} value={controls.heightFt} onChange={num("heightFt")} className="h-8 bg-white/5 border-white/10 text-white" />
        </div>
        <div>
          <Label className="text-[11px] text-white/50">Engineered fall radius (ft)</Label>
          <Input
            type="number" min={1}
            placeholder={`${Math.ceil(0.4 * (controls.heightFt || 0))} (40% of H)`}
            value={controls.peRadiusFt}
            onChange={num("peRadiusFt")}
            disabled={!controls.peToggle}
            className="h-8 bg-white/5 border-white/10 text-white disabled:opacity-40"
          />
        </div>
        <div>
          <Label className="text-[11px] text-white/50">Compound W × D (ft)</Label>
          <div className="flex gap-1.5">
            <Input type="number" min={10} value={controls.compoundW} onChange={num("compoundW")} className="h-8 bg-white/5 border-white/10 text-white" />
            <Input type="number" min={10} value={controls.compoundD} onChange={num("compoundD")} className="h-8 bg-white/5 border-white/10 text-white" />
          </div>
        </div>
        <div>
          <Label className="text-[11px] text-white/50">Lease area W × D (ft)</Label>
          <div className="flex gap-1.5">
            <Input type="number" min={10} value={controls.leaseW} onChange={num("leaseW")} className="h-8 bg-white/5 border-white/10 text-white" />
            <Input type="number" min={10} value={controls.leaseD} onChange={num("leaseD")} className="h-8 bg-white/5 border-white/10 text-white" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between" title={peTooltip}>
        <div>
          <Label className={`text-xs font-semibold ${peEnabled ? "text-white" : "text-white/30"}`}>PE letter — engineered fall radius</Label>
          {peTooltip && <p className="text-[10px] text-white/35">{peTooltip}</p>}
        </div>
        <Switch checked={controls.peToggle && peEnabled} disabled={!peEnabled} onCheckedChange={(v) => set("peToggle", v)} />
      </div>
    </div>
  );
}