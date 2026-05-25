/**
 * TransmitterConfigSidebar — config panel for /coverage-analysis.
 */

import { Antenna, Ruler, Radio, Play, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export const FREQUENCY_BANDS = [
  { value: "600",  label: "600 MHz — T-Mobile low-band" },
  { value: "700",  label: "700 MHz — Verizon / FirstNet" },
  { value: "850",  label: "850 MHz — AT&T LTE" },
  { value: "1900", label: "1900 MHz — PCS" },
  { value: "2100", label: "2100 MHz — AWS" },
  { value: "2500", label: "2500 MHz — T-Mobile mid-band" },
  { value: "3500", label: "3500 MHz — CBRS / C-Band" },
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
  if (!pin) {
    return (
      <div className="border border-border rounded-lg bg-card p-4 text-sm text-muted-foreground space-y-2">
        <Antenna className="w-5 h-5 text-purple-500" />
        <div className="font-heading font-semibold text-foreground">No transmitter</div>
        <div>Click anywhere on the map (or click an existing HIFLD cell tower) to drop a transmitter pin and configure an RF simulation.</div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="bg-gradient-to-r from-purple-500/20 to-transparent border-b border-border px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Antenna className="w-4 h-4 text-purple-500" />
          <span className="font-heading font-semibold text-sm">Transmitter Configuration</span>
        </div>
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground" title="Clear pin">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-3 space-y-4">
        <div className="bg-muted/40 rounded p-2 text-xs font-mono">
          <div className="text-[10px] text-muted-foreground tracking-wider mb-1">PIN LOCATION</div>
          <div>{pin.lat.toFixed(6)}, {pin.lon.toFixed(6)}</div>
          {pin.source === "cell_tower" && pin.label && (
            <div className="text-purple-600 mt-1 truncate" title={pin.label}>
              From HIFLD: {pin.label}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Antenna className="w-3.5 h-3.5" /> Antenna Height
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={20}
              max={1500}
              step={1}
              value={heightFt}
              onChange={(e) => onHeightChange(Number(e.target.value))}
              className="h-8 text-sm"
            />
            <span className="text-xs text-muted-foreground w-16">ft AGL</span>
          </div>
          <div className="text-[10px] text-muted-foreground">{Math.round(heightFt * 0.3048)} m</div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5" /> Frequency Band
          </Label>
          <Select value={String(frequencyMhz)} onValueChange={(v) => onFrequencyChange(Number(v))}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_BANDS.map((b) => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center justify-between">
            <span className="flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5" /> Analysis Radius</span>
            <span className="font-mono text-muted-foreground">{radiusMi} mi</span>
          </Label>
          <Slider
            min={1}
            max={20}
            step={1}
            value={[radiusMi]}
            onValueChange={(v) => onRadiusChange(v[0])}
          />
          <div className="text-[10px] text-muted-foreground">{Math.round(radiusMi * 1.60934)} km</div>
        </div>

        <Button onClick={onRun} disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running RF Simulation…</>
          ) : (
            <><Play className="w-4 h-4 mr-2" />Run RF Simulation</>
          )}
        </Button>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}