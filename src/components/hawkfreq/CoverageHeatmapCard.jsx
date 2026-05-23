/**
 * CoverageHeatmapCard — CloudRF /area heatmap for Target A.
 * Single button runs ONE height; user can re-run at different heights (80/100/120/150/199 ft)
 * to justify tower-height requests. Renders PNG + key stats.
 */

import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import Section1Shell from "../scip/section1/Section1Shell";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";
import { Radio } from "lucide-react";

const HEIGHTS = [80, 100, 120, 150, 199];

export default function CoverageHeatmapCard({ targetLat, targetLon, siteName }) {
  const [height, setHeight] = useState(199);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    const lat = parseFloat(targetLat);
    const lon = parseFloat(targetLon);
    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Target A coordinates required — run Hawk Vision first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await cloudRFCoverage({
        lat, lon, height_ft: height, radius_mi: 5, site_name: siteName || "Target A",
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message || "CloudRF call failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section1Shell
      step={1}
      title="Area Coverage Heatmap"
      subtitle={`Target A · ${height} ft AGL · 700 MHz · 40 W omni · CloudRF /area`}
      icon={Radio}
      generateLabel={result ? "RE-RUN AT HEIGHT" : "GENERATE HEATMAP"}
      onGenerate={handleGenerate}
      loading={loading}
    >
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-muted-foreground">HEIGHT (ft AGL):</span>
        {HEIGHTS.map((h) => (
          <button
            key={h}
            onClick={() => setHeight(h)}
            className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold tracking-wider border transition-colors ${
              h === height
                ? "bg-cyan-500 border-cyan-600 text-[#0C1B2E]"
                : "bg-card border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {h}'
          </button>
        ))}
      </div>

      {error && <div className="px-4 py-2 bg-red-500/10 text-xs text-red-700">{error}</div>}

      {result?.png_url ? (
        <div>
          <div className="bg-[#0a0e17] flex items-center justify-center p-3">
            <img
              src={result.png_url}
              alt="CloudRF coverage heatmap"
              crossOrigin="anonymous"
              className="max-w-full h-auto rounded shadow-2xl"
              style={{ maxHeight: 480 }}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
            <Stat label="Area Covered" value={result.area_covered_sq_km != null ? `${Number(result.area_covered_sq_km).toFixed(2)} km²` : "—"} />
            <Stat label="Max Range" value={result.max_range_km != null ? `${Number(result.max_range_km).toFixed(2)} km` : "—"} />
            <Stat label="TX Height" value={`${result.height_ft} ft (${result.key_data?.tx_height_m} m)`} />
            <Stat label="Frequency" value={`${result.key_data?.frequency_mhz} MHz`} />
            <Stat label="Power" value={`${result.key_data?.power_w} W`} />
            <Stat label="Antenna Gain" value={`${result.key_data?.antenna_gain_dbi} dBi`} />
            <Stat label="RX Sensitivity" value={`${result.key_data?.receiver_sensitivity_dbm} dBm`} />
            <Stat label="Radius" value={`${result.radius_mi} mi`} />
          </div>
          {result.kmz_url && (
            <div className="px-4 py-2 border-t border-border bg-card flex items-center justify-end">
              <a
                href={result.kmz_url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-wider text-cyan-700 hover:text-cyan-900"
              >
                <Download className="w-3 h-3" /> DOWNLOAD KMZ
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running CloudRF /area…</span>
          ) : "Click GENERATE HEATMAP to compute Target A coverage."}
        </div>
      )}
    </Section1Shell>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-card px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-mono">{label}</div>
      <div className="text-xs font-mono text-foreground mt-0.5">{value}</div>
    </div>
  );
}