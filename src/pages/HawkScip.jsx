import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ensureScipQcPass } from "@/lib/scipQcGate";
import { Printer, Download, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { HAWK } from "../components/scip/hawkScipBrand";
import HawkScipPrintDoc from "../components/scip/HawkScipPrintDoc";

const PRINT_CSS = `
@page { size: Letter; margin: 0; }
@media print {
  body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body * { visibility: hidden; }
  #hawk-scip-doc, #hawk-scip-doc * { visibility: visible; }
  #hawk-scip-doc { position: absolute; left: 0; top: 0; width: 8.5in; }
  #hawk-scip-doc .page { page-break-after: always; }
  #hawk-scip-doc .page:last-child { page-break-after: auto; }
}`;

export default function HawkScip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const styleRef = useRef(null);

  useEffect(() => {
    base44.entities.ScipRecord.get(id).then(setRecord).catch(() => setRecord(null)).finally(() => setLoading(false));
  }, [id]);

  async function handlePrint() {
    setBusy(true);
    try {
      const qc = await ensureScipQcPass(record, { repairAllowed: true });
      if (qc.record) setRecord(qc.record);
      if (!styleRef.current) {
        const el = document.createElement("style");
        el.innerHTML = PRINT_CSS;
        document.head.appendChild(el);
        styleRef.current = el;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      window.print();
    } catch (error) {
      if (error.qcRecord) setRecord(error.qcRecord);
      toast.error(error.message || "OpenRouter QC blocked printing");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPdf() {
    setBusy(true);
    try {
      const qc = await ensureScipQcPass(record, { repairAllowed: true });
      const approvedRecord = qc.record || record;
      if (qc.record) setRecord(qc.record);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const pages = document.querySelectorAll("#hawk-scip-doc .page");
      const pdf = new jsPDF({ unit: "in", format: "letter" });
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: "#fff" });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 8.5, 11);
      }
      pdf.save(`HawkSCIP_${(approvedRecord.site_name || "site").replace(/\s+/g, "_")}_${approvedRecord.submittal_date}.pdf`);
    } catch (error) {
      if (error.qcRecord) setRecord(error.qcRecord);
      toast.error(error.message || "OpenRouter QC blocked PDF export");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: HAWK.bg }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: HAWK.blue }} /></div>;
  if (!record) return <div className="min-h-screen flex items-center justify-center" style={{ background: HAWK.bg }}><p style={{ color: HAWK.muted }}>SCIP record not found.</p></div>;

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: HAWK.bg, fontFamily: "Inter, Helvetica Neue, Arial, sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5 no-print">
          <button onClick={() => navigate(`/scip/${id}`)} className="inline-flex items-center gap-1.5 text-sm" style={{ color: HAWK.muted }}>
            <ArrowLeft className="w-4 h-4" /> Back to SCIP
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <Btn icon={Printer} label="Print Hawk SCIP" onClick={handlePrint} busy={busy} />
            <Btn icon={Download} label="Download PDF" onClick={handleExportPdf} busy={busy} />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border mx-auto overflow-hidden" style={{ borderColor: HAWK.line, width: "8.5in", maxWidth: "100%" }}>
          <HawkScipPrintDoc record={record} />
        </div>
      </div>
    </div>
  );
}

function Btn({ icon: Icon, label, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white disabled:opacity-50"
      style={{ border: `1.5px solid ${HAWK.blue}`, color: HAWK.blue }}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}