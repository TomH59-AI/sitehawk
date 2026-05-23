/**
 * HeightComparisonCard — runs CloudRF /area at 80/120/199 ft and shows
 * three side-by-side heatmaps so an RF engineer can justify the tower
 * height that was requested ("Why 199 ft? Because 80 ft does not cover
 * the target polygon.").
 */

import { useState } from "react";
import Section1Shell from "../scip/section1/Section1Shell";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";
import { Layers3, Loader2 } from "lucide-react";

const COMPARE_HEIGHTS = [80, 120, 199];

export default function HeightComparisonCard({ targetLat, targetLon, siteName }) {
  const [tiles, setTiles] = useState([]);
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
      const results = await Promise.all(
        COMPARE_HEIGHTS.map((h) =>
          cloudRFCoverage({
            lat, lon, height_ft: h, radius_mi: 5,
            site_name: `${siteName || "Target A"} @ ${h}ft`,
          }).then((res) => ({ height_ft: h, data: res?.data || res }))
            .catch((e) => ({ height_ft: h, error: e.message }))
        )
      );
      setTiles(results);
    } catch (e) {
      setError(e.message || "Comparison run failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section1Shell
      step={3}
      title="Height Comparison · 80 / 120 / 199 ft"
      subtitle="Justify the requested tower height with side-by-side CloudRF heatmaps"
      icon={Layers3}
      generateLabel={tiles.length ? "RE-RUN COMPARISON" : "GENERATE COMPARISON"}
      onGenerate={handleGenerate}
      loading={loading}
    >
      {error && <div className="px-4 py-2 bg-red-500/10 text-xs text-red-700">{error}</div>}

      {tiles.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
          {tiles.map((t) => (
            <div key={t.height_ft} className="bg-card">
              <div className="px-3 py-1.5 bg-[#0C1B2E] text-cyan-300 text-[10px] font-mono font-bold tracking-[0.2em] flex items-center justify-between">
                <span>{t.height_ft} ft AGL</span>
                {t.data?.area_covered_sq_km != null && (
                  <span className="text-white">{Number(t.data.area_covered_sq_km).toFixed(1)} km²</span>
                )}
              </div>
              <div className="bg-[#0a0e17] aspect-square flex items-center justify-center p-2">
                {t.data?.png_url ? (
                  <img
                    src={t.data.png_url}
                    alt={`Coverage @ ${t.height_ft} ft`}
                    crossOrigin="anonymous"
                    className="max-w-full max-h-full rounded"
                  />
                ) : (
                  <span className="text-[11px] text-red-400">{t.error || "no PNG"}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running three /area simulations in parallel…</span>
          ) : "Click GENERATE COMPARISON to render 80 / 120 / 199 ft side-by-side."}
        </div>
      )}
    </Section1Shell>
  );
}