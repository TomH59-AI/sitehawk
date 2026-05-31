import { useState, useEffect } from "react";
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
import Section5Viewsheds from "../components/search/Section5Viewsheds";
import Section6Proximity from "../components/search/Section6Proximity";
import Section7Infrastructure from "../components/search/Section7Infrastructure";
import Section8Propagation from "../components/search/Section8Propagation";
import AIChatPanel from "../components/search/AIChatPanel";
import { getEffectiveTier, hasUnlimitedAccess } from "@/lib/testAccess";
import { usePipeline } from "@/lib/PipelineContext";

const TIER_LIMITS = { blind: 0, free: 0, hawk_site: 1, hawkeyes: 5, hawkeye_apex: Infinity };

export default function SiteSearch() {
  const { toast } = useToast();
  const { setActiveStep, setCompletedSteps } = usePipeline();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [scanError, setScanError] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchParams, setSearchParams] = useState({ radius_miles: 0.5, tower_height_ft: 199, agent_name: "", compound_size: "100x100" });
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  // Pipeline state machine. Steps: "sarf" → "zoning" → ... Each downstream
  // section stays locked until the prior one completes AND the user clicks its
  // "Run [Step]" button. No section auto-fetches or auto-advances.
  const [pipelineStep, setPipelineStep] = useState("sarf");
  // True once the Section 1 SARF MapBox render is complete — unlocks Section 2.
  const [sarfReady, setSarfReady] = useState(false);
  // True once the Section 2 Zoning lookup is complete — unlocks Section 3.
  const [zoningReady, setZoningReady] = useState(false);
  // Target A (lead site candidate) emitted by Section 3 — unlocks Section 4.
  const [targetA, setTargetA] = useState(null);
  // True once all six Section 4 maps are complete — unlocks Section 5.
  const [mapsComplete, setMapsComplete] = useState(false);
  // True once all four Section 5 viewsheds are complete — unlocks Section 6.
  const [viewshedsComplete, setViewshedsComplete] = useState(false);
  // True once all three Section 6 proximity maps are complete — unlocks Section 7.
  const [proximityComplete, setProximityComplete] = useState(false);

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
    if (viewshedsComplete) done.push("viewsheds");
    if (proximityComplete) done.push("proximity");
    setCompletedSteps(done);
  }, [sarfReady, zoningReady, targetA, mapsComplete, viewshedsComplete, proximityComplete, setCompletedSteps]);

  // Clear the sidebar pipeline when leaving Site Search.
  useEffect(() => {
    return () => { setActiveStep(null); setCompletedSteps([]); };
  }, [setActiveStep, setCompletedSteps]);

  useEffect(() => {
    async function init() {
      const me = await base44.auth.me();
      setUser(me);

      // Count monthly searches (used only for tier-limit gating, not a scan)
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const allSearches = await base44.entities.SearchHistory.filter({ created_by: me.email }, "-created_date", 100);
      const monthly = allSearches.filter(s => new Date(s.created_date) >= monthStart);
      setSearchesThisMonth(monthly.length);

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

    const tier = getEffectiveTier(user);
    const isAdmin = hasUnlimitedAccess(user);
    const limit = isAdmin ? Infinity : (TIER_LIMITS[tier] ?? 0);
    const isFreeTrialEligible = (tier === "blind" || tier === "free") && !user.free_trial_used;

    if (!isAdmin && (!tier || tier === "blind" || tier === "free") && !isFreeTrialEligible) {
      toast({
        title: "Upgrade required",
        description: "Subscribe to Hawk Site or higher to start scanning.",
        variant: "destructive",
      });
      return;
    }

    if (!isAdmin && !isFreeTrialEligible && limit !== Infinity && searchesThisMonth >= limit) {
      toast({
        title: "Daily search limit reached",
        description: `Your ${tier === "hawk_site" ? "Hawk Site" : "Hawkeyes"} plan allows ${limit} Target Search${limit !== 1 ? "es" : ""}/day. Upgrade to continue.`,
        variant: "destructive",
      });
      return;
    }

    // Brief in-flight state so the hawk spinner shows while MapBox renders.
    // New search → reset the whole pipeline back to Section 1.
    setScanError(null);
    setLoading(true);
    setSarfReady(false);
    setZoningReady(false);
    setTargetA(null);
    setMapsComplete(false);
    setViewshedsComplete(false);
    setProximityComplete(false);
    setSearchCenter({ lat: latitude, lon: longitude });
    setPipelineStep("sarf");
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const tier = getEffectiveTier(user);
  const isAdmin = hasUnlimitedAccess(user);
  const limit = isAdmin ? Infinity : (TIER_LIMITS[tier] ?? 0);
  const isFreeTrialEligible = (tier === "blind" || tier === "free") && !user?.free_trial_used;
  const isBlind = !isAdmin && (!tier || tier === "blind" || tier === "free") && !isFreeTrialEligible;
  const atLimit = !isAdmin && (isBlind || (limit !== Infinity && !isFreeTrialEligible && searchesThisMonth >= limit));

  const coordsReady = searchCenter && Number.isFinite(searchCenter.lat) && Number.isFinite(searchCenter.lon);

  // Stable primitive SARF inputs — the memoized map component only redraws when
  // these actually change, not on unrelated parent re-renders.
  const sarfLat = coordsReady ? Number(searchCenter.lat) : null;
  const sarfLon = coordsReady ? Number(searchCenter.lon) : null;
  const sarfRadius = searchParams.radius_miles;
  const sarfAgent = searchParams.agent_name;

  return (
    <div className="space-y-6">
      {/* SiteHawk Vision chat toggle — paid subscribers only (not a scan) */}
      {!isBlind && (
        <button
          onClick={() => setChatOpen((o) => !o)}
          className="fixed right-6 bottom-8 z-40 w-14 h-14 rounded-full bg-[#0C1B2E] shadow-xl flex items-center justify-center hover:scale-105 transition-transform border border-[#2563A0]"
          title="SiteHawk Vision"
        >
          <HawkIcon size={36} />
        </button>
      )}

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
        {isAdmin && <DemoModeButton />}
      </div>

      {/* Section One intake form */}
      <SearchForm onSearch={handleSearch} isLoading={loading} disabled={atLimit} />

      {scanError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <span className="text-destructive text-sm font-medium">Error: {scanError}</span>
        </div>
      )}

      {atLimit && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-destructive text-sm font-medium">
            {isBlind
              ? "Your free trial scan has been used. Subscribe to Hawk Site or higher to continue scanning."
              : `You've reached your daily limit of ${limit} Target Search${limit !== 1 ? "es" : ""}. Upgrade your plan to continue.`}
          </p>
          <a href="/pricing" className="text-xs text-primary underline mt-1 inline-block">View upgrade options →</a>
        </div>
      )}

      {/* Section One output — the single MapBox SARF render. Nothing else fires. */}
      {coordsReady && pipelineStep === "sarf" && (
        <div className="space-y-2" data-coach="sarf-map">
          <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent border border-cyan-500/30">
            <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em] mb-0.5">IMAGE GENERATED · MAPBOX</div>
            <div className="font-heading font-bold text-foreground">
              SARF Map — {searchParams.agent_name?.trim() || "Search Ring"} · {Number(searchCenter.lat).toFixed(6)}, {Number(searchCenter.lon).toFixed(6)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {searchParams.radius_miles}-mile search ring. Advance to the next pipeline step manually when ready.
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
      {loading && <HawkFlightSpinner label="Generating SARF map…" />}

      {/* SECTION 2 — ZONING. Locked until Section 1 SARF is ready; fires only
          when the user clicks "Run Zoning" (advances pipelineStep → "zoning"). */}
      {coordsReady && sarfReady && (
        <Section2Zoning
          unlocked={sarfReady}
          active={pipelineStep === "zoning"}
          lat={Number(searchCenter.lat)}
          lon={Number(searchCenter.lon)}
          candidate={{ latitude: Number(searchCenter.lat), longitude: Number(searchCenter.lon) }}
          onRun={() => setPipelineStep("zoning")}
          onComplete={() => setZoningReady(true)}
        />
      )}

      {/* SECTION 3 — TARGET PARCELS. Locked until Section 2 zoning is complete;
          fires only when the user clicks "Run Targets" (pipelineStep → "targets"). */}
      {coordsReady && sarfReady && zoningReady && (
        <Section3Targets
          unlocked={zoningReady}
          active={pipelineStep === "targets"}
          lat={Number(searchCenter.lat)}
          lon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          towerHeightFt={searchParams.tower_height_ft || 199}
          compoundSideFt={parseInt(String(searchParams.compound_size || "100x100").split("x")[0], 10) || 100}
          onRun={() => setPipelineStep("targets")}
          onTargetAReady={setTargetA}
        />
      )}

      {/* SECTION 4 — HAWK TARGET A MAP SUITE. Locked until Section 3 completes and
          Target A is resolved. Six maps, each fired one-at-a-time by its own
          button. Maps render for Target A ONLY. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section4MapSuite
          unlocked={!!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          active={pipelineStep === "maps"}
          targetA={targetA}
          srcLat={Number(searchCenter.lat)}
          srcLon={Number(searchCenter.lon)}
          radiusMiles={searchParams.radius_miles}
          onRun={() => setPipelineStep("maps")}
          onComplete={() => setMapsComplete(true)}
        />
      )}

      {/* SECTION 5 — HAWK RF VIEWSHED VISION. Locked until all six Section 4
          maps are complete. Four 2D tree-line viewsheds (N→S→E→W), each fired
          one-at-a-time by its own button. Target A ONLY. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section5Viewsheds
          unlocked={mapsComplete && !!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          active={pipelineStep === "viewsheds"}
          targetA={targetA}
          radiusMiles={searchParams.radius_miles}
          towerHeightFt={searchParams.tower_height_ft || 199}
          onRun={() => setPipelineStep("viewsheds")}
          onComplete={() => setViewshedsComplete(true)}
        />
      )}

      {/* SECTION 6 — HAWK PROXIMITY & ENVIRONMENT VISION. Locked until all four
          Section 5 viewsheds are complete. Three maps (airport → cell tower →
          wind), each fired one-at-a-time by its own button. Target A ONLY. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section6Proximity
          unlocked={viewshedsComplete && !!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          active={pipelineStep === "proximity"}
          targetA={targetA}
          onRun={() => setPipelineStep("proximity")}
          onComplete={() => setProximityComplete(true)}
        />
      )}

      {/* SECTION 7 — HAWK INFRASTRUCTURE VISION. Locked until all three Section 6
          maps are complete. ONE interactive power + fiber map the user drives
          with toggles. Single Run button. Target A ONLY. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section7Infrastructure
          unlocked={proximityComplete && !!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          active={pipelineStep === "infrastructure"}
          targetA={targetA}
          radiusMiles={searchParams.radius_miles}
          onRun={() => setPipelineStep("infrastructure")}
        />
      )}

      {/* SECTION 8 — HAWK RF PROPAGATION VISION. STANDALONE — unlocked as soon as
          Target A exists; does NOT gate or block any other section. One Generate
          button → UnwiredLabs carrier scan + per-carrier CloudRF → map. */}
      {coordsReady && sarfReady && zoningReady && (
        <Section8Propagation
          unlocked={!!(targetA && Number.isFinite(targetA.latitude) && Number.isFinite(targetA.longitude))}
          targetA={targetA}
          towerHeightFt={searchParams.tower_height_ft || 150}
        />
      )}
    </div>
  );
}