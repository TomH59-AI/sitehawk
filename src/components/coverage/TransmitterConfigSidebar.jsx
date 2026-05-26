/**
 * TransmitterConfigSidebar — control panel for CoverageAnalysis.
 * Lets the user tune tower height, frequency band, and radius
 * before kicking off the CloudRF simulation.
 */

import { Radio, Play, X, AlertCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FREQUENCY_BANDS = [
  { value: "150",   label: "VHF · 150 MHz" },
  { value: "450",   label: "UHF · 450 MHz" },
  { value: "700",   label: "Low-band LTE · 700 MHz" },
  { value: "850",   label: "Cellular · 850 MHz" },
  { value: "1900",  label: "PCS · 1900 MHz" },
  { value: "2100",  label: "AWS · 2100 MHz" },
  { value: "2500",  label: "BRS/EBS · 2500 MHz" },
  { value: "3500",  label: "CBRS · 3500 MHz" },
  { value: "5800",  label: "U-NII / 5G FR1 · 5.8 GHz" },
];

export default function TransmitterConfigSidebar({
  pin,
  heightFt,
  frequencyMhz,
  radiusMi,
  onHeightChange,
  onFrequencyChange,
  onRadiusChange,
  onRun,
  onClear,
  loading,
  error,
}) {
  return (
    <div className="border border-border rounded-lg bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-purple-500" />
        <div className="font-heading font-bold text-foreground">Transmitter Setup</div>
      </div>

      {/* Pin status */}
      {pin ? (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-md p-3 text-xs space-y-1">
          <div className="flex items-center gap-1 font-semibold text-purple-700">
            <MapPin className="w-3 h-3" />
            {pin.source === "cell_tower" ? "HIFLD Cell Tower" : "Custom Location"}
          </div>
          {pin.label && <div className="text-foreground">{pin.label}</div>}
          <div className="font-mono text-muted-foreground">
            {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
          </div>
        </div>
      ) : (
        <div className="bg-muted/50 border border-dashed border-border rounded-md p-3 text-xs text-muted-foreground">
          Click anywhere on the map to drop a transmitter pin.
        </div>
      )}

      {/* Height */}
      <div className="space-y-1.5">
        <Label className="text-xs">Antenna Height (ft AGL)</Label>
        <Input
          type="number"
          value={heightFt}
          min={10}
          max={2000}
          onChange={(e) => onHeightChange(Number(e.target.value))}
        />
      </div>

      {/* Frequency band */}
      <div className="space-y-1.5">
        <Label className="text-xs">Frequency Band</Label>
        <Select value={String(frequencyMhz)} onValueChange={(v) => onFrequencyChange(Number(v))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {FREQUENCY_BANDS.map((b) => (
              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Radius */}
      <div className="space-y-1.5">
        <Label className="text-xs">Simulation Radius (mi)</Label>
        <Input
          type="number"
          value={radiusMi}
          min={1}
          max={50}
          step={1}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          onClick={onRun}
          disabled={!pin || loading}
          className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Play className="w-4 h-4 mr-2" />
          {loading ? "Simulating…" : "Run RF Simulation"}
        </Button>
        {pin && (
          <Button variant="outline" onClick={onClear} disabled={loading}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}