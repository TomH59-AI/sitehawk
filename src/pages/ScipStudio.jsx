import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { scipStudioAssemble } from "@/functions/scipStudioAssemble";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw, Sparkles, Printer } from "lucide-react";
import { toast } from "sonner";
import StudioFieldGrid from "@/components/scipstudio/StudioFieldGrid";
import StudioTable from "@/components/scipstudio/StudioTable";
import StudioMapSet from "@/components/scipstudio/StudioMapSet";

const PRINT_STYLE_ID = "scip-studio-print-styles";
function ensurePrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #scip-studio-doc, #scip-studio-doc * { visibility: visible !important; }
      #scip-studio-doc { position: absolute; top: 0; left: 0; width: 100%; }
      .studio-no-print { display: none !important; }
      #scip-studio-doc .studio-sheet { page-break-inside: avoid; break-inside: avoid; box-shadow: none !important; }
      @page { size: 8.5in 11in; margin: 0.5in; }
    }
  `;
  document.head.appendChild(style);
}

const SECTION_LABELS = {
  target_a: "Target A",
  candidate_profile: "Candidate Profile",
  maps_evidence: "Maps & Evidence",
  power_communications: "Power & Communications",
  zoning_constraints: "Zoning & Constraints",
  final_assessment: "Final Assessment",
};

function Sheet({ title, subtitle, children }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-secondary text-secondary-foreground">
        <h3 className="font-heading font-bold text-base leading-tight">{title}</h3>
        {subtitle && <p className="text-[11px] opacity-70">{subtitle}</p>}
      </div>
      <div className="p-4 space-y-5">{children}</div>
    </div>
  );
}

function NarrativeBlock({ title, text, placeholder }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {text
        ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
        : <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg px-3 py-4">{placeholder}</div>}
    </div>
  );
}

export default function ScipStudio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assembling, setAssembling] = useState(false);

  const load = useCallback(async () => {
    const rows = await base44.entities.ScipStudioDoc.filter({ scip_record_id: id });
    setDoc(rows[0] || null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const assemble = async () => {
    setAssembling(true);
    try {
      const res = await scipStudioAssemble({ scip_record_id: id });
      setDoc(res.data.doc);
      toast.success(doc ? "Studio document refreshed — analyst entries preserved" : "Studio document assembled from Target A record");
    } catch {
      toast.error("Assembly failed — try again");
    } finally {
      setAssembling(false);
    }
  };

  if (loading) return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const t = doc?.target_a || {};
  const c = doc?.candidate || {};
  const o = doc?.owner_access || {};
  const ex = doc?.executive || {};
  const p = doc?.infrastructure?.power || {};
  const f = doc?.infrastructure?.fiber || {};
  const zo = doc?.zoning?.overview || {};
  const ze = doc?.zoning?.environmental || {};
  const zm = doc?.zoning?.emergency || {};
  const ir = doc?.issue_record || {};

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => navigate(`/scip/${id}`)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to SCIP
        </button>
        <div className="flex items-center gap-2">
          {doc && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary uppercase">{doc.doc_status}</span>}
          <Button onClick={assemble} disabled={assembling}>
            {assembling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : doc ? <RefreshCw className="w-4 h-4 mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {doc ? "Refresh from SCIP" : "Assemble from SCIP"}
          </Button>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground">SITEHAWK · SCIP DOCUMENT STUDIO</div>
        <h1 className="font-heading font-bold text-2xl">Site Candidate Information Package</h1>
        <p className="text-sm text-muted-foreground">A clean, evidence-linked deliverable assembled from the active search ring.</p>
      </div>

      {!doc && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No studio document yet for this SCIP. Assembly imports the original Target A record (locked), the active candidate, captured maps, zoning, and existing conditions — refreshes never overwrite your entries.</p>
        </div>
      )}

      {doc && (
        <>
          {/* Sheet 1 — Executive Summary */}
          <Sheet title="Executive Summary" subtitle="Project identity, locked source record, and decision snapshot">
            <StudioFieldGrid title="Project Identity" fields={[
              ["SCIP / Project ID", doc.identity?.project_id],
              ["Site / Search Ring Name", doc.identity?.site_name],
              ["Client / Carrier", doc.identity?.client],
              ["Prepared By", doc.identity?.prepared_by],
              ["Issue Date", doc.identity?.issue_date],
              ["Document Status", doc.doc_status],
            ]} />
            <StudioFieldGrid locked title="Original Target A — Locked Source Record" fields={[
              ["Latitude", t.latitude], ["Longitude", t.longitude],
              ["Search Radius", t.search_radius], ["Requested Tower Height", t.requested_height_ft ? `${t.requested_height_ft} ft AGL` : null],
              ["County / State", [t.county, t.state].filter(Boolean).join(", ") || null],
              ["Created", t.created_date ? `${String(t.created_date).slice(0, 10)} · ${t.created_by || ""}` : null],
            ]} />
            <NarrativeBlock title="Original User Instructions" text={t.original_instructions} placeholder="No original instructions recorded on the search ring. This block is preserved verbatim and never rewritten by AI." />
            <StudioFieldGrid title="Decision Snapshot" fields={[
              ["Recommended Candidate", ex.recommended_candidate],
              ["Overall Feasibility", ex.overall_feasibility],
              ["Primary Advantage", ex.primary_advantage],
              ["Primary Constraint", ex.primary_constraint],
              ["Next Action", ex.next_action],
            ]} />
            <NarrativeBlock title="Executive Assessment" text={ex.assessment_text} placeholder="AI-assisted summary (generated only from verified project records) arrives in the next studio phase." />
            <StudioTable title="Completion Controls" columns={[
              { key: "section", label: "Section" }, { key: "status", label: "Status" }, { key: "coverage", label: "Source Coverage" },
            ]} rows={Object.entries(doc.completion || {}).map(([k, v]) => ({
              section: SECTION_LABELS[k] || k, status: v.status, coverage: `${v.source_coverage_pct ?? 0}%`,
            }))} />
          </Sheet>

          {/* Sheet 2 — Target & Candidate */}
          <Sheet title="Target A & Candidate Profile" subtitle="Original target inputs remain locked; candidate facts added as review completes">
            <StudioFieldGrid locked title="Original Target A" fields={[
              ["Target ID", t.target_id], ["Site Name", t.site_name],
              ["Latitude", t.latitude], ["Longitude", t.longitude],
              ["Search Radius", t.search_radius], ["Requested Height", t.requested_height_ft ? `${t.requested_height_ft} ft` : null],
              ["County", t.county], ["State", t.state],
            ]} />
            <StudioFieldGrid title="Selected Candidate" fields={[
              ["Candidate ID", c.candidate_id], ["Candidate Name", c.candidate_name],
              ["Latitude", c.latitude], ["Longitude", c.longitude],
              ["Distance from Target A", c.distance_from_target_a], ["Parcel ID", c.parcel_id],
              ["Site Address", c.site_address], ["Parcel Size", c.parcel_size],
              ["Parcel Dimensions", c.parcel_dimensions], ["Owner of Record", c.owner_of_record],
              ["Current Use", c.current_use], ["Ground Elevation", c.ground_elevation],
              ["Proposed Compound Size", c.proposed_compound_size], ["Available Centerlines", c.available_centerlines],
            ]} />
            <StudioFieldGrid title="Owner and Access" fields={[
              ["Owner / Entity", o.owner_entity], ["Contact Person", o.contact_person],
              ["Mailing Address", o.mailing_address], ["Email", o.email], ["Phone", o.phone],
              ["Access From", o.access_from], ["ROW / Driveway Notes", o.row_driveway_notes],
              ["General Directions", o.general_directions],
            ]} />
            <NarrativeBlock title="Candidate Rationale" text={doc.candidate_rationale} placeholder="Why this parcel was selected — parcel fit, proximity, access, constructability, open acquisition questions." />
          </Sheet>

          {/* Sheet 3 — Maps & Evidence */}
          <Sheet title="Maps, Photos & Source Register" subtitle="The final report includes approved evidence only">
            <StudioMapSet mapSet={doc.map_set || []} />
            <StudioTable title="Photo Evidence" columns={[
              { key: "photo_id", label: "Photo ID" }, { key: "category", label: "Category" },
              { key: "direction_location", label: "Direction / Location" }, { key: "caption", label: "Caption" },
            ]} rows={doc.photos || []} emptyText="No photos entered yet — directional photographs are added only when they contribute evidence." />
          </Sheet>

          {/* Sheet 4 — Infrastructure */}
          <Sheet title="Power & Communications Infrastructure" subtitle="HIFLD selections + field verification">
            <StudioFieldGrid title="Power Service Overview" fields={[
              ["Electric Utility / Owner", p.utility_owner], ["Utility Contact", p.utility_contact],
              ["Nearest Service Point", p.nearest_service_point], ["Nearest Pole / Asset ID", p.nearest_pole_asset_id],
              ["Distance to Candidate", p.distance_to_candidate], ["Service Voltage (if verified)", p.service_voltage],
              ["On-Site Power Observed?", p.on_site_power_observed], ["Field Verification Status", p.field_verification_status],
            ]} />
            <StudioTable title="HIFLD Transmission Lines Selected for SCIP" columns={[
              { key: "segment_id", label: "Segment" }, { key: "owner", label: "Owner" },
              { key: "voltage_kv", label: "Voltage (kV)" }, { key: "subs", label: "SUB_1 → SUB_2" },
              { key: "distance_relation", label: "Distance / Relation" }, { key: "evidence_status", label: "Evidence" },
            ]} rows={doc.infrastructure?.hifld_lines || []} emptyText="No transmission-line segments selected yet — picked from the Power Lines dashboard in a later studio phase." />
            <NarrativeBlock title="AI Infrastructure Assessment" text={doc.infrastructure?.ai_assessment} placeholder="Proximity implications using only selected HIFLD records, saved evidence, and verified field observations. Transmission-line proximity does not by itself confirm usable electrical service." />
            <StudioFieldGrid title="Fiber and Telecommunications" fields={[
              ["Fiber Available?", f.fiber_available], ["Fiber Provider", f.fiber_provider],
              ["Nearest Fiber Route / Handhole", f.nearest_fiber_route], ["Distance to Candidate", f.distance_to_candidate],
              ["Telco Provider", f.telco_provider], ["Nearest Demarc / Pedestal", f.nearest_demarc],
              ["Backhaul Confidence", f.backhaul_confidence], ["Verification Notes", f.verification_notes],
            ]} />
          </Sheet>

          {/* Sheet 5 — Zoning & Constraints */}
          <Sheet title="Zoning, Environment & Public Safety" subtitle="Consolidated requirements, citations, risks, and verification status">
            <StudioFieldGrid title="Zoning Overview" fields={[
              ["Zoning Jurisdiction", zo.jurisdiction], ["Planning / Zoning Contact", zo.planning_contact],
              ["Zoning District", zo.zoning_district], ["Future Land Use", zo.future_land_use],
              ["Current Use", zo.current_use], ["Telecom Code Section", zo.telecom_code_section],
              ["Approval Process", zo.approval_process], ["Application Fees", zo.application_fees],
              ["Estimated Timeframe", zo.estimated_timeframe], ["Minimum Lot Compliance", zo.minimum_lot_compliance],
              ["Maximum Tower Height", zo.maximum_tower_height], ["Stealth Required?", zo.stealth_required],
              ["Required Collocations", zo.required_collocations], ["Residential Separation", zo.residential_separation],
              ["Tower Separation", zo.tower_separation], ["Measurement Method", zo.measurement_method],
              ["Fall Zone Requirement", zo.fall_zone_requirement],
            ]} />
            <StudioFieldGrid title="Environmental and Physical Constraints" fields={[
              ["Flood Zone", ze.flood_zone], ["Wetland Concern", ze.wetland_concern],
              ["Water Management District", ze.water_management_district], ["Hazardous Materials", ze.hazardous_materials],
              ["Topography / Slope", ze.topography_slope], ["Protected Lands / Habitat", ze.protected_lands],
              ["Access Constraint", ze.access_constraint], ["Airport / FAA Concern", ze.airport_faa_concern],
              ["Nearest Airport & Distance", ze.nearest_airport_distance], ["Wind / Design Criteria", ze.wind_design_criteria],
            ]} />
            <StudioFieldGrid title="Emergency Services" fields={[
              ["Police Jurisdiction", zm.police_jurisdiction], ["Police Contact", zm.police_contact],
              ["Fire Jurisdiction", zm.fire_jurisdiction], ["Fire Contact", zm.fire_contact],
              ["Nearest Hospital / EMS", zm.nearest_hospital_ems], ["Emergency Access Notes", zm.emergency_access_notes],
            ]} />
            <StudioTable title="Requirement and Source Register" columns={[
              { key: "topic", label: "Topic" }, { key: "requirement", label: "Requirement / Finding" },
              { key: "code_source", label: "Code / Source" }, { key: "verified_date", label: "Verified" }, { key: "status", label: "Status" },
            ]} rows={doc.zoning?.source_register || []} emptyText="Every report claim gets a sourced register entry before publication." />
          </Sheet>

          {/* Sheet 6 — Final Assessment */}
          <Sheet title="Candidate Decision & Quality Gate" subtitle="Verified findings → concise recommendation → pristine final SCIP">
            <StudioTable title="Candidate Scorecard" columns={[
              { key: "category", label: "Category" }, { key: "weight", label: "Weight" },
              { key: "score", label: "Score (1–5)" }, { key: "weighted_score", label: "Weighted" },
              { key: "key_evidence", label: "Key Evidence" }, { key: "status", label: "Status" },
            ]} rows={doc.scorecard || []} />
            <NarrativeBlock title="Recommendation" text={doc.recommendation} placeholder="Proceed / Proceed with Conditions / Hold / Reject — cite the strongest evidence, material risks, and the next required action." />
            <StudioTable title="Pre-Publication Quality Gate" columns={[
              { key: "check", label: "Quality Check" }, { key: "result", label: "Result" },
              { key: "reviewed_by", label: "Reviewed By" }, { key: "review_date", label: "Date" }, { key: "notes", label: "Notes" },
            ]} rows={doc.quality_gate || []} />
            <StudioFieldGrid title="Issue Record" fields={[
              ["Report Version", ir.report_version], ["Template Version", ir.template_version],
              ["Generated By", ir.generated_by], ["Generated", ir.generated_at ? String(ir.generated_at).slice(0, 16).replace("T", " ") : null],
              ["Approved By", ir.approved_by], ["Approval Date", ir.approval_date],
            ]} />
          </Sheet>
        </>
      )}
    </div>
  );
}