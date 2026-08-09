import { useState, useEffect } from "react";
import { RotateCcw, Square, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import SearchForm from "../components/search/SearchForm";
import HawkIcon from "../components/HawkIcon";
import DemoModeButton from "../components/search/DemoModeButton";
import HawkFlightSpinner from "../components/search/HawkFlightSpinner";
import Section1SarfMap from "../components/search/Section1SarfMap";
import Section2Zoning from "../components/search/Section2Zoning";
import Section3Targets from "../components/search/Section3Targets";
import Section4MapSuite from "../components/search/Section4MapSuite";
import Section8Propagation from "../components/search/Section8Propagation";
import Section9Colocation from "../components/search/Section9Colocation";
import HawkFitPipelineSection from "../components/hawkfit/HawkFitPipelineSection";
import TargetLanePipeline from "../components/search/TargetLanePipeline";
import AIChatPanel from "../components/search/AIChatPanel";
import { usePipeline } from "@/lib/PipelineContext";
import { wetlandsLookup } from "@/functions/wetlandsLookup";
import { historicSitesLookup } from "@/functions/historicSitesLookup";
import { usfwsSpeciesLookup } from "@/functions/usfwsSpeciesLookup";
import { epaHazWasteLookup } from "@/functions/epaHazWasteLookup";
import { tribalLandLookup } from "@/functions/tribalLandLookup";
import GenerateScipButton from "../components/search/GenerateScipButton";
import FollowingToolsIndex from "../components/search/FollowingToolsIndex";
import PipelineLiveSketch from "../components/search/PipelineLiveSketch";
import LocalAuthoritiesTable from "../components/scip/LocalAuthoritiesTable";
import ExportSvpButton from "../components/search/ExportSvpButton";
import { round4 } from "@/lib/coords";
import { runQuietLookups } from "@/lib/quietLookup";

export default function SiteSearch() {
  const { toast } = useToast();
  const { setActiveStep, setCompletedSteps } = usePipeline();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [scanError, setScanError] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchParams, setSearchParams] = useState({ radius_miles: 0.5, tower_height_ft: 150, agent_name: "", ring_name: "", compound_size: "100x100" });
  const [chatOpen, setChatOpen] = useState(false);
  // Pipeline state machine. Steps: "sarf" → "zoning" → ... Each downstream
  // section stays locked until the prior one completes AND the user clicks its
  // "Run [Step]" button. No section auto-fetches or auto-advances.
  const [pipelineStep, setPipelineStep] = useState("sarf");
  // True once the Section 1 SARF MapBox render is complete — unlocks Section 2.
  const [sarfReady, setSarfReady] = useState(false);
  // True once the Section 2 Zoning lookup is complete — unlocks Section 3.
  const [zoningReady, setZoningReady] = useState(false);
  // Full Section 2 zoning result — carries CUP / PE-letter / fall-zone / setback
  // relief posture down to Section 3's target selector.
  const [zoningResult, setZoningResult] = useState(null);
  // Target A (lead site candidate) emitted by Section 3 — unlocks Section 4.
  const [targetA, setTargetA] = useState(null);
  // ALL three targets from Section 3 (additive) — feed the isolated B/C lanes.
  const [allTargets, setAllTargets] = useState([null, null, null]);
  // User-picked backup coordinates from HawkPerch at the bottom of the pipeline.
  const [perchTargets, setPerchTargets] = useState([null, null, null]);
  // Which independent target lanes are open. Each lane owns its own state.
  const [lanesOpen, setLanesOpen] = useState({ B: false, C: false });
  // SEQUENTIAL SCIP LADDER — which target labels have a generated SCIP
  // ("Target A"/"Target B"/"Target C"). Persisted per search ring so a refresh
  // never resets the ladder. Locking one target unlocks the next in Section 3.
  const [generatedLabels, setGeneratedLabels] = useState([]);
  // True once all ten Section 4 maps are complete (Wind is now map #10).
  const [mapsComplete, setMapsComplete] = useState(false);
  // TalonFit stays completely unmounted until the Hawk RF propagation map finishes.
  const [propagationComplete, setPropagationComplete] = useState(false);
  // ── PER-SECTION CLEAR / REMOUNT ───────────────────────────────────────────
  // Each pipeline section is remounted (state wiped) by bumping its key here.
  // Clearing a section also rolls back the parent readiness flags for it AND
  // every section downstream, so the pipeline correctly re-locks after it.
  const [clearKeys, setClearKeys] = useState({
    sarf: 0, zoning: 0, targets: 0, maps: 0, propagation: 0,
  });
  const bumpKeys = (steps) =>
    setClearKeys((prev) => {
      const next = { ...prev };
      for (const s of steps) next[s] = (next[s] || 0) + 1;
      return next;
    });

  // ── SHARED TARGET-KEYED DATA BUS ──────────────────────────────────────────
  // Single object every section emits its ALREADY-COMPUTED factor values into
  // (additive onData callbacks, zero business-logic change). The scorecard reads
  // ONLY this object — never re-fetches — so there is no drift. Canonical sources
  // per the 6 conflict-map decisions: parcel=§3 record, tower=§6 ASR+OpenCellID,
  // zoning=Zoneomics(§2), FEMA=§4 centroid, wetlands=quiet wetlandsLookup (same
  // NWI source as §4 map), power=HIFLD electricUtilityLookup (not §7's contact).
  const [sectionData, setSectionData] = useState({});
  const mergeSectionData = (d) => setSectionData((prev) => ({ ...prev, ...d }));

  // ── SCIP LADDER PERSISTENCE ───────────────────────────────────────────────
  // Stable key for the current search ring; the generated-SCIP ladder is stored
  // under it in localStorage so the locked A/B/C state survives a page refresh.
  const LADDER_STORE = "sitehawk:scip-ladder";
  const ringKey = searchCenter
    ? `${searchCenter.lat},${searchCenter.lon},${searchParams.radius_miles},${(searchParams.ring_name || searchParams.agent_name || "").trim()}`
    : null;

  // Load the persisted ladder whenever the ring key changes (incl. on refresh).
  useEffect(() => {
    if (!ringKey) { setGeneratedLabels([]); return; }
    try {
      const all = JSON.parse(localStorage.getItem(LADDER_STORE) || "{}");
      setGeneratedLabels(Array.isArray(all[ringKey]) ? all[ringKey] : []);
    } catch { setGeneratedLabels([]); }
  }, [ringKey]);

  // Mark a target label as having a generated SCIP — locks it & unlocks the next.
  const handleScipGenerated = (label) => {
    if (!label || !ringKey) return;
    setGeneratedLabels((prev) => {
      if (prev.includes(label)) return prev;
      const next = [...prev, label];
      try {
        const all = JSON.parse(localStorage.getItem(LADDER_STORE) || "{}");
        all[ringKey] = next;
        localStorage.setItem(LADDER_STORE, JSON.stringify(all));
      } catch { /* ignore storage errors */ }
      return next;
    });
  };

  // Ordered pipeline steps (sarf is Section 1, always present).
  const PIPELINE_ORDER = ["zoning", "targets", "maps", "propagation"];

  // Clear ONE section and everything downstream of it: remount those sections
  // (wipes their internal state) and roll back the parent readiness flags so the
  // pipeline re-locks correctly. The cleared step becomes the active step again.
  const clearFrom = (step) => {
    const startIdx = PIPELINE_ORDER.indexOf(step);
    if (startIdx === -1) return;
    const affected = PIPELINE_ORDER.slice(startIdx);
    bumpKeys(affected);

    // Roll back readiness flags from the cleared step onward.
    if (affected.includes("zoning")) setZoningReady(false);
    if (affected.includes("targets")) { setTargetA(null); setAllTargets([null, null, null]); setPerchTargets([null, null, null]); setLanesOpen({ B: false, C: false }); }
    if (affected.includes("maps")) setMapsComplete(false);
    if (affected.includes("propagation")) setPropagationComplete(false);

    // Drop bus data emitted by the cleared sections so the scorecard can't read stale values.
    setSectionData({});
    setPipelineStep(step);
  };

  // Clear ALL sections for a total rescan — back to a fresh Section 1 SARF state.
  const clearAll = () => {
    setScanError(null);
    setSarfReady(false);
    setZoningReady(false);
    setTargetA(null);
    setAllTargets([null, null, null]);
    setPerchTargets([null, null, null]);
    setLanesOpen({ B: false, C: false });
    setMapsComplete(false);
    setPropagationComplete(false);
    setSectionData({});
    setSearchCenter(null);
    setGeneratedLabels([]);
    setPipelineStep("sarf");
    bumpKeys(["sarf", "zoning", "targets", "maps", "propagation"]);
  };

  // Mirror the live pipeline into the sidebar progress tracker (flying hawk).
  useEffect(() => {
    setActiveStep(searchCenter ? pipelineStep : null);
  }, [pipelineStep, searchCenter, setActiveStep]);

  useEffect(() => {
    const done = [];
    if (sarfReady) done.push("sarf");
    if (zoningReady) done.push("zoning");
    if (targetA) done.push("targets");
    if (mapsComplete) done.push("maps");
    setCompletedSteps(done);
  }, [sarfReady, zoningReady, targetA, mapsComplete, setCompletedSteps]);

  // Clear the sidebar pipeline when leaving Site Search.
  useEffect(() => {
    return () => { setActiveStep(null); setCompletedSteps([]); };
  }, [setActiveStep, setCompletedSteps]);

  // ── QUIET SCORE/COMPLIANCE LOOKUPS (wetlands, historic, species, hazwaste) ─
  // Fired once when Target A resolves. Previously these four fired in parallel
  // — on top of Section 3's skip-trace burst that tripped the platform rate
  // limit ("Rate limit exceeded"). They now run ONE AT A TIME with a gap
  // between them, and retry with backoff if a rate limit is still hit.
  // Same sources, same bus keys — score/compliance only, silent on failure.
  useEffect(() => {
    const lat = targetA?.latitude, lon = targetA?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const cancel = runQuietLookups(
      [
        ["wetlands", () => wetlandsLookup({ lat, lon })],
        ["historic", () => historicSitesLookup({ lat, lon })],
        ["species", () => usfwsSpeciesLookup({ lat, lon })],
        ["hazwaste", () => epaHazWasteLookup({ lat, lon })],
        ["tribal", () => tribalLandLookup({ lat, lon })],
      ],
      (name, d) => {
        if (name === "wetlands") mergeSectionData({ wetlands: { present: !!d.wetlands_present, type: d.wetland_type || (d.wetland_types?.[0] ?? null) } });
        else if (name === "historic") mergeSectionData({ historic: { present: !!d.historic_present, count: d.historic_count || 0, site_names: d.site_names || [] } });
        else if (name === "species") mergeSectionData({ species: { present: !!d.species_present, count: d.species_count || 0, names: d.species_names || [] } });
        else if (name === "hazwaste") mergeSectionData({ hazwaste: { present: !!d.hazwaste_present, count: d.hazwaste_count || 0, npl_count: d.npl_count || 0, site_names: d.site_names || [] } });
        else if (name === "tribal") mergeSectionData({ tribal: { present: !!d.tribal_present, on_site: !!d.on_site, proximity: d.proximity || null, names: d.names || [] } });
      }
    );
    return cancel;
  }, [targetA?.latitude, targetA?.longitude]);

  useEffect(() => {
    async function init() {
      const me = await base44.auth.me();
      setUser(me);
      setPageLoading(false);
    }
    init();
  }, []);

  // SECTION ONE — does EXACTLY one thing on submit: render the SARF MapBox map
  // (center waypoint + selected radius ring + agent label). No siteSearch, no
  // parallel lookups, no ordinance, no FEMA/NWI/parcel/zoning/utility/3D, no
  // auto-navigation. Those are later pipeline steps and wait for a manual Run.
  const handleSearch = async (latitude, longitude, params = {}) => {
    const merged = { ...searchParams, ...params };
    setSearchParams(merged);

    if (!user) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }

    // Scanning is free and unlimited — only SCIP generation is gated (server-side).
    // Brief in-flight state so the hawk spinner shows while MapBox renders.
    // New search → reset the whole pipeline back to Section 1.
    setScanError(null);
    setLoading(true);
    setSarfReady(false);
    setZoningReady(false);
    setTargetA(null);
    setAllTargets([null, null, null]);
    setPerchTargets([null, null, null]);
    setLanesOpen({ B: false, C: false });
    setMapsComplete(false);
    setPropagationComplete(false);
    setSectionData({});
    // Normalize the SARF center to 4 decimals (~11 m) at the single entry point.
    // Every downstream fetch / cache key / emit reads off this rounded center.
    setSearchCenter({ lat: round4(latitude), lon: round4(longitude) });
    setPipelineStep("sarf");
  };

  // Cancel the in-flight SARF generation and reset Section 1 back to idle.
  const handleStopGenerating = () => {
    setLoading(false);
    setScanError(null);
    setSarfReady(false);
    setSearchCenter(null);
    setPipelineStep("sarf");
  };

  const savePerchTarget = (slot, point) => {
    setPerchTargets((prev) => {
      const next = [...prev];
      next[slot] = point;
      return next;
    });
  };

  const runPerchTarget = (point, label) => {
    setScanError(null);
    setLoading(true);
    setSarfReady(false);
    setZoningReady(false);
    setTargetA(null);
    setAllTargets([null, null, null]);
    setLanesOpen({ B: false, C: false });
    setMapsComplete(false);
    setPropagationComplete(false);
    setSectionData({});
    setSearchParams((prev) => ({ ...prev, ring_name: `${prev.ring_name || "Search Ring"} — ${label}` }));
    setSearchCenter({ lat: round4(point.lat), lon: round4(point.lng) });
    setPipelineStep("sarf");
    bumpKeys(["sarf", "zoning", "targets", "maps", "propagation"]);
    setTimeout(() => document.querySelector('[data-coach="sarf-map"]')?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const isDemo = user?.role === "demo";

  // Block disabled demo accounts
  if (isDemo && user?.demo_disabled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="text-5xl">🔒</div>
        <h2 className="font-heading font-bold text-2xl text-foreground">Demo Access Disabled</h2>
        <p className="text-muted-foreground max-w-md">
          This demo account has been deactivated. Please contact your SiteHawk representative to regain access.
        </p>
      </div>
    );
  }
  const coordsReady = searchCenter && Number.isFinite(searchCenter.lat) && Number.isFinite(searchCenter.lon);

  // Stable primitive SARF inputs — the memoized map component only redraws when
  // these actually change, not on unrelated parent re-renders.
  const sarfLat = coordsReady ? Number(searchCenter.lat) : null;
  const sarfLon = coordsReady ? Number(searchCenter.lon) : null;
  const sarfRadius = searchParams.radius_miles;
  const sarfAgent = searchParams.ring_name?.trim() || searchParams.agent_name;

  return (
    <div className="space-y-6">
      {/* SiteHawk Vision chat toggle (not a scan) */}
      <button
          onClick={() => setChatOpen((o) => !o)}
          className="fixed right-6 bottom-8 z-40 w-14 h-14 rounded-full bg-secondary shadow-xl flex items-center justify-center hover:scale-105 transition-transform border border-primary"
          title="SiteHawk Vision"
        >
          <HawkIcon size={36} />
        </button>

      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        searchId={null}
        candidates={[]}
        ordinance={null}
      />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">Site Search</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Section One — drop your SARF center and generate the search-ring map. Later pipeline steps run manually.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {targetA && propagationComplete && (
            <button
              type="button"
              onClick={() => document.getElementById("talonfit-ai")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/60 bg-gradient-to-r from-cyan-600 to-emerald-600 px-3 py-2 text-sm font-extrabold text-white shadow-lg transition-transform hover:scale-[1.02]"
              title="Jump to SiteSitter™ parcel feasibility"
            >
              <Sparkles className="h-4 w-4" />
              SiteSitter™ · Find 3 More SCIP Sites
            </button>
          )}
          {coordsReady && (
            <ExportSvpButton
              searchCenter={searchCenter}
              searchParams={searchParams}
              targetA={targetA}
              zoningResult={zoningResult}
              sectionData={sectionData}
            />
          )}
          {coordsReady && (
            <button
              onClick={clearAll}
              title="Clear every section and start a brand-new scan"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Clear All · Total Rescan
            </button>
          )}
          {(isAdmin || isDemo) && <DemoModeButton />}
        </div>
      </div>

      {/* Section One intake form */}
      <SearchForm onSearch={handleSearch} isLoading={loading} />

      {scanError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <span className="text-destructive text-sm font-medium">Error: {scanError}</span>
        </div>
      )}

      {/* Section One output — the single MapBox SARF render. Nothing else fires.
          The SARF stays MOUNTED for the rest of the run (sarfReady) — it must not
          vanish from the page when the pipeline advances to Zoning and beyond. */}
      {coordsReady && (pipelineStep === "sarf" || sarfReady) && (
        <div className="space-y-2" data-coach="sarf-map">
          <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-primary/15 via-transparent to-transparent border border-primary/30">
            <div className="text-[10px] font-mono text-primary tracking-[0.3em] mb-0.5">SCIP · SECTION 1 · SARF</div>
            <div className="font-heading font-bold text-foreground">
              SARF Map — {searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"} · {Number(searchCenter.lat).toFixed(6)}, {Number(searchCenter.lon).toFixed(6)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {searchParams.radius_miles}-mile search ring · {String(searchParams.compound_size || "100x100").replace("x", "'×")}' compound · {searchParams.tower_height_ft || 150}' AGL. Advance to the next pipeline step manually when ready.
            </div>
          </div>
          <Section1SarfMap
            lat={sarfLat}
            lon={sarfLon}
            radiusMiles={sarfRadius}
            agentName={sarfAgent}
            onReady={() => { setLoading(false); setSarfReady(true); }}
          />
        </div>
      )}

      {/* Loading — hawk flying in place while the MapBox SARF render is in flight */}
      {loading && (
        <div className="space-y-3">
          <HawkFlightSpinner label="Generating SARF map…" />
          <div className="flex justify-center">
            <button
              onClick={handleStopGenerating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop Generating
            </button>
          </div>
        </div>
      )}

      {/* SECTION 2 — ZONING. Locked until Section 1 SARF is ready; fires only
          when the user clicks "Run Zoning" (advances pipelineStep → "zoning"). */}
      {coordsReady && sarfReady && (
        <div data-tour="zoning">
        <Section2Zoning
          key={`zoning-${clearKeys.zoning}`}
          unlocked={sarfReady}
          active={pipelineStep === "zoning"}
          onClear={() => clearFrom("zoning")}
          lat={Number(searchCenter.lat)}
          lon={Number(searchCenter.lon)}
          candidate={{ latitude: Number(searchCenter.lat), longitude: Number(searchCenter.lon) }}
          onRun={() => setPipelineStep("zoning")}
          onComplete={() => setZoningReady(true)}
          onData={(data) => { mergeSectionData(data); if (data?.zoning) setZoningResult(data); }}
        />
        </div>
      )}

      {/* SECTION 3 — TARGET PARCELS. Locked until Section 2 zoning is complete;
          fires only when the user clicks "Run Targets" (pipelineStep → "targets"). */}
      {coordsReady && sarfReady && zoningReady && (
        <div data-tour="targets">
        <Section3Targets
          key={`targets-${clearKeys.targets}`}
          unlocked={zoningReady}
          active={pipelineStep === "targets"}
          onClear={() => clearFrom("targets")}
          lat={Number(searchCenter.lat)}
          lon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          towerHeightFt={searchParams.tower_height_ft || 150}
          compoundSideFt={parseInt(String(searchParams.compound_size || "100x100").split("x")[0], 10) || 100}
          ringName={searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"}
          zoningResult={zoningResult}
          towerSiting={sectionData.towerSiting}
          generatedLabels={generatedLabels}
          searchRingCenter={[Number(searchCenter.lon), Number(searchCenter.lat)]}
          onRun={() => setPipelineStep("targets")}
          onTargetAReady={(t) => setTargetA(t ? { ...t, latitude: round4(t.latitude), longitude: round4(t.longitude) } : t)}
          onAllTargets={(slots) => setAllTargets(slots.map((t) => (t ? { ...t, latitude: round4(t.latitude), longitude: round4(t.longitude) } : null)))}
          onData={mergeSectionData}
        />
        </div>
      )}

      {/* SECTION 9 — HAWK COLOCATION INTELLIGENCE. Standalone, unlocked as soon as
          SARF center is set. Scans FCC + OpenCellID within a 3-mile ring. */}
      {coordsReady && sarfReady && (
        <Section9Colocation
          key={`colocation-${clearKeys.sarf}`}
          unlocked={coordsReady && sarfReady}
          srcLat={Number(searchCenter.lat)}
          srcLon={Number(searchCenter.lon)}
          onClear={() => { /* standalone — no downstream rollback needed */ }}
        />
      )}

      {/* SECTION 4 — HAWK TARGET A MAP SUITE. Locked until Section 3 completes and
          Target A is resolved. Six maps, each fired one-at-a-time by its own
          button. Maps render for Target A ONLY. */}
      {coordsReady && sarfReady && zoningReady && (
        <div data-section="map-suite">
        <Section4MapSuite
          key={`maps-${clearKeys.maps}-${targetA?.apn || targetA?.label || `${targetA?.latitude},${targetA?.longitude}`}`}
          unlocked={!!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          active={pipelineStep === "maps"}
          onClear={() => clearFrom("maps")}
          targetA={targetA}
          srcLat={Number(searchCenter.lat)}
          srcLon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          ringName={searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"}
          towerHeightFt={searchParams.tower_height_ft || 150}
          sectionData={sectionData}
          onRun={() => setPipelineStep("maps")}
          onComplete={() => setMapsComplete(true)}
          onData={mergeSectionData}
        />
        </div>
      )}

      {/* TARGET A RF PROPAGATION — the existing carrier/CloudRF map remains
          standalone and does not gate SCIP generation or any other section. */}
      {coordsReady && sarfReady && zoningReady && targetA && (
        <Section8Propagation
          key={`propagation-${clearKeys.propagation}-${targetA?.apn || `${targetA?.latitude},${targetA?.longitude}`}`}
          unlocked={true}
          targetA={targetA}
          towerHeightFt={searchParams.tower_height_ft || 150}
          onData={mergeSectionData}
          onComplete={() => setPropagationComplete(true)}
          onClear={() => {
            bumpKeys(["propagation"]);
            setPropagationComplete(false);
            setPipelineStep("propagation");
          }}
        />
      )}

      {/* HAWKFIT MAP — deterministic fit checks AFTER the Tower Siter /
          Preliminary Tower Siting Exhibit. Consumes the SAME active Target A
          (ScipRecord.parcel_targets → SearchResult → TowerSitingRun →
          TowerVisualization → Tower3DRender) and refreshes when it changes. */}
      {coordsReady && sarfReady && zoningReady && propagationComplete && (
        <HawkFitPipelineSection
          unlocked={!!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          targetA={targetA}
          towerHeightFt={searchParams.tower_height_ft || 150}
          zoningResult={zoningResult}
          searchCenter={searchCenter}
          savedTargets={perchTargets}
          onSaveTarget={savePerchTarget}
          onClearTarget={(slot) => setPerchTargets((prev) => prev.map((target, index) => index === slot ? null : target))}
          onRunTarget={runPerchTarget}
        />
      )}

      {/* INDEPENDENT TARGET B / C PIPELINES — additive. Target A above stays the
          default; each lane below is a fully isolated pipeline run (own maps,
          siting, compliance, propagation, exports) for that target only. */}
      {coordsReady && sarfReady && zoningReady && (allTargets[1] || allTargets[2]) && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="font-heading font-bold text-foreground">Independent Target Pipelines</div>
          <p className="text-xs text-muted-foreground">
            Run Target B or Target C through the full pipeline separately — each keeps its own maps, siting, and exports, fully isolated from Target A and from each other.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {allTargets[1] && (
              <button
                onClick={() => setLanesOpen((p) => ({ ...p, B: !p.B }))}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  lanesOpen.B
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/20"
                }`}
              >
                {lanesOpen.B ? "▼ Target B Pipeline (open)" : "Run Target B"}
              </button>
            )}
            {allTargets[2] && (
              <button
                onClick={() => setLanesOpen((p) => ({ ...p, C: !p.C }))}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  lanesOpen.C
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/40 hover:bg-violet-500/20"
                }`}
              >
                {lanesOpen.C ? "▼ Target C Pipeline (open)" : "Run Target C"}
              </button>
            )}
          </div>
        </div>
      )}

      {coordsReady && sarfReady && zoningReady && lanesOpen.B && allTargets[1] && (
        <TargetLanePipeline
          laneLabel="B"
          target={allTargets[1]}
          zoningResult={zoningResult}
          srcLat={Number(searchCenter.lat)}
          srcLon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          ringName={searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"}
          towerHeightFt={searchParams.tower_height_ft || 150}
        />
      )}

      {coordsReady && sarfReady && zoningReady && lanesOpen.C && allTargets[2] && (
        <TargetLanePipeline
          laneLabel="C"
          target={allTargets[2]}
          zoningResult={zoningResult}
          srcLat={Number(searchCenter.lat)}
          srcLon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          ringName={searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"}
          towerHeightFt={searchParams.tower_height_ft || 150}
        />
      )}

      {/* END-OF-PIPELINE — the deliberate finish point for the site package. */}
      {coordsReady && (
        <>
          <section className="rounded-2xl overflow-hidden border border-primary/30 bg-sidebar shadow-xl mt-8">
            <div className="px-5 py-6 md:px-8 md:py-8 text-center border-b border-sidebar-border">
              <p className="text-[10px] font-bold tracking-[0.3em] text-brand-cyan uppercase">Site package complete</p>
              <h2 className="font-heading text-2xl md:text-3xl font-bold text-sidebar-foreground mt-2">Generate SCIP Here</h2>
              <p className="text-sm text-sidebar-foreground/70 mt-2 max-w-2xl mx-auto">Turn the active Target A, maps, zoning, infrastructure, environmental findings, and Hawk Intelligence into the full SiteHawk SCIP.</p>
            </div>
            <div className="p-4 md:p-6 space-y-5">
              {mapsComplete && targetA && (
                <PipelineLiveSketch
                  targetA={targetA}
                  searchCenter={searchCenter}
                  searchParams={searchParams}
                  zoningResult={zoningResult}
                  sectionData={sectionData}
                />
              )}
              <LocalAuthoritiesTable
                lat={Number.isFinite(targetA?.latitude) ? targetA.latitude : Number(searchCenter.lat)}
                lng={Number.isFinite(targetA?.longitude) ? targetA.longitude : Number(searchCenter.lon)}
              />
              <div className="flex justify-center">
                <GenerateScipButton
                  searchCenter={searchCenter}
                  searchParams={searchParams}
                  targetA={targetA}
                  zoningResult={zoningResult}
                  sectionData={sectionData}
                  onGenerated={handleScipGenerated}
                />
              </div>
            </div>
          </section>
          <FollowingToolsIndex />
        </>
      )}

    </div>
  );
}