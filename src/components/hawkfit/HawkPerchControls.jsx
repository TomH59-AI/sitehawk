import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function HawkPerchControls({ controls, onChange }) {
  const numberField = (label, key, min = 0, max) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={controls[key]}
        onChange={(e) => onChange(key, Number(e.target.value) || 0)} className="h-8" />
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="font-heading font-semibold text-sm text-foreground">HawkPerch Ordinance Solver</h3>
        <p className="text-xs text-muted-foreground">Live setbacks, height cap, and engineered fall-zone rules.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {numberField("Front setback (ft)", "frontSetbackFt")}
        {numberField("Side setback (ft)", "sideSetbackFt")}
        {numberField("Rear setback (ft)", "rearSetbackFt")}
        {numberField("Max height (ft)", "maxHeightFt", 100)}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div>
          <Label className="text-xs">PE Letter</Label>
          <p className="text-[11px] text-muted-foreground">Engineered fold-over fall zone</p>
        </div>
        <Switch checked={controls.hasPELetter} onCheckedChange={(v) => onChange("hasPELetter", v)} />
      </div>
      {controls.hasPELetter && numberField("Engineered multiplier (0.1–0.9)", "fallZoneMultiplier", 0.1, 0.9)}
    </div>
  );
}