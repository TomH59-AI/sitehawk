import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";
import { Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import ScipZoningPage from "./ScipZoningPage";

// Step 2 — Hawk Zoning & Permitting (Zoneomics-primary). Runs right after the
// SARF, before the 3-target parcel pick. Saves to record.zoning_report.
export default function HawkZoningPermitting({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const report = record.zoning_report || null;
  const target = (record.parcel_targets || [])[record.active_target_index || 0] || null;

  async function generate() {
    setBusy(true);
    try {
      const res = await generateZoningPermitReport({
        lat: Number(record.latitude),
        lon: Number(record.longitude),
        candidate: target
          ? { parcel_address: target.parcel_address, zoning_classification: target.zoning_classification }
          : undefined,
      });
      const r = res.data?.report;
      if (!r) throw new Error("no report");
      const updated = await base44.entities.ScipRecord.update(record.id, {
        zoning_report: r,
        zoning_jurisdiction: res.data?.jurisdiction_resolved || record.zoning_jurisdiction || "",
      });
      onUpdate(updated);
      const z = res.data?.sources_used?.zoneomics_zone;
      toast.success(z ? `Zoning populated — Zoneomics zone ${z}` : "Zoning & permitting populated");
    } catch {
      toast.error("Zoning lookup failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>
            Step 2 — Hawk Zoning &amp; Permitting
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
          {report ? "Refresh Zoning & Permitting" : "Generate Zoning & Permitting"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Zoneomics-primary zoning district &amp; land use, plus Municode tower specs and curated jurisdiction contacts/fees/timeframes for the Site Plan and Building Permit sections. Populate this <strong>before</strong> picking your 3 targets so the parcel scoring uses the right zoning.
      </p>

      {report && <ScipZoningPage report={report} />}
    </div>
  );
}