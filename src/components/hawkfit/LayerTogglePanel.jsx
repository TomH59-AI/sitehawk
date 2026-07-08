import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const LAYERS = [
  { key: "parcel", label: "Parcel Boundary" },
  { key: "fallZone", label: "Fall Zone" },
  { key: "compound", label: "Compound" },
];

// HawkFit Map — show/hide map overlay layers.
export default function LayerTogglePanel({ layers, onToggle }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="font-heading font-semibold text-sm text-foreground">Layers</h3>
      {LAYERS.map((l) => (
        <div key={l.key} className="flex items-center justify-between">
          <Label className="text-xs">{l.label}</Label>
          <Switch checked={layers[l.key]} onCheckedChange={(v) => onToggle(l.key, v)} />
        </div>
      ))}
    </div>
  );
}