import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Tower Siter controls — height, compound W×D (default 75×75), lease area,
// PE-letter toggle + engineered fall radius (default 40% of height).
export default function SiterControls({ controls, onChange, rules, peAllowedByTier }) {
  const set = (k, v) => onChange({ ...controls, [k]: v });
  const num = (k) => (e) => set(k, e.target.value === "" ? "" : Number(e.target.value));

  // Single combined "WxD" string → split on x/× into W and D
  const parseDims = (raw, wKey, dKey) => {
    const parts = raw.replace(/[xX×]/g, "x").split("x");
    const w = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    if (!isNaN(w)) set(wKey, w);
    if (!isNaN(d)) set(dKey, d);
  };

  const peOrdinanceOK = rules?.pe_fall_zone_allowed === true;
  const peOrdinanceWarning = controls.peToggle && !peOrdinanceOK && rules
    ? `⚠ Jurisdiction${rules?.section_ref ? ` § ${rules.section_ref}` : ""} does not authorize PE fall-zone reduction — for comparison only`
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-white/50">Tower height (ft)</Label>
          <Input
            type="number" min={10} max={2000}
            placeholder="e.g. 195"
            value={controls.heightFt === "" ? "" : controls.heightFt}
            onChange={(e) => set("heightFt", e.target.value === "" ? "" : Number(e.target.value))}
            className="h-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <div>
          <Label className="text-[11px] text-white/50">Engineered fall radius (ft)</Label>
          <Input
            type="number" min={1}
            placeholder={controls.heightFt ? `${Math.ceil(0.4 * Number(controls.heightFt))} ft (40%)` : "40% of height"}
            value={controls.peRadiusFt}
            onChange={num("peRadiusFt")}
            disabled={!controls.peToggle}
            className="h-8 bg-white/5 border-white/10 text-white placeholder:text-white/30 disabled:opacity-40"
          />
        </div>
        <div>
          <Label className="text-[11px] text-white/50">Compound size (W × D ft)</Label>
          <Input
            placeholder="e.g. 75x75"
            defaultValue={`${controls.compoundW}x${controls.compoundD}`}
            key={`cmp-${controls.compoundW}-${controls.compoundD}`}
            onBlur={(e) => parseDims(e.target.value, "compoundW", "compoundD")}
            className="h-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <div>
          <Label className="text-[11px] text-white/50">Lease area (W × D ft)</Label>
          <Input
            placeholder="e.g. 100x100"
            defaultValue={`${controls.leaseW}x${controls.leaseD}`}
            key={`lease-${controls.leaseW}-${controls.leaseD}`}
            onBlur={(e) => parseDims(e.target.value, "leaseW", "leaseD")}
            className="h-8 bg-white/5 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-xs font-semibold text-white">PE letter — engineered fall radius</Label>
          {peOrdinanceWarning && (
            <p className="text-[10px] text-amber-400 mt-0.5">{peOrdinanceWarning}</p>
          )}
          {!rules && (
            <p className="text-[10px] text-white/35">No ordinance on file — toggle to compare</p>
          )}
          {rules && peOrdinanceOK && (
            <p className="text-[10px] text-emerald-400">✓ Jurisdiction authorizes PE fall-zone reduction</p>
          )}
        </div>
        <Switch checked={!!controls.peToggle} onCheckedChange={(v) => set("peToggle", v)} />
      </div>
    </div>
  );
}