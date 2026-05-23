/**
 * Hawk Vision — feasibility recon page.
 *
 * User enters a SARF center (lat/lon) + tower height, hits one button, and
 * SiteHawk identifies the THREE most feasible parcels to erect a cell tower
 * on within the search ring. Labels them Target One / Target Two / Target Three
 * and displays the full parcel + owner intel block for each.
 *
 * Powered by the existing findBestParcelForTower backend function, which:
 *   1. Pulls allowable zoning districts from the Notion master zoning DB
 *   2. Pulls parcels in the ring via the Realie API
 *   3. Filters out residential + scores by zoning + acreage + proximity
 *   4. Skip-traces the owner of each of the top 3 via Enformion
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  Crosshair,
  Loader2,
  Radar,
  MapPin,
  Target,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { findBestParcelForTower } from "@/functions/findBestParcelForTower";
import HawkVisionTargetCard from "../components/hawkvision/HawkVisionTargetCard";

export default function HawkVision() {
  const navigate = useNavigate();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [radius, setRadius] = useState("1.0");
  const [height, setHeight] = useState("199");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [targets, setTargets] = useState(null);
  const [reasoning, setReasoning] = useState(null);

  async function identifyTargets() {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!isFinite(latNum) || !isFinite(lonNum)) {
      setError("Enter valid latitude and longitude.");
      return;
    }
    setLoading(true);
    setError(null);
    setTargets(null);
    try {
      const res = await findBestParcelForTower({
        lat: latNum,
        lon: lonNum,
        radius_miles: parseFloat(radius) || 1.0,
        tower_height_ft: parseFloat(height) || 199,
      });
      const data = res?.data || res;
      if (data?.error) {
        setError(data.error);
      } else {
        setTargets(data.targets || []);
        setReasoning(data.reasoning || null);
      }
    } catch (e) {
      setError(e.message || "Identification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "radial-gradient(ellipse at top, #0c1b2e 0%, #050a14 60%, #02050b 100%)",
        fontFamily: "'Rajdhani', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        @keyframes hv-scan { 0%,100%{opacity:.35;transform:translateY(0)} 50%{opacity:.8;transform:translateY(-4px)} }
        @keyframes hv-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,212,255,0.4)} 50%{box-shadow:0 0 0 18px rgba(0,212,255,0)} }
        .hv-mono { font-family: 'Space Mono', monospace; }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back link */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-300 mb-6 hv-mono tracking-wider"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> BACK
        </button>

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-[#0c1b2e] via-[#0a1428] to-[#0c1b2e] p-8 mb-8">
          {/* Animated scanline backdrop */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(0,212,255,0.08) 3px, rgba(0,212,255,0.08) 4px)",
              animation: "hv-scan 4s ease-in-out infinite",
            }}
          />
          <div className="relative flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center"
              style={{ animation: "hv-pulse 2.5s ease-in-out infinite" }}
            >
              <Eye className="w-7 h-7 text-cyan-300" />
            </div>
            <div>
              <div className="hv-mono text-[10px] tracking-[0.3em] text-cyan-400 mb-1">
                SITEHAWK · FEASIBILITY RECON
              </div>
              <h1 className="text-4xl font-bold text-white tracking-tight">
                HAWK <span className="text-cyan-300">VISION</span>
              </h1>
              <p className="text-slate-400 mt-2 max-w-2xl">
                Drop a SARF waypoint. We'll fly the ring, filter residential
                noise, score zoning-fit and acreage, and lock onto the{" "}
                <span className="text-cyan-300 font-semibold">
                  three most-feasible cell tower parcels
                </span>{" "}
                — labeled <span className="hv-mono">Target One</span>,{" "}
                <span className="hv-mono">Target Two</span>,{" "}
                <span className="hv-mono">Target Three</span>.
              </p>
            </div>
          </div>
        </div>

        {/* Input panel */}
        <div className="rounded-2xl border border-[#1e293b] bg-[#0a0e17]/80 backdrop-blur p-6 mb-6">
          <div className="hv-mono text-[10px] tracking-[0.25em] text-cyan-400 mb-3 flex items-center gap-2">
            <Radar className="w-3.5 h-3.5" /> WAYPOINT PARAMETERS
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Input label="LATITUDE" value={lat} onChange={setLat} placeholder="27.950600" />
            <Input label="LONGITUDE" value={lon} onChange={setLon} placeholder="-82.457200" />
            <Input label="RADIUS (MI)" value={radius} onChange={setRadius} placeholder="1.0" />
            <Input label="TOWER HEIGHT (FT)" value={height} onChange={setHeight} placeholder="199" />
          </div>

          <button
            onClick={identifyTargets}
            disabled={loading}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-[#0a0e17] font-bold tracking-[0.15em] text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01]"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> SCANNING RING…
              </>
            ) : (
              <>
                <Crosshair className="w-4 h-4" /> IDENTIFY 3 FEASIBLE TARGETS
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Reasoning bar */}
        {reasoning && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 mb-6 text-[11px] text-cyan-200 hv-mono flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-cyan-400 font-bold">{reasoning.jurisdiction || "Jurisdiction"}</span>
            <span>·</span>
            <span>
              Allowable zones:{" "}
              <span className="text-white">{reasoning.allowable_zones?.join(", ") || "—"}</span>
            </span>
            <span>·</span>
            <span>
              {reasoning.non_residential_candidates}/{reasoning.total_parcels_in_ring} non-residential parcels
            </span>
          </div>
        )}

        {/* Targets */}
        {targets && targets.length > 0 && (
          <div className="space-y-4">
            <div className="hv-mono text-[10px] tracking-[0.25em] text-cyan-400 flex items-center gap-2">
              <Target className="w-3.5 h-3.5" /> TARGETS LOCKED · {targets.length} OF 3
            </div>
            {targets.slice(0, 3).map((t, i) => (
              <HawkVisionTargetCard key={t.parcel_id || i} target={t} index={i} />
            ))}
          </div>
        )}

        {targets && targets.length === 0 && (
          <div className="rounded-xl border border-[#1e293b] bg-[#0a0e17] p-8 text-center">
            <MapPin className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <div className="text-slate-300 font-semibold">No feasible targets in this ring.</div>
            <div className="text-slate-500 text-sm mt-1">
              Try a different waypoint or expand the radius.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="hv-mono text-[9px] tracking-[0.2em] text-slate-400 mb-1.5">
        {label}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-[#050a14] border border-[#1e293b] text-cyan-100 text-sm hv-mono focus:outline-none focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30"
      />
    </div>
  );
}