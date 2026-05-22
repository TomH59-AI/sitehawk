import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import SCIPSection from "../components/scip/SCIPSection";
import SCIPCoverPage from "../components/scip/SCIPCoverPage";
import SCIPMapsSection from "../components/scip/SCIPMapsSection";
import SCIPBirdsEyeMaps from "../components/scip/SCIPBirdsEyeMaps";
import SCIPSummaryTab from "../components/scip/SCIPSummaryTab";
import SCIPInfrastructureTab from "../components/scip/SCIPInfrastructureTab";
import SCIPThematicMaps from "../components/scip/SCIPThematicMaps";
import SCIPViewshedSection from "../components/scip/SCIPViewshedSection";
import SCIPGroundPhotosSection from "../components/scip/SCIPGroundPhotosSection";
import SCIPRFCoverageSection from "../components/scip/SCIPRFCoverageSection";
import SCIPSpectrumSection from "../components/scip/SCIPSpectrumSection";
import SCIPExportButtons from "../components/scip/SCIPExportButtons";
import PrintSCIPButton from "../components/scip/PrintSCIPButton";
import { buildScipData, SCIP_SECTION_ORDER } from "@/lib/scipFields";
import { notionZoningLookup } from "@/functions/notionZoningLookup";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";

export default function SCIPPreview() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [scipData, setScipData] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [agent, setAgent] = useState({ name: "", phone: "", email: "" });

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

      // First render with what we already have, then enrich with geocode + zoning + Realie neighbors.
      setScipData(buildScipData(c, ord, ctr, agentInfo, {}));

      const lat = c.latitude ?? ctr?.lat;
      const lon = c.longitude ?? ctr?.lon;
      if (lat != null && lon != null) {
        const [zoningRes, parcelsRes] = await Promise.allSettled([
          notionZoningLookup({ lat, lon }),
          realieParcelsInRing({ lat, lon, radius_miles: 1.0 }),
        ]);
        const geocode = zoningRes.status === "fulfilled" ? (zoningRes.value.data?.geocode || {}) : {};
        const zoning = zoningRes.status === "fulfilled" ? (zoningRes.value.data?.zoning || {}) : {};
        const neighbors = parcelsRes.status === "fulfilled" ? (parcelsRes.value.data?.parcels || []) : [];
        setScipData(buildScipData(c, ord, ctr, agentInfo, { geocode, zoning, neighbors }));
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

  return (
    <div id="scip-print-root" className="space-y-6 max-w-5xl mx-auto pb-12">
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
          <PrintSCIPButton />
          <SCIPExportButtons scipData={scipData} candidate={candidate} />
        </div>
      </div>

      {/* Cinematic recon-style SCIP cover page */}
      <SCIPCoverPage
        candidate={candidate}
        searchCenter={state?.searchCenter}
        agent={agent}
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
          <PrintSCIPButton />
          <SCIPExportButtons scipData={scipData} candidate={candidate} />
        </div>
      </div>
    </div>
  );
}