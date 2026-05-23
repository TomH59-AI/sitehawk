/**
 * Hawk Frequency — RF justification page for Target A using CloudRF.
 *
 * Top 3 highest-value outputs (per acquisition-priority ranking):
 *   1. Area Coverage Heatmap     (/area)   — single height, switchable
 *   2. Path Profile P2P          (/path)   — LOS / Fresnel / signal / loss
 *   3. Height Comparison         (/area)   — 80 / 120 / 199 ft side-by-side
 *
 * Each card has its own GENERATE button. Operates on Target A
 * coordinates passed via router state (from Hawk Vision / SCIP).
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Radio } from "lucide-react";
import CoverageHeatmapCard from "../components/hawkfreq/CoverageHeatmapCard";
import PathProfileCard from "../components/hawkfreq/PathProfileCard";
import HeightComparisonCard from "../components/hawkfreq/HeightComparisonCard";

export default function HawkFrequency() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [target, setTarget] = useState({ lat: "", lon: "", name: "" });

  useEffect(() => {
    if (state?.target) {
      setTarget({
        lat: state.target.latitude ?? state.target.lat ?? "",
        lon: state.target.longitude ?? state.target.lon ?? "",
        name: state.target.site_name || state.target.parcel_address || "Target A",
      });
    }
  }, [state]);

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-5">
      <div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-400/15 border border-cyan-400/40 flex items-center justify-center">
            <Radio className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">Hawk Frequency</h1>
            <p className="text-sm text-muted-foreground">
              CloudRF RF justification for Target A — prove the site, the height, and the backhaul.
            </p>
          </div>
        </div>
      </div>

      {/* Target A header */}
      <div className="rounded-xl border border-border bg-card px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Target Name" value={target.name} onChange={(v) => setTarget((t) => ({ ...t, name: v }))} />
        <Field label="Target Latitude" value={target.lat} onChange={(v) => setTarget((t) => ({ ...t, lat: v }))} mono />
        <Field label="Target Longitude" value={target.lon} onChange={(v) => setTarget((t) => ({ ...t, lon: v }))} mono />
      </div>

      <CoverageHeatmapCard targetLat={target.lat} targetLon={target.lon} siteName={target.name} />
      <PathProfileCard    targetLat={target.lat} targetLon={target.lon} siteName={target.name} />
      <HeightComparisonCard targetLat={target.lat} targetLon={target.lon} siteName={target.name} />
    </div>
  );
}

function Field({ label, value, onChange, mono = false }) {
  return (
    <label className="block">
      <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-1">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-2 py-1.5 border border-border rounded bg-card text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}