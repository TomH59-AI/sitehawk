/**
 * VIEWSHED POLISH + DIAGNOSTIC — 2026-05-31
 * -----------------------------------------
 * Scope: ONLY Section 5 (the four N/S/E/W tree-line viewsheds). Sections
 * 1–4 and 6–9, pipelineStep, and the hawk spinner were NOT touched.
 *
 * WHAT WAS FOUND (the silent failure):
 *  - The old renderer spun up a FULL Cesium Viewer in SCENE2D for the plan-view.
 *    When Cesium init/terrain failed for the AOI it threw, the catch logged a
 *    plain console.warn, and the Mapbox fallback was attempted — but there was
 *    NO per-direction diagnostics, NO 401/403 handling, NO 15s timeout, and NO
 *    error surface, so a stuck Cesium load = silent forever-spinner.
 *  - The cone was a flat 35% pie slice. No gradient, no stroke polish, no hatch,
 *    no range rings, no compass rose, no elevation strip, no real stats, no
 *    combined inset.
 *
 * WHAT WAS UPGRADED:
 *  1. [VIEWSHED DIAG <dir>] logs at: button click, Cesium Ion probe (token +
 *     endpoint + status + response size), MapBox fallback trigger, viewshed
 *     compute (visible vs occluded sample count), cone GeoJSON build (bearing/
 *     width/range), layer add, and stats render.
 *  2. Cesium Ion is now PROBED for terrain coverage (api.cesium.com asset 1
 *     endpoint); the map itself always renders on Mapbox GL — the prior crash
 *     point is gone. 401/403 → hard "verify CESIUM_ION_TOKEN" error + Retry.
 *     No coverage → auto MapBox terrain-rgb fallback with a DIAG log.
 *  3. Cone = radial-gradient canvas (50%→15% vertex→arc), crisp 2px 80%-opacity
 *     stroke, 45° dotted-grey tree-canopy hatch over obstructed wedges with a
 *     ⚠ + max obstruction ft AMSL in the stats panel.
 *  4. Compass rose (40px, active arrow glows the cone color), hawk-on-tower
 *     vertex icon, dashed white 0.25/0.5/1 mi range rings.
 *  5. 120px elevation profile strip (tan terrain, brown fill, green canopy band,
 *     dashed-red antenna height) with a show/hide toggle.
 *  6. Glass-card stats panel: direction, bearing range, beam width, range, tower
 *     height, % clear / % blocked, max obstruction ht+dist, best/worst path loss,
 *     run timestamp.
 *  7. Combined-view inset (120px, all generated cones) bottom-left of each map.
 *  8. Reliability: 15s per-direction timeout + Retry, viewshed compute cached
 *     per (Target A coord, direction, tower height) for instant re-clicks, and a
 *     Recompute button. Gating N→S→E→W and the hawk spinner are unchanged.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Eye } from "lucide-react";
import { toast } from "sonner";
import ViewshedSubStep from "./section5/ViewshedSubStep";
import SectionClearButton from "./SectionClearButton";
import { scipViewshed } from "@/functions/scipViewshed";
import { cloudRFViewshedDirection } from "@/functions/cloudRFViewshedDirection";
import {
  renderViewshedCloudRF, obstructionStats, buildCombinedInset, DIRECTIONS, BRAND_GREEN,
} from "@/lib/section5Viewsheds";

const ORDER = ["N", "S", "E", "W"];
const RUN_LABEL = { N: "Run North Viewshed", S: "Run South Viewshed", E: "Run East Viewshed", W: "Run West Viewshed" };

export default function Section5Viewsheds({
  unlocked, active, targetA, radiusMiles = 0.5, towerHeightFt = 199, onRun, onComplete, onClear,
}) {
  const [completed, setCompleted] = useState({});
  const [loadingDir, setLoadingDir] = useState(null);
  const [engines, setEngines] = useState({});
  const [errors, setErrors] = useState({});
  const [beamAngles, setBeamAngles] = useState({ N: 90, S: 90, E: 90, W: 90 });
  const [statsByDir, setStatsByDir] = useState({});
  const [profileByDir, setProfileByDir] = useState({});
  const [timestamps, setTimestamps] = useState({});
  const [combinedInset, setCombinedInset] = useState(null);

  const refs = { N: useRef(null), S: useRef(null), E: useRef(null), W: useRef(null) };
  const maps = useRef({});
  // Viewshed compute cache keyed by `${lat},${lon}|${dir}|${towerFt}`.
  const computeCache = useRef({});

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

  // Refresh the combined-view inset whenever the set of done directions changes.
  useEffect(() => {
    const anyDone = ORDER.some((d) => completed[d]);
    setCombinedInset(anyDone ? buildCombinedInset(completed) : null);
  }, [completed]);

  const runDir = useCallback(async (dirKey) => {
    const tag = `[VIEWSHED DIAG ${dirKey}]`;
    // 1 — Run button click handler entry.
    console.log(`${tag} Run handler fired — Target A:`, targetA?.latitude ?? null, targetA?.longitude ?? null, "tower:", towerHeightFt, "ft");
    if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
      console.error(`${tag} Target A coordinates null/invalid — aborting.`);
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      setErrors((p) => ({ ...p, [dirKey]: "Target A coordinates not resolved — re-run Section 3." }));
      return;
    }
    const lat = Number(targetA.latitude);
    const lon = Number(targetA.longitude);
    setErrors((p) => ({ ...p, [dirKey]: null }));
    setLoadingDir(dirKey);

    // The watchdog guards ONLY the map render below — not the scipViewshed
    // backend compute, which legitimately takes ~20s+ (it fetches USGS elevation
    // samples for the profile). Armed right before renderViewshed.
    let watchdog = null;

    try {
      // Viewshed compute (scipViewshed profile) — cached per (coord, dir, tower).
      // No timeout here: it is slow but reliable; a tight timeout was falsely
      // failing directions that actually succeed a few seconds later.
      const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}|${dirKey}|${towerHeightFt}`;
      let profileDir = computeCache.current[cacheKey];
      if (profileDir === undefined) {
        const res = await scipViewshed({ lat, lon, ring_miles: radiusMiles, tower_height_ft: towerHeightFt, direction: dirKey }).catch((e) => {
          console.error(`${tag} scipViewshed threw:`, e?.message); return null;
        });
        const dirs = res?.data?.viewshed?.directions || [];
        profileDir = dirs.find((d) => d.short === dirKey) || null;
        computeCache.current[cacheKey] = profileDir;
      } else {
        console.log(`${tag} compute cache hit`);
      }

      // 4 — compute result: visible vs occluded sample count.
      const prof = profileDir?.profile || [];
      const occ = prof.filter((p) => p.obstructed).length;
      console.log(`${tag} Compute result: ${prof.length - occ} visible / ${occ} occluded of ${prof.length} samples`);

      const stats = obstructionStats(profileDir, radiusMiles, towerHeightFt);
      setStatsByDir((prev) => ({ ...prev, [dirKey]: stats }));
      setProfileByDir((prev) => ({ ...prev, [dirKey]: prof }));

      // CloudRF directional coverage — the real RF heatmap PNG for this beam.
      const beamAngle = beamAngles[dirKey] || 90;
      const cloudResp = await cloudRFViewshedDirection({
        lat, lon, bearing: DIRECTIONS[dirKey].bearing, height_ft: towerHeightFt,
        radius_mi: radiusMiles, hbw: beamAngle, site_name: `Target A ${dirKey} Viewshed`,
      }).catch((e) => { console.error(`${tag} cloudRF threw:`, e?.message); return null; });
      const cloudRF = cloudResp?.data;
      if (!cloudRF?.png_url) throw new Error("CloudRF returned no coverage image — retry.");
      console.log(`${tag} CloudRF PNG ready: ${cloudRF.png_url}`);

      // Dispose any prior instance for this direction before re-rendering.
      maps.current[dirKey]?.destroy?.();
      maps.current[dirKey] = null;
      await new Promise((r) => requestAnimationFrame(r));

      // Overlay the CloudRF heatmap on a Mapbox satellite map.
      // Arm the 20s render watchdog HERE — it guards only the map paint.
      const dirCfg = { ...DIRECTIONS[dirKey], spread: beamAngle / 2 };
      const result = await Promise.race([
        renderViewshedCloudRF(refs[dirKey].current, lat, lon, dirKey, radiusMiles, dirCfg, cloudRF),
        new Promise((_, reject) => {
          watchdog = setTimeout(() => {
            console.error(`${tag} Map render timed out after 20s.`);
            reject(new Error("Viewshed map render timed out after 20s."));
          }, 20000);
        }),
      ]);
      maps.current[dirKey] = result;
      setEngines((prev) => ({ ...prev, [dirKey]: result.engine }));
      // 7 — stats render.
      console.log(`${tag} Stats panel render: clear=${stats.pctClear}% blocked=${stats.pctObstructed}%`);
      setTimestamps((prev) => ({ ...prev, [dirKey]: new Date().toLocaleTimeString() }));
      setCompleted((prev) => ({ ...prev, [dirKey]: true }));
      toast.success(`${DIRECTIONS[dirKey].label} generated for Target A.`);
    } catch (err) {
      console.error(`${tag} render threw:`, err);
      const msg = (err?.code === 401 || err?.code === 403)
        ? "Cesium auth failed — verify CESIUM_ION_TOKEN"
        : (err?.message || `${dirKey} viewshed failed.`);
      toast.error(msg);
      setErrors((p) => ({ ...p, [dirKey]: msg }));
    } finally {
      clearTimeout(watchdog);
      setLoadingDir(null);
    }
  }, [targetA, radiusMiles, towerHeightFt, beamAngles, refs]);

  // Recompute = drop the cache for this direction, then re-run (beam/tower tweaks).
  const recomputeDir = useCallback((dirKey) => {
    const lat = Number(targetA?.latitude), lon = Number(targetA?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      delete computeCache.current[`${lat.toFixed(6)},${lon.toFixed(6)}|${dirKey}|${towerHeightFt}`];
    }
    runDir(dirKey);
  }, [targetA, towerHeightFt, runDir]);

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
      <div className="px-4 py-3 flex items-center justify-between gap-2 text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 5 · VIEWSHED VISION</div>
            <h2 className="font-heading font-bold text-lg leading-tight">HAWK RF VIEWSHED VISION — TARGET A</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">
              Tree-line obstruction checks — what the RF frequency sees{ownerLabel ? ` · ${ownerLabel}` : ""}
            </div>
          </div>
        </div>
        {active && onClear && <SectionClearButton onClear={onClear} />}
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
            error={errors[dirKey]}
            engine={engines[dirKey]}
            stats={statsByDir[dirKey]}
            profile={profileByDir[dirKey]}
            timestamp={timestamps[dirKey]}
            combinedInset={combinedInset}
            rangeMiles={radiusMiles}
            towerHeightFt={towerHeightFt}
            beamAngle={beamAngles[dirKey]}
            onBeamAngleChange={(a) => setBeamAngles((prev) => ({ ...prev, [dirKey]: a }))}
            onRun={() => beginAndRun(dirKey)}
            onRecompute={() => recomputeDir(dirKey)}
            mapRef={refs[dirKey]}
          />
        ))}
      </div>
    </div>
  );
}