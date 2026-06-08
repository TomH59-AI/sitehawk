import { useState, useEffect } from "react";
import { RotateCcw, Square } from "lucide-react";
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
import AIChatPanel from "../components/search/AIChatPanel";
import { usePipeline } from "@/lib/PipelineContext";
import { wetlandsLookup } from "@/functions/wetlandsLookup";
import { historicSitesLookup } from "@/functions/historicSitesLookup";
import { usfwsSpeciesLookup } from "@/functions/usfwsSpeciesLookup";
import { epaHazWasteLookup } from "@/functions/epaHazWasteLookup";
import GenerateScipButton from "../components/search/GenerateScipButton";
import { round4 } from "@/lib/coords";

export default function SiteSearch() {
  const { toast } = useToast();
  const { setActiveStep, setCompletedSteps } = usePipeline();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [scanError, setScanError] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchParams, setSearchParams] = useState({ radius_miles: 0.5, tower_height_ft: 199, agent_name: "", ring_name: "", compound_size: "100x100" });
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
  // True once all ten Section 4 maps are complete (Wind is now map #10) — unlocks Section 7.
  const [mapsComplete, setMapsComplete] = useState(false);
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

  // Ordered pipeline steps (sarf is Section 1, always present). Section 8
  // (propagation) is standalone — it gates nothing, so clearing it only remounts
  // itself and does not roll back any other section.
  const PIPELINE_ORDER = ["zoning", "targets", "maps"];

  // Clear ONE section and everything downstream of it: remount those sections
  // (wipes their internal state) and roll back the parent readiness flags so the
  // pipeline re-locks correctly. The cleared step becomes the active step again.
  const clearFrom = (step) => {
    if (step === "propagation") {
      // Standalone — just remount Section 8, touch nothing else.
      bumpKeys(["propagation"]);
      return;
    }
    const startIdx = PIPELINE_ORDER.indexOf(step);
    if (startIdx === -1) return;
    const affected = PIPELINE_ORDER.slice(startIdx);
    bumpKeys([...affected, "propagation"]); // propagation depends on Target A

    // Roll back readiness flags from the cleared step onward.
    if (affected.includes("zoning")) setZoningReady(false);
    if (affected.includes("targets")) setTargetA(null);
    if (affected.includes("maps")) setMapsComplete(false);

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
    setMapsComplete(false);
    setSectionData({});
    setSearchCenter(null);
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

  // ── #5 WETLANDS (score-only) ──────────────────────────────────────────────
  // Quiet wetlandsLookup fired once when Target A resolves. Emits a present/type
  // value into the bus for the scorecard's Environmental factor ONLY. Draws from
  // the SAME USFWS NWI MapServer the §4 wetlands map renders, so map and score
  // cannot contradict each other. Does NOT touch the §4 map render path.
  useEffect(() => {
    const lat = targetA?.latitude, lon = targetA?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let cancelled = false;
    wetlandsLookup({ lat, lon })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        mergeSectionData({ wetlands: { present: !!d.wetlands_present, type: d.wetland_type || (d.wetland_types?.[0] ?? null) } });
      })
      .catch(() => {}); // score-only; silent failure → scorecard shows "no data"
    return () => { cancelled = true; };
  }, [targetA?.latitude, targetA?.longitude]);

  // ── HISTORIC SITES (compliance) ───────────────────────────────────────────
  // Quiet NPS National Register lookup fired once when Target A resolves. Emits a
  // historic-sites-within-0.5-mi count into the bus so the Section 4 compliance
  // pre-screen can auto-flag the Section 106 historic trigger. Score/compliance
  // only — silent failure → trigger stays manual.
  useEffect(() => {
    const lat = targetA?.latitude, lon = targetA?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let cancelled = false;
    historicSitesLookup({ lat, lon })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        mergeSectionData({ historic: { present: !!d.historic_present, count: d.historic_count || 0, site_names: d.site_names || [] } });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [targetA?.latitude, targetA?.longitude]);

  // ── LISTED SPECIES HABITAT (compliance) ──────────────────────────────────
  // Quiet USFWS critical-habitat lookup fired once when Target A resolves. Emits
  // a present/count value into the bus so the compliance pre-screen can auto-flag
  // the 47 CFR 1.1307 listed-species trigger. Score/compliance only.
  useEffect(() => {
    const lat = targetA?.latitude, lon = targetA?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let cancelled = false;
    usfwsSpeciesLookup({ lat, lon })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        mergeSectionData({ species: { present: !!d.species_present, count: d.species_count || 0, names: d.species_names || [] } });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [targetA?.latitude, targetA?.longitude]);

  // ── HAZARDOUS WASTE / SUPERFUND (compliance) ─────────────────────────────
  // Quiet EPA "Cleanups in my Community" lookup fired once when Target A resolves.
  // Emits a present/count value into the bus so the compliance pre-screen can
  // auto-flag the 47 CFR 1.1307 hazardous-waste trigger. Score/compliance only.
  useEffect(() => {
    const lat = targetA?.latitude, lon = targetA?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let cancelled = false;
    epaHazWasteLookup({ lat, lon })
      .then((res) => {
        if (cancelled) return;
        const d = res?.data || {};
        mergeSectionData({ hazwaste: { present: !!d.hazwaste_present, count: d.hazwaste_count || 0, npl_count: d.npl_count || 0, site_names: d.site_names || [] } });
      })
      .catch(() => {});
    return () => { cancelled = true; };
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
    setMapsComplete(false);
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

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
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
          className="fixed right-6 bottom-8 z-40 w-14 h-14 rounded-full bg-[#0C1B2E] shadow-xl flex items-center justify-center hover:scale-105 transition-transform border border-[#2563A0]"
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
          {coordsReady && (
            <GenerateScipButton
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
          {isAdmin && <DemoModeButton />}
        </div>
      </div>

      {/* Section One intake form */}
      <SearchForm onSearch={handleSearch} isLoading={loading} />

      {scanError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <span className="text-destructive text-sm font-medium">Error: {scanError}</span>
        </div>
      )}

      {/* Section One output — the single MapBox SARF render. Nothing else fires. */}
      {coordsReady && pipelineStep === "sarf" && (
        <div className="space-y-2" data-coach="sarf-map">
          <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent border border-cyan-500/30">
            <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em] mb-0.5">IMAGE GENERATED · MAPBOX</div>
            <div className="font-heading font-bold text-foreground">
              SARF Map — {searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"} · {Number(searchCenter.lat).toFixed(6)}, {Number(searchCenter.lon).toFixed(6)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {searchParams.radius_miles}-mile search ring · {String(searchParams.compound_size || "100x100").replace("x", "'×")}' compound · {searchParams.tower_height_ft || 199}' AGL. Advance to the next pipeline step manually when ready.
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
      )}

      {/* SECTION 3 — TARGET PARCELS. Locked until Section 2 zoning is complete;
          fires only when the user clicks "Run Targets" (pipelineStep → "targets"). */}
      {coordsReady && sarfReady && zoningReady && (
        <Section3Targets
          key={`targets-${clearKeys.targets}`}
          unlocked={zoningReady}
          active={pipelineStep === "targets"}
          onClear={() => clearFrom("targets")}
          lat={Number(searchCenter.lat)}
          lon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          towerHeightFt={searchParams.tower_height_ft || 199}
          compoundSideFt={parseInt(String(searchParams.compound_size || "100x100").split("x")[0], 10) || 100}
          ringName={searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"}
          zoningResult={zoningResult}
          onRun={() => setPipelineStep("targets")}
          onTargetAReady={(t) => setTargetA(t ? { ...t, latitude: round4(t.latitude), longitude: round4(t.longitude) } : t)}
          onData={mergeSectionData}
        />
      )}

      {/* SECTION 4 — HAWK TARGET A MAP SUITE. Locked until Section 3 completes and
          Target A is resolved. Six maps, each fired one-at-a-time by its own
          button. Maps render for Target A ONLY. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section4MapSuite
          key={`maps-${clearKeys.maps}`}
          unlocked={!!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          active={pipelineStep === "maps"}
          onClear={() => clearFrom("maps")}
          targetA={targetA}
          srcLat={Number(searchCenter.lat)}
          srcLon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          ringName={searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring"}
          towerHeightFt={searchParams.tower_height_ft || 199}
          sectionData={sectionData}
          onRun={() => setPipelineStep("maps")}
          onComplete={() => setMapsComplete(true)}
          onData={mergeSectionData}
        />
      )}

      {/* SECTION 8 — HAWK RF PROPAGATION VISION. STANDALONE — unlocked as soon as
          Target A exists; does NOT gate or block any other section. One Generate
          button → UnwiredLabs carrier scan + per-carrier CloudRF → map. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section8Propagation
          key={`propagation-${clearKeys.propagation}`}
          unlocked={!!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          onClear={() => clearFrom("propagation")}
          targetA={targetA}
          towerHeightFt={searchParams.tower_height_ft || 150}
          onData={mergeSectionData}
        />
      )}

      {/* END-OF-PIPELINE — Generate SCIP. Same button as the header, placed after
          Section 8 so users who finish at the propagation map can print the full
          SCIP (and pick pages from their printer) without scrolling back up. */}
      {coordsReady && (
        <div className="flex flex-col items-center gap-2 pt-2 pb-6 border-t border-border">
          <p className="text-sm text-muted-foreground text-center">
            Finished the pipeline? Generate the full SiteHawk SCIP — then Print / Save PDF and choose which pages to print.
          </p>
          <GenerateScipButton
            searchCenter={searchCenter}
            searchParams={searchParams}
            targetA={targetA}
            zoningResult={zoningResult}
            sectionData={sectionData}
          />
        </div>
      )}

    </div>
  );
}