import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Radio } from "lucide-react";
import { CARRIER_PRESETS, DEFAULT_CARRIER } from "@/lib/carrierPresets";

const TOWER_TYPES = [
  { value: "self_support", label: "Self-Support Tower (SST)" },
  { value: "monopole", label: "Monopole" },
  { value: "guyed", label: "Guyed Tower" },
];

const ACCESS_PREFERENCES = [
  { value: "north", label: "North side" },
  { value: "south", label: "South side" },
  { value: "east", label: "East side" },
  { value: "west", label: "West side" },
  { value: "northeast", label: "Northeast corner" },
  { value: "northwest", label: "Northwest corner" },
  { value: "southeast", label: "Southeast corner" },
  { value: "southwest", label: "Southwest corner" },
];

export default function TowerSpecsForm({ onSubmit, defaultValues = {}, disabled = false }) {
  const [towerHeightFt, setTowerHeightFt] = useState(defaultValues.towerHeightFt || 120);
  const [towerType, setTowerType] = useState(defaultValues.towerType || "self_support");
  const [compoundSizeFt, setCompoundSizeFt] = useState(defaultValues.compoundSizeFt || 100);
  const [accessPreference, setAccessPreference] = useState(defaultValues.accessPreference || "north");
  const [carrier, setCarrier] = useState(defaultValues.carrier || DEFAULT_CARRIER);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      towerHeightFt: parseInt(towerHeightFt) || 120,
      towerType,
      compoundSizeFt: parseInt(compoundSizeFt) || 100,
      accessPreference,
      carrier,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="towerHeight">Tower Height (ft)</Label>
          <Input id="towerHeight" type="number" min="60" max="500" value={towerHeightFt} onChange={(e) => setTowerHeightFt(e.target.value)} placeholder="120" />
          <p className="text-[10px] text-muted-foreground">Above grade. Common: 80, 120, 150, 199, 250 ft</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="towerType">Tower Type</Label>
          <Select value={towerType} onValueChange={setTowerType}>
            <SelectTrigger id="towerType"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TOWER_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="compoundSize">Compound Size (ft × ft, square)</Label>
          <Input id="compoundSize" type="number" min="40" max="300" value={compoundSizeFt} onChange={(e) => setCompoundSizeFt(e.target.value)} placeholder="100" />
          <p className="text-[10px] text-muted-foreground">Centered on tower base. Common: 75×75, 100×100</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="accessPref">Preferred Access Side</Label>
          <Select value={accessPreference} onValueChange={setAccessPreference}>
            <SelectTrigger id="accessPref"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACCESS_PREFERENCES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Tower placed near this edge for shortest access road</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="carrier">Carrier Preset (RF model)</Label>
          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger id="carrier"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CARRIER_PRESETS).map(([key, p]) => (
                <SelectItem key={key} value={key}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Sets CloudRF frequency, power &amp; antenna gain. Verizon 700 MHz is the macro default for most builds.
          </p>
        </div>
      </div>
      <Button type="submit" disabled={disabled} className="w-full">
        <Radio className="w-4 h-4 mr-2" />
        Compute Tower Placement
      </Button>
    </form>
  );
}