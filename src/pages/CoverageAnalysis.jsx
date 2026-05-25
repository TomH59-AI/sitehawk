/**
 * CoverageAnalysis — RF simulation dashboard at /coverage-analysis.
 *
 * Workflow:
 *   1. User clicks the map (or an existing HIFLD cell tower) → pin drops.
 *   2. Sidebar lets them tune height (ft), frequency band (MHz), radius (mi).
 *   3. "Run RF Simulation" hits cloudRFCoverage backend proxy with the params.
 *   4. The returned PNG_Mercator + bounds are rendered as a raster overlay
 *      on top of the satellite base, with a signal-strength legend.
 */

import { useState } from "react";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";
import CoverageMap from "../components/coverage/CoverageMap.jsx";
import TransmitterConfigSidebar from "../components/coverage/TransmitterConfigSidebar.jsx";

export default function CoverageAnalysis() {
  const [pin, setPin] = useState(null);
  const [heightFt, setHeightFt] = useState(100);
  const [frequencyMhz, setFrequencyMhz] = useState(700);
  const [radiusMi, setRadiusMi] = useState(5);
  const [overlay, setOverlay] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handlePlacePin(next) {
    setPin(next);
    setOverlay(null);
    setError(null);
    if (next.source === "cell_tower" && next.heightFt) {
      setHeightFt(next.heightFt);
    }
  }

  function handleClear() {
    setPin(null);
    setOverlay(null);
    setError(null);
  }

  async function handleRun() {
    if (!pin) return;
    setLoading(true);
    setError(null);
    setOverlay(null);
    try {
      const resp = await cloudRFCoverage({
        lat: pin.lat,
        lon: pin.lon,
        height_ft: heightFt,
        radius_mi: radiusMi,
        frequency_mhz: frequencyMhz,
        site_name: pin.label || "Coverage Analysis Pin",
        carrier: "generic",
      });
      const data = resp.data;
      if (!data?.png_url || !data?.bounds) {
        throw new Error("CloudRF did not return a coverage image.");
      }
      setOverlay({ png_url: data.png_url, bounds: data.bounds, stats: data });
      toast.success("RF simulation complete.");
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || "RF simulation failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-purple-500/15 via-transparent to-transparent border border-purple-500/30 px-5 py-4 flex items-center gap-4">
        <Radio className="w-10 h-10 text-purple-500" />
        <div className="flex-1">
          <div className="text-[10px] font-mono text-purple-700 tracking-[0.3em]">RF SIMULATION · CLOUDRF</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">
            Coverage Analysis
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Click anywhere on the map to drop a transmitter pin, tune your antenna height & frequency band, and run a live RF propagation simulation.
          </p>
        </div>
      </div>

      {/* Map + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <CoverageMap pin={pin} onPlacePin={handlePlacePin} overlay={overlay} />
        <div className="space-y-3">
          <TransmitterConfigSidebar
            pin={pin}
            heightFt={heightFt}
            frequencyMhz={frequencyMhz}
            radiusMi={radiusMi}
            onHeightChange={setHeightFt}
            onFrequencyChange={setFrequencyMhz}
            onRadiusChange={setRadiusMi}
            onRun={handleRun}
            onClear={handleClear}
            loading={loading}
            error={error}
          />
          {overlay?.stats && (
            <div className="border border-border rounded-lg bg-card p-3 text-xs space-y-1">
              <div className="font-heading font-semibold text-sm text-foreground mb-1">Simulation Stats</div>
              {overlay.stats.area_covered_sq_km != null && (
                <div className="flex justify-between"><span className="text-muted-foreground">Area covered</span><span className="font-mono">{Number(overlay.stats.area_covered_sq_km).toFixed(1)} km²</span></div>
              )}
              {overlay.stats.max_range_km != null && (
                <div className="flex justify-between"><span className="text-muted-foreground">Max range</span><span className="font-mono">{Number(overlay.stats.max_range_km).toFixed(1)} km</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Frequency</span><span className="font-mono">{frequencyMhz} MHz</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tower height</span><span className="font-mono">{heightFt} ft</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="text-[10px] font-mono text-muted-foreground tracking-wider text-center pt-2">
        SOURCE · CLOUDRF /area · ITU-R P.452 PROPAGATION MODEL · HIFLD CELL TOWERS OVERLAY
      </div>
    </div>
  );
}