import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

// HawkFit Map — tower + compound dimension controls.
export default function TowerControls({ heightFt, widthFt, depthFt, onChange }) {
  const field = (label, key, value) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(key, Number(e.target.value) || 0)}
        className="h-8"
      />
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-heading font-semibold text-sm text-foreground">Tower Controls</h3>
      <div className="grid grid-cols-3 gap-3">
        {field("Height (ft)", "heightFt", heightFt)}
        {field("Compound W (ft)", "widthFt", widthFt)}
        {field("Compound D (ft)", "depthFt", depthFt)}
      </div>
      <p className="text-xs text-muted-foreground">Fall-zone radius equals tower height. Drag the tower pin on the map.</p>
    </div>
  );
}