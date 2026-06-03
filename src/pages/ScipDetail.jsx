import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { generateSarfMap } from "@/functions/generateSarfMap";
import { Printer, Download, RefreshCw, Copy, Pencil, Loader2, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { SKYWAVE } from "@/lib/skywave";
import ScipPrintDoc from "../components/skywave/ScipPrintDoc";
import HawkZoningPermitting from "../components/skywave/HawkZoningPermitting";
import HawkParcelTargets from "../components/skywave/HawkParcelTargets";
import HawkMaps from "../components/skywave/HawkMaps";
import HawkParcelBoundaryMap from "../components/skywave/HawkParcelBoundaryMap";
import HawkPowerAirport from "../components/skywave/HawkPowerAirport";
import HawkRFCoverage from "../components/skywave/HawkRFCoverage";
import HawkExistingConditions from "../components/skywave/HawkExistingConditions";
import HawkViewshed from "../components/skywave/HawkViewshed";
import PostcardMailerSection from "../components/scip/postcard/PostcardMailerSection";
import TargetScorecard from "../components/scip/TargetScorecard";
import NotionSyncToggle from "../components/scip/NotionSyncToggle";
import ScipCrmPanel from "../components/scip/crm/ScipCrmPanel";

const STATUS = {
  draft: { label: "Draft", bg: SKYWAVE.muted },
  map_generated: { label: "Map Generated", bg: SKYWAVE.blue },
  submitted: { label: "Submitted", bg: SKYWAVE.navy },
};

const PRINT_CSS = `
@page { size: Letter; margin: 0; }
@media print {
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { visibility: hidden; }
  #scip-doc, #scip-doc * { visibility: visible; }
  #scip-doc { position: absolute; left: 0; top: 0; width: 8.5in; }
  #scip-doc .page { page-break-after: always; }
  #scip-doc .page:last-child { page-break-after: auto; }
}`;

export default function ScipDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const styleRef = useRef(null);

  useEffect(() => {
    base44.entities.ScipRecord.get(id).then(setRecord).catch(() => setRecord(null)).finally(() => setLoading(false));
  }, [id]);

  function ensurePrintStyles() {
    if (!styleRef.current) {
      const el = document.createElement("style");
      el.innerHTML = PRINT_CSS;
      document.head.appendChild(el);
      styleRef.current = el;
    }
  }

  function handlePrint() {
    ensurePrintStyles();
    window.print();
  }

  async function handleRegenerate() {
    setBusy(true);
    try {
      const res = await generateSarfMap({
        lat: Number(record.latitude), lon: Number(record.longitude),
        search_radius: record.search_radius, site_name: record.site_name,
      });
      const mapUrl = res.data?.map_image_url;
      if (!mapUrl) throw new Error("no url");
      const updated = await base44.entities.ScipRecord.update(record.id, { map_image_url: mapUrl, status: "map_generated" });
      setRecord(updated);
      toast.success("Map regenerated");
    } catch {
      toast.error("Map generation failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const { id: _id, created_date, updated_date, created_by_id, created_by, ...rest } = record;
      const clone = await base44.entities.ScipRecord.create({
        ...rest, site_name: "", latitude: 0, longitude: 0, map_image_url: "", status: "draft",
      });
      toast.success("Duplicated — update site details");
      navigate(`/scip/${clone.id}`);
    } catch (err) {
      toast.error(err.message || "Failed to duplicate");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPdf() {
    setBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"), import("html2canvas"),
      ]);
      const pages = document.querySelectorAll("#scip-doc .page");
      const pdf = new jsPDF({ unit: "in", format: "letter" });
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#fff" });
        const img = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "PNG", 0, 0, 8.5, 11);
      }
      const name = `SCIP_${(record.site_name || "site").replace(/\s+/g, "_")}_${record.submittal_date}.pdf`;
      pdf.save(name);
    } catch (err) {
      toast.error("PDF export failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: SKYWAVE.bg }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: SKYWAVE.blue }} /></div>;
  if (!record) return <div className="min-h-screen flex items-center justify-center" style={{ background: SKYWAVE.bg }}><p style={{ color: SKYWAVE.muted }}>SCIP record not found.</p></div>;

  const st = STATUS[record.status] || STATUS.draft;

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: SKYWAVE.bg, fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5 no-print">
          <button onClick={() => navigate("/scip/new")} className="inline-flex items-center gap-1.5 text-sm" style={{ color: SKYWAVE.muted }}>
            <ArrowLeft className="w-4 h-4" /> New SCIP
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-white text-xs font-semibold" style={{ background: st.bg }}>{st.label}</span>
            <ToolbarBtn icon={RefreshCw} label="Regenerate Map" onClick={handleRegenerate} busy={busy} />
            <ToolbarBtn icon={FileText} label="Hawk SCIP" onClick={() => navigate(`/scip/${record.id}/hawk`)} />
            <ToolbarBtn icon={Printer} label="Print SCIP" onClick={handlePrint} />
            <ToolbarBtn icon={Download} label="Download PDF" onClick={handleExportPdf} busy={busy} />
            <ToolbarBtn icon={Copy} label="Duplicate" onClick={handleDuplicate} busy={busy} />
          </div>
        </div>

        {/* SCIP-centric CRM workspace — landlords, mailers, tasks, next actions (not printed) */}
        <div className="mb-5 no-print">
          <ScipCrmPanel record={record} />
        </div>

        {/* Optional Notion review-mirror toggle for data-source snapshots (not printed) */}
        <div className="mb-5 no-print">
          <NotionSyncToggle record={record} onUpdate={setRecord} />
        </div>

        {/* Section 1 — interactive parcel targeting (Target A/B/C) (not printed) */}
        <div className="mb-5">
          <HawkParcelTargets record={record} onUpdate={setRecord} />
        </div>

        {/* Target Selection Scorecard — display-only "why A/B/C" (not printed; in export) */}
        <div className="mb-5 no-print">
          <TargetScorecard record={record} />
        </div>

        {/* Send Postcard Mailers — paid Lob postcard add-on for SCIP targets (not printed) */}
        <div className="mb-5 no-print">
          <PostcardMailerSection record={record} />
        </div>

        {/* Parcel Boundary Map — interactive Target A boundary + candidate toggles (not printed) */}
        <div className="mb-5 no-print">
          <div className="bg-white rounded-lg border p-5" style={{ borderColor: SKYWAVE.line }}>
            <h3 className="font-bold text-lg mb-1" style={{ color: SKYWAVE.navy }}>Parcel Boundary Map</h3>
            <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
              Shows the active Target A parcel boundary. Toggle on all candidate boundaries (A/B/C) for context. Boundary geometry is fetched and saved to the SCIP record so it can be reused.
            </p>
            <HawkParcelBoundaryMap record={record} onUpdate={setRecord} />
          </div>
        </div>

        {/* Section 2 — HAWK MAPS for Target A (not printed) */}
        <div className="mb-5">
          <HawkMaps record={record} onUpdate={setRecord} />
        </div>

        {/* Section 3 — Viewshed Analysis for Target A (not printed) */}
        <div className="mb-5">
          <HawkViewshed record={record} onUpdate={setRecord} />
        </div>

        {/* Section 4 — RF Proximity (airport + cell tower) & CloudRF coverage for Target A (not printed) */}
        <div className="mb-5">
          <HawkRFCoverage record={record} onUpdate={setRecord} />
        </div>

        {/* Section 5 — Hawk Zoning & Permitting (not printed) */}
        <div className="mb-5">
          <HawkZoningPermitting record={record} onUpdate={setRecord} />
        </div>

        {/* Section 6 — Power & Airport maps for Target A (not printed) */}
        <div className="mb-5">
          <HawkPowerAirport record={record} onUpdate={setRecord} />
        </div>

        {/* Section 7 — Existing Conditions for Target A (not printed) */}
        <div className="mb-5">
          <HawkExistingConditions record={record} onUpdate={setRecord} />
        </div>

        {/* The printable document (also the on-screen preview) */}
        <div className="bg-white rounded-lg shadow-sm border mx-auto" style={{ borderColor: SKYWAVE.line, width: "8.5in", maxWidth: "100%" }}>
          <ScipPrintDoc record={record} />
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white disabled:opacity-50"
      style={{ border: `1.5px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}