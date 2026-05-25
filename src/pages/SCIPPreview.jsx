import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import SCIPSection from "../components/scip/SCIPSection";
import SCIPCoverPage from "../components/scip/SCIPCoverPage";
import SCIPPage1 from "../components/scip/SCIPPage1";
import Section1 from "../components/scip/section1/Section1";
import Section2 from "../components/scip/section2/Section2";
import Section3 from "../components/scip/section3/Section3";
import SCIPMapsSection from "../components/scip/SCIPMapsSection";
import SCIPBirdsEyeMaps from "../components/scip/SCIPBirdsEyeMaps";
import SCIPSummaryTab from "../components/scip/SCIPSummaryTab";
import SCIPInfrastructureTab from "../components/scip/SCIPInfrastructureTab";
import SCIPPhotographsGrid from "../components/scip/SCIPPhotographsGrid";
import SCIPThematicMaps from "../components/scip/SCIPThematicMaps";
import SCIPViewshedSection from "../components/scip/SCIPViewshedSection";
import SCIPGroundPhotosSection from "../components/scip/SCIPGroundPhotosSection";
import SCIPRFCoverageSection from "../components/scip/SCIPRFCoverageSection";
import SCIPSpectrumSection from "../components/scip/SCIPSpectrumSection";
import SCIPExportButtons from "../components/scip/SCIPExportButtons";
import PrintSCIPButton from "../components/scip/PrintSCIPButton";
import SCIPShareButton from "../components/scip/SCIPShareButton";
import PushToHubSpotButton from "../components/scip/PushToHubSpotButton";
import GeneratePropertyInfoButton from "../components/scip/GeneratePropertyInfoButton";
import PropertyInfoTargetsBlock from "../components/scip/PropertyInfoTargetsBlock";
import TargetComparisonTable from "../components/scip/TargetComparisonTable";
import Instant3DZoningSimulator from "../components/scip/Instant3DZoningSimulator";
import SiteOwnerInfoBlock from "../components/scip/SiteOwnerInfoBlock";
import HawkInstructions from "../components/scip/HawkInstructions";
import SCIPStageProgress from "../components/scip/SCIPStageProgress";
import ZoningPermitReport from "../components/scip/ZoningPermitReport";
import MapGenerationButtons from "../components/scip/MapGenerationButtons";
import { hubspotSyncDeal } from "@/functions/hubspotSyncDeal";
import { buildScipData, SCIP_SECTION_ORDER } from "@/lib/scipFields";
import { notionZoningLookup } from "@/functions/notionZoningLookup";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { directionsFromBusiestIntersection } from "@/functions/directionsFromBusiestIntersection";

export default function SCIPPreview() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [scipData, setScipData] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [agent, setAgent] = useState({ name: "", phone: "", email: "" });
  const [section1State, setSection1State] = useState({ acquisition: {}, targets: [], siteNotes: "" });
  const [zoningReportDone, setZoningReportDone] = useState(false);
  const [generatedMaps, setGeneratedMaps] = useState(new Set());
  const [generatingMap, setGeneratingMap] = useState(null);
  const [propertyInfoData, setPropertyInfoData] = useState(null);

  useEffect(() => {
    async function init() {
      const me = await base44.auth.me().catch(() => null);
      const agentInfo = {
        name: me?.full_name || "",
        phone: me?.phone || "",
        email: me?.email || "",
      };
      setAgent(agentInfo);

      const c = state?.candidate;
      const ord = state?.ordinance;
      const ctr = state?.searchCenter;

      if (!c) {
        navigate("/results");
        return;
      }
      setCandidate(c);

      // Auto-fire HubSpot lead capture once per SCIP load (idempotent — keyed by APN)
      const autoSyncKey = `scip-hs-synced:${c.id || c.parcel_id}`;
      if (!sessionStorage.getItem(autoSyncKey)) {
        sessionStorage.setItem(autoSyncKey, "1");
        hubspotSyncDeal({ candidate: c, agent: agentInfo, source: "scip" }).catch((err) => {
          console.warn("HubSpot auto-sync failed:", err.message);
        });
      }

      // First render with what we already have, then enrich with geocode + zoning + Realie neighbors.
      setScipData(buildScipData(c, ord, ctr, agentInfo, {}));

      const lat = c.latitude ?? ctr?.lat;
      const lon = c.longitude ?? ctr?.lon;
      if (lat != null && lon != null) {
        const [zoningRes, parcelsRes, directionsRes] = await Promise.allSettled([
          notionZoningLookup({ lat, lon }),
          realieParcelsInRing({ lat, lon, radius_miles: 1.0 }),
          directionsFromBusiestIntersection({ lat, lon }),
        ]);
        const geocode = zoningRes.status === "fulfilled" ? (zoningRes.value.data?.geocode || {}) : {};
        const zoning = zoningRes.status === "fulfilled" ? (zoningRes.value.data?.zoning || {}) : {};
        const neighbors = parcelsRes.status === "fulfilled" ? (parcelsRes.value.data?.parcels || []) : [];
        const directions = directionsRes.status === "fulfilled" ? (directionsRes.value.data || {}) : {};
        setScipData(buildScipData(c, ord, ctr, agentInfo, { geocode, zoning, neighbors, directions }));
      }
    }
    init();
  }, [state, navigate]);

  const handleFieldChange = (sectionKey, fieldIdx, newValue) => {
    setScipData((prev) => {
      const next = { ...prev };
      const section = { ...next[sectionKey] };
      section.fields = section.fields.map((f, i) =>
        i === fieldIdx ? [f[0], newValue] : f
      );
      next[sectionKey] = section;
      return next;
    });
  };

  if (!scipData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const lat = candidate?.latitude ?? state?.searchCenter?.lat;
  const lon = candidate?.longitude ?? state?.searchCenter?.lon;
  const coordsReady = lat != null && lon != null;

  const stages = [
    { key: "coords",   label: "Coordinates",     status: coordsReady ? "done" : "active" },
    { key: "zoning",   label: "Zoning Report",   status: zoningReportDone ? "done" : coordsReady ? "active" : "pending" },
    { key: "sarf",     label: "SARF Map",        status: generatedMaps.has("sarf") ? "done" : zoningReportDone ? "active" : "pending" },
    { key: "rf",       label: "RF Coverage",     status: generatedMaps.has("rf_coverage") ? "done" : generatedMaps.has("sarf") ? "active" : "pending" },
    { key: "infra",    label: "Infrastructure",  status: generatedMaps.has("infra") ? "done" : generatedMaps.has("rf_coverage") ? "active" : "pending" },
    { key: "compound", label: "Compound",        status: generatedMaps.has("compound") ? "done" : generatedMaps.has("infra") ? "active" : "pending" },
  ];

  const handleGenerateMap = (key) => {
    setGeneratingMap(key);
    // Each map type triggers a scroll to its existing rendered section.
    const targetMap = {
      sarf: "scip-sarf-section",
      rf_coverage: "scip-rf-section",
      infra: "scip-infra-section",
      compound: "scip-compound-section",
    };
    const id = targetMap[key];
    if (id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setTimeout(() => {
      setGeneratedMaps((prev) => new Set(prev).add(key));
      setGeneratingMap(null);
    }, 800);
  };

  return (
    <div id="scip-print-root" className="space-y-6 max-w-5xl mx-auto pb-12 relative">
      <HawkInstructions />

      {/* Stage 3 — Hawk progress timeline */}
      <SCIPStageProgress stages={stages} />

      {/* Stage 1 — Auto-run zoning + permit report as soon as coordinates arrive */}
      {coordsReady && (
        <ZoningPermitReport
          lat={lat}
          lon={lon}
          candidate={candidate}
          onComplete={() => setZoningReportDone(true)}
        />
      )}

      {/* Stage 2 — Map generation buttons unlock after the zoning report finishes */}
      {zoningReportDone && (
        <MapGenerationButtons
          onGenerate={handleGenerateMap}
          completed={generatedMaps}
          loadingKey={generatingMap}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">
            Site Candidate Information Package
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and edit all fields below — then print, download PDF, or export to Excel.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <GeneratePropertyInfoButton
            lat={lat}
            lon={lon}
            towerHeightFt={state?.searchParams?.tower_height_ft}
            setbackFt={state?.searchParams?.setback_ft}
            searchId={state?.searchId || candidate?.search_id}
            onComplete={setPropertyInfoData}
          />
          <PushToHubSpotButton candidate={candidate} agent={agent} />
          <SCIPShareButton
            candidate={candidate}
            ordinance={state?.ordinance}
            searchCenter={state?.searchCenter}
            agent={agent}
          />
          <PrintSCIPButton />
          <SCIPExportButtons scipData={scipData} candidate={candidate} />
        </div>
      </div>

      {/* Property Info Targets — A / B / C from Realie, filtered + ranked by ordinance */}
      {propertyInfoData && (
        <PropertyInfoTargetsBlock
          data={propertyInfoData}
          towerHeightFt={state?.searchParams?.tower_height_ft}
        />
      )}

      {/* Side-by-side comparison of Targets A / B / C for final selection */}
      {propertyInfoData?.targets?.length > 1 && (
        <TargetComparisonTable
          targets={propertyInfoData.targets}
          towerHeightFt={state?.searchParams?.tower_height_ft}
        />
      )}

      {/* Instant 3D Zoning Simulator — Flux.1 renders for leasing & zoning presentations */}
      <Instant3DZoningSimulator
        defaultTowerHeight={Number(state?.searchParams?.tower_height_ft) || 120}
        defaultDimensions={
          state?.searchParams?.compound_width_ft && state?.searchParams?.compound_depth_ft
            ? `${state.searchParams.compound_width_ft}x${state.searchParams.compound_depth_ft}`
            : "200x200"
        }
        defaultSetbacks={Number(state?.searchParams?.setback_ft) || 50}
        defaultSeparation={200}
      />

      {/* Target A — Site & Owner Information (Realie + USGS + Enformion) */}
      <SiteOwnerInfoBlock
        lat={lat}
        lon={lon}
        targetLat={propertyInfoData?.targets?.[0]?.latitude}
        targetLon={propertyInfoData?.targets?.[0]?.longitude}
        towerHeightFt={state?.searchParams?.tower_height_ft}
      />

      {/* Cinematic recon-style SCIP cover page */}
      <SCIPCoverPage
        candidate={candidate}
        searchCenter={state?.searchCenter}
        agent={agent}
      />

      {/* SECTION 1 — new strict hierarchy: Site Acquisition → SARF → Hawk Vision Targets → Existing Conditions → Site Notes.
          Each section has its own Generate button on the top-right. */}
      <Section1
        initialAcquisition={{
          agent_name: agent.name,
          tower_height_ft: state?.searchParams?.tower_height_ft || (candidate?.tower_height_ft ?? "199"),
          search_radius: state?.searchParams?.radius_miles ? String(state.searchParams.radius_miles) : "1.0",
          compound_dimensions:
            state?.searchParams?.compound_width_ft && state?.searchParams?.compound_depth_ft
              ? `${state.searchParams.compound_width_ft}' x ${state.searchParams.compound_depth_ft}' (${state.searchParams.compound_width_ft * state.searchParams.compound_depth_ft} SF)`
              : "100' x 100' (10,000 SF)",
          latitude: candidate?.latitude ?? state?.searchCenter?.lat ?? "",
          longitude: candidate?.longitude ?? state?.searchCenter?.lon ?? "",
        }}
        onChange={setSection1State}
      />

      {/* SECTION 2 — Zoning Overview + Tower Specifics + Building Permits for Target One.
          Pulls from Notion Master Zoning DB with Oxylabs fallback. */}
      <Section2 targetOne={section1State.targets?.[0]} />

      {/* SECTION 3 — Infrastructure: Mapbox map (power + fiber toggles, zoom, Target A
          tower icon, utility contact sidebar) + N/E/S/W conical viewsheds. */}
      <Section3
        centerLat={section1State.acquisition?.latitude}
        centerLon={section1State.acquisition?.longitude}
        targetOne={section1State.targets?.[0]}
      />

      {/* Sections */}
      <div className="space-y-3">
        {SCIP_SECTION_ORDER.map((key) => (
          <SCIPSection
            key={key}
            sectionKey={key}
            title={scipData[key].title}
            fields={scipData[key].fields}
            onFieldChange={handleFieldChange}
          />
        ))}

        {/* Cell 14 + Cell 57 — Birds-eye SARF overview + Target A placement */}
        <SCIPBirdsEyeMaps candidate={candidate} searchCenter={state?.searchCenter} />

        {/* TAB 2 — Summary: Targets A/B/C with owner contact info from Enformion */}
        <SCIPSummaryTab
          candidate={candidate}
          searchCenter={state?.searchCenter}
          allResults={state?.allResults}
        />

        {/* TAB 3 — Infrastructure: Clean satellite + Electric (APWA red) + Fiber (APWA orange) */}
        <SCIPInfrastructureTab
          candidate={candidate}
          searchCenter={state?.searchCenter}
        />

        {/* SCIP MAPS section — Aerial / Topo / Flood / Zoning / FLU / Wetlands / Parcel / Wind */}
        <SCIPThematicMaps candidate={candidate} searchCenter={state?.searchCenter} />

        {/* Maps section — NWI Wetlands + USGS Contours */}
        <SCIPMapsSection candidate={candidate} />

        {/* PHOTOGRAPHS — 8-row grid mimicking the official SCIP template (Riverlane reference) */}
        <SCIPPhotographsGrid candidate={candidate} />

        {/* PHOTOGRAPHS — N/S/E/W tree-line 2D viewsheds for Target A (saved for later) */}
        <SCIPViewshedSection candidate={candidate} />

        {/* GROUND LEVEL — Mapillary street-level photos of access drive, power, fiber */}
        <SCIPGroundPhotosSection candidate={candidate} />

        {/* RF Coverage — CloudRF propagation simulation */}
        <SCIPRFCoverageSection candidate={candidate} />

        {/* Spectrum survey — CloudRF interference/spectrum endpoint */}
        <SCIPSpectrumSection candidate={candidate} />
      </div>

      {/* Bottom export bar */}
      <div className="sticky bottom-4 bg-card border border-border shadow-xl rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="text-sm text-muted-foreground">
          ✓ All edits are reflected in the exported file.
        </div>
        <div className="flex gap-2 flex-wrap">
          <SCIPShareButton
            candidate={candidate}
            ordinance={state?.ordinance}
            searchCenter={state?.searchCenter}
            agent={agent}
          />
          <PrintSCIPButton />
          <SCIPExportButtons scipData={scipData} candidate={candidate} />
        </div>
      </div>
    </div>
  );
}