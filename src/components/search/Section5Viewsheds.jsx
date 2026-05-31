/**
 * Section5Viewsheds — SiteHawk pipeline step 5 ("HAWK RF VIEWSHED VISION").
 *
 * Four 2D tree-line viewshed maps, generated ONE AT A TIME, each by its own
 * button: N → S → E → W. EVERY map renders for TARGET A ONLY. Strict gating:
 *  - LOCKED until Section 4 (all six maps) is complete AND Target A is resolved.
 *  - pipelineStep enters "viewsheds"; sub-steps fire in sequence, each ONLY on
 *    its own button click. Each sub-step is locked until the prior one completes.
 *  - While in flight: hawk flying-in-place spinner only. No auto-advance.
 *  - Each panel has its own Regenerate button + beam-angle override.
 *
 * Engine: Cesium Ion (primary) with Mapbox terrain fallback (lib/section5Viewsheds).
 * Obstruction stats reuse the existing scipViewshed backend function.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Eye } from "lucide-react";
import { toast } from "sonner";
import ViewshedSubStep from "./section5/ViewshedSubStep";
import { scipViewshed } from "@/functions/scipViewshed";
import { renderViewshed, obstructionStats, DIRECTIONS, BRAND_GREEN } from "@/lib/section5Viewsheds";

const ORDER = ["N", "S", "E", "W"];
const RUN_LABEL = { N: "Run North Viewshed", S: "Run South Viewshed", E: "Run East Viewshed", W: "Run West Viewshed" };

export default function Section5Viewsheds({
  unlocked, active, targetA, radiusMiles = 0.5, towerHeightFt = 199, onRun, onComplete,
}) {
  const [completed, setCompleted] = useState({});
  const [loadingDir, setLoadingDir] = useState(null);
  const [engines, setEngines] = useState({});
  const [beamAngles, setBeamAngles] = useState({ N: 90, S: 90, E: 90, W: 90 });
  const [statsByDir, setStatsByDir] = useState({});

  const refs = { N: useRef(null), S: useRef(null), E: useRef(null), W: useRef(null) };
  const maps = useRef({});
  const profileCache = useRef(null); // scipViewshed response cached after first call

  useEffect(() => {
    return () => {
      Object.values(maps.current).forEach((m) => m?.destroy?.());
      maps.current = {};
    };
  }, []);

  // Fire onComplete once all four directions are done.
  useEffect(() => {
    if (ORDER.every((d) => completed[d])) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const runDir = useCallback(async (dirKey) => {
    if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      return;
    }
    const lat = Number(targetA.latitude);
    const lon = Number(targetA.longitude);
    setLoadingDir(dirKey);
    try {
      // Obstruction profile — fetched once, cached, reused for all four.
      if (!profileCache.current) {
        const res = await scipViewshed({
          lat, lon, ring_miles: radiusMiles, tower_height_ft: towerHeightFt,
        }).catch(() => null);
        profileCache.current = res?.data?.viewshed?.directions || [];
      }
      const profileDir = profileCache.current.find((d) => d.short === dirKey) || null;
      setStatsByDir((prev) => ({ ...prev, [dirKey]: obstructionStats(profileDir) }));

      // Dispose any prior instance for this direction before re-rendering.
      maps.current[dirKey]?.destroy?.();
      maps.current[dirKey] = null;
      await new Promise((r) => requestAnimationFrame(r));

      // Render with the per-direction beam angle (override of default 90°).
      const dirCfg = { ...DIRECTIONS[dirKey], spread: (beamAngles[dirKey] || 90) / 2 };
      const result = await renderViewshed(refs[dirKey].current, lat, lon, dirKey, radiusMiles, dirCfg);
      maps.current[dirKey] = result;
      setEngines((prev) => ({ ...prev, [dirKey]: result.engine }));
      setCompleted((prev) => ({ ...prev, [dirKey]: true }));
      toast.success(`${DIRECTIONS[dirKey].label} generated for Target A.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || `${dirKey} viewshed failed.`);
    } finally {
      setLoadingDir(null);
    }
  }, [targetA, radiusMiles, towerHeightFt, beamAngles, refs]);

  // The North button also arms the section (pipelineStep → "viewsheds").
  const beginAndRun = (dirKey) => {
    if (!active && dirKey === "N") onRun?.();
    runDir(dirKey);
  };

  const isUnlocked = (dirKey) => {
    const i = ORDER.indexOf(dirKey);
    if (i === 0) return true;
    return !!completed[ORDER[i - 1]];
  };

  // ── LOCKED — Section 4 not complete / no Target A ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 5 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk RF Viewshed Vision — Target A</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete all six maps in Section 4 to unlock the Target A tree-line viewshed suite.
        </div>
      </div>
    );
  }

  const ownerLabel = targetA?.owner || targetA?.parcel_address || "";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Section banner */}
      <div className="px-4 py-3 flex items-center gap-2 text-white" style={{ background: BRAND_GREEN }}>
        <Eye className="w-5 h-5" />
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 5 · VIEWSHED VISION</div>
          <h2 className="font-heading font-bold text-lg leading-tight">HAWK RF VIEWSHED VISION — TARGET A</h2>
          <div className="text-[11px] font-mono opacity-90 mt-0.5">
            Tree-line obstruction checks — what the RF frequency sees{ownerLabel ? ` · ${ownerLabel}` : ""}
          </div>
        </div>
      </div>

      {/* Idle — armed, waiting for the first Run click */}
      {!active && (
        <div className="px-4 pt-6 text-sm text-muted-foreground">
          Generate four directional tree-line viewsheds one at a time — North, South, East, West.
          Click <span className="font-semibold text-foreground">Run North Viewshed</span> below to begin.
        </div>
      )}

      <div className="p-4 space-y-4">
        {ORDER.map((dirKey) => (
          <ViewshedSubStep
            key={dirKey}
            dir={DIRECTIONS[dirKey]}
            runLabel={RUN_LABEL[dirKey]}
            unlocked={dirKey === "N" ? isUnlocked("N") : active && isUnlocked(dirKey)}
            loading={loadingDir === dirKey}
            done={!!completed[dirKey]}
            engine={engines[dirKey]}
            stats={statsByDir[dirKey]}
            rangeMiles={radiusMiles}
            towerHeightFt={towerHeightFt}
            beamAngle={beamAngles[dirKey]}
            onBeamAngleChange={(a) => setBeamAngles((prev) => ({ ...prev, [dirKey]: a }))}
            onRun={() => beginAndRun(dirKey)}
            mapRef={refs[dirKey]}
          />
        ))}
      </div>
    </div>
  );
}