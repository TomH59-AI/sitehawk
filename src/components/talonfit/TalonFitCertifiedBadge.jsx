import { useState } from "react";
import { ShieldCheck, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { talonfitReport } from "@/functions/talonfitReport";
import TalonFitTagline from "./TalonFitTagline";

// Shown after a successful (certified) TalonFit run. The compliance report is
// generated exclusively server-side from the audit record.
export default function TalonFitCertifiedBadge({ runId }) {
  const [busy, setBusy] = useState(false);
  if (!runId) return null;

  const download = async () => {
    setBusy(true);
    try {
      const { data } = await talonfitReport({ run_id: runId });
      if (!data?.pdf_base64) throw new Error(data?.error || "Report unavailable");
      const bytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `TalonFit-Compliance-Report-${data.report_id || runId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "Could not generate the compliance report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-heading font-bold text-sm text-cyan-300">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          TalonFit™ Certified
        </div>
        <button
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white text-xs font-bold px-3 py-1.5 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Compliance Report (PDF)
        </button>
      </div>
      <TalonFitTagline />
    </div>
  );
}