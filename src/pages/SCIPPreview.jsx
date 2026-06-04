import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import SCIPSection from "../components/scip/SCIPSection";
import SCIPCoverPage from "../components/scip/SCIPCoverPage";
import Section1 from "../components/scip/section1/Section1";
import Section2 from "../components/scip/section2/Section2";
import Section3 from "../components/scip/section3/Section3";
import SCIPExportButtons from "../components/scip/SCIPExportButtons";
import PrintSCIPButton from "../components/scip/PrintSCIPButton";
import SCIPShareButton from "../components/scip/SCIPShareButton";
import PushToHubSpotButton from "../components/scip/PushToHubSpotButton";
import HawkInstructions from "../components/scip/HawkInstructions";
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

      const autoSyncKey = `scip-hs-synced:${c.id || c.parcel_id}`;
      if (!sessionStorage.getItem(autoSyncKey)) {
        sessionStorage.setItem(autoSyncKey, "1");
        hubspotSyncDeal({ candidate: c, agent: agentInfo, source: "scip" }).catch((err) => {
          console.warn("HubSpot auto-sync failed:", err.message);
        });
      }

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
      section.fields = section.fields.map((field, index) =>
        index === fieldIdx ? [field[0], newValue] : field
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

  return (
    <div id="scip-print-root" className="space-y-6 max-w-5xl mx-auto pb-12 relative">
      <HawkInstructions />

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
            Review and edit all fields below, then print, download PDF, or export to Excel.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      <SCIPCoverPage
        candidate={candidate}
        searchCenter={state?.searchCenter}
        agent={agent}
      />

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

      <Section2 targetOne={section1State.targets?.[0]} />

      <Section3
        centerLat={section1State.acquisition?.latitude}
        centerLon={section1State.acquisition?.longitude}
        targetOne={section1State.targets?.[0]}
      />

      <section className="space-y-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="text-[10px] font-mono text-cyan-600 tracking-[0.3em] mb-0.5">
            DOCUMENT INTELLIGENCE
          </div>
          <div className="font-heading font-bold text-lg text-foreground">
            Editable SCIP Document Fields
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Source-backed SCIP fields remain available for review, edits, PDF, and Excel export.
          </p>
        </div>

        {SCIP_SECTION_ORDER.map((key) => (
          <SCIPSection
            key={key}
            sectionKey={key}
            title={scipData[key].title}
            fields={scipData[key].fields}
            onFieldChange={handleFieldChange}
          />
        ))}
      </section>

      <div className="sticky bottom-4 bg-card border border-border shadow-xl rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="text-sm text-muted-foreground">
          All edits are reflected in the exported file.
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
