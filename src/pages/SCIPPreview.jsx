import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft } from "lucide-react";
import ScipPrintSelector from "../components/scip/ScipPrintSelector";
import HawkInstructions from "../components/scip/HawkInstructions";
import SCIPStageProgress from "../components/scip/SCIPStageProgress";
import SARFMap from "../components/scip/SARFMap";
import HawkZoningOverview from "../components/scip/HawkZoningOverview";
import HawkParcelDetails from "../components/scip/HawkParcelDetails";
import HawkElectricServiceMap from "../components/scip/HawkElectricServiceMap";
import HawkSectorCoverage from "../components/scip/HawkSectorCoverage";
import { hubspotSyncDeal } from "@/functions/hubspotSyncDeal";
import { attioSyncDeal } from "@/functions/attioSyncDeal";
import { buildScipData } from "@/lib/scipFields";
import { notionZoningLookup } from "@/functions/notionZoningLookup";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { directionsFromBusiestIntersection } from "@/functions/directionsFromBusiestIntersection";

export default function SCIPPreview() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [scipData, setScipData] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [agent, setAgent] = useState({ name: "", phone: "", email: "" });
  const [targets3, setTargets3] = useState(null);
  // Sequential pipeline stage machine — each stage completes before the next begins.
  // sarf → zoning → targets → done
  const [stage, setStage] = useState("sarf");

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

      // Auto-fire Attio + Apollo lead capture in parallel (independent of HubSpot)
      const attioSyncKey = `scip-attio-synced:${c.id || c.parcel_id}`;
      if (!sessionStorage.getItem(attioSyncKey)) {
        sessionStorage.setItem(attioSyncKey, "1");
        attioSyncDeal({ candidate: c, agent: agentInfo, source: "scip" }).catch((err) => {
          console.warn("Attio auto-sync failed:", err.message);
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
  const radiusMiles = state?.searchParams?.radius_miles ?? 1.0;

  const order = ["sarf", "zoning", "targets", "done"];
  const stageStatus = (key) => {
    const cur = order.indexOf(stage);
    const idx = order.indexOf(key);
    if (idx < cur) return "done";
    if (idx === cur) return "active";
    return "pending";
  };

  const stages = [
    { key: "sarf",    label: "SARF Map",  status: stageStatus("sarf") },
    { key: "zoning",  label: "Zoning",    status: stageStatus("zoning") },
    { key: "targets", label: "Targets A·B·C", status: stage === "done" ? "done" : stageStatus("targets") },
  ];

  // Printable sections — all selected by default, user can deselect before printing.
  const printSections = [
    { id: "sarf", label: "SARF Map" },
    { id: "zoning", label: "Zoning Overview" },
    { id: "targets", label: "Targets A·B·C" },
    { id: "electric", label: "Electric Service" },
    { id: "coverage", label: "RF Coverage" },
  ];

  return (
    <div id="scip-print-root" className="space-y-6 max-w-5xl mx-auto pb-12 relative">
      <HawkInstructions />

      {/* Hawk progress timeline */}
      <SCIPStageProgress stages={stages} />

      {/* Sequential pipeline. No scanning happens here — coordinates arrive from /search.
          SARF map renders first, then Zoning fetches, then Targets fetch, each in order. */}
      {coordsReady && (
        <div className="space-y-2">
          <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent border border-cyan-500/30">
            <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em] mb-0.5">SCIP · SARF</div>
            <div className="font-heading font-bold text-lg text-foreground">
              Site Area of Responsibility — {Number(lat).toFixed(6)}, {Number(lon).toFixed(6)}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {stage === "sarf"
                ? "Generating SARF map — placing waypoint and drawing the search-ring radius…"
                : "SARF map ready · Search center waypoint with 0.50-mile (yellow) and 1.00-mile (red) radius rings."}
            </div>
          </div>
          <div data-scip-section="sarf">
            <SARFMap
              lat={Number(lat)}
              lon={Number(lon)}
              label={candidate?.site_name}
              onReady={() => setStage((s) => (s === "sarf" ? "zoning" : s))}
            />
          </div>

          {/* Stage 2 — Zoning fetch (auto-runs after SARF is ready) */}
          {order.indexOf(stage) >= order.indexOf("zoning") && (
            <div data-scip-section="zoning">
              <HawkZoningOverview
                lat={Number(lat)}
                lon={Number(lon)}
                autoRun
                onComplete={() => setStage((s) => (s === "zoning" ? "targets" : s))}
              />
            </div>
          )}

          {/* Stage 3 — Targets fetch + select A·B·C (auto-runs after Zoning completes) */}
          {order.indexOf(stage) >= order.indexOf("targets") && (
            <div data-scip-section="targets">
              <HawkParcelDetails
                lat={Number(lat)}
                lon={Number(lon)}
                radiusMiles={radiusMiles}
                onTargetsResolved={setTargets3}
                autoRun
                onComplete={() => setStage("done")}
              />
            </div>
          )}

          {/* Power + fiber infrastructure now lives in the gated Section 7 pipeline
              on /search — removed from the SCIP auto-flow. */}

          {/* Electric Service Map — standalone Target A connection point + provider contact card */}
          <div data-scip-section="electric">
            <HawkElectricServiceMap targetA={targets3?.[0] || null} />
          </div>

          {/* Proximity & environment maps (nearest airport, nearest cell tower, ASCE 7-22 wind)
              now live in the gated Section 6 pipeline on /search — removed from the SCIP auto-flow. */}

          {/* Hawk RF Coverage — CloudRF omni /area coverage PNG draped on a Mapbox aerial of Target A + model-inputs exhibit table (print-ready SCIP deliverable) */}
          <div data-scip-section="coverage">
            <HawkSectorCoverage targetA={targets3?.[0] || null} siteName={candidate?.site_name} />
          </div>
        </div>
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
            Review and edit all fields above — then print the dedicated Hawk Aerial Intelligence pages.
          </p>
        </div>
        <div data-coach="scip-print" className="flex gap-2 flex-wrap w-full md:w-auto">
          <ScipPrintSelector sections={printSections} />
        </div>
      </div>

      {/* Bottom export bar */}
      <div className="sticky bottom-4 bg-card border border-border shadow-xl rounded-xl p-4 no-print">
        <ScipPrintSelector sections={printSections} />
      </div>
    </div>
  );
}