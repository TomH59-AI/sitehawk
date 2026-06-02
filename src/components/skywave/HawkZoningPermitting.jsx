import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { jurisdictionZoningCache } from "@/functions/jurisdictionZoningCache";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";
import { Loader2, ClipboardList, RefreshCw, DatabaseZap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { SKYWAVE } from "@/lib/skywave";
import ScipZoningPage from "./ScipZoningPage";
import TargetSiteIntelPanel from "./TargetSiteIntelPanel";

// Step 2 — Hawk Zoning & Permitting. Reuses an app-wide jurisdiction-level cache
// (JurisdictionZoningCache) so same jurisdiction = fetch once, reuse many times.
// Runs right after the SARF, before the 3-target parcel pick. Snapshots the
// report onto record.zoning_report so old SCIPs never change later.
export default function HawkZoningPermitting({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [provenance, setProvenance] = useState(null);
  const report = record.zoning_report || null;
  const target = (record.parcel_targets || [])[record.active_target_index || 0] || null;

  async function generate(forceRefresh = false) {
    setBusy(true);
    const lat = Number(record.latitude);
    const lon = Number(record.longitude);
    const district = target?.zoning_classification || undefined;
    try {
      // 1) Try the app-wide jurisdiction cache first (unless forcing a refresh).
      if (!forceRefresh) {
        const look = await jurisdictionZoningCache({ action: "lookup", lat, lon, zoning_district: district });
        if (look.data?.cache === "hit" && look.data?.report) {
          await applyReport(look.data.report, look.data);
          toast.success(`Reused saved zoning for ${look.data?.jurisdiction?.jurisdiction_name || "this jurisdiction"}`);
          return;
        }
      }

      // 2) Cache miss or force refresh → run the real Zoneomics→Realie→AI fetch.
      const gen = await generateZoningPermitReport({
        lat, lon,
        candidate: target
          ? { parcel_address: target.parcel_address, zoning_classification: target.zoning_classification }
          : undefined,
      });
      const r = gen.data?.report;
      if (!r) throw new Error("no report");

      // 3) Save the fresh report into the app-wide jurisdiction cache.
      const save = await jurisdictionZoningCache({
        action: "save",
        lat, lon,
        zoning_district: district,
        report: r,
        zone_code: gen.data?.zoneomics?.zone_code || null,
        zoneomics_ok: !!gen.data?.sources_used?.zoneomics,
        raw_response: { zoneomics: gen.data?.zoneomics || null },
      });
      await applyReport(r, { ...save.data, cache: forceRefresh ? "refreshed" : "miss" });
      toast.success(forceRefresh ? "Zoning force-refreshed & cache updated" : "Zoning fetched & saved to jurisdiction cache");
    } catch {
      toast.error("Zoning lookup failed — try again");
    } finally {
      setBusy(false);
    }
  }

  // Snapshot the report onto THIS ScipRecord (so old SCIPs never change later)
  // and record provenance for the UI.
  async function applyReport(r, meta) {
    const updated = await base44.entities.ScipRecord.update(record.id, {
      zoning_report: r,
      zoning_jurisdiction: meta?.jurisdiction?.jurisdiction_name || record.zoning_jurisdiction || "",
    });
    onUpdate(updated);
    setProvenance({
      cache: meta?.cache,
      jurisdiction: meta?.jurisdiction?.jurisdiction_name,
      source: meta?.source_name,
      verified: meta?.last_verified_at,
    });
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => generate(false)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: SKYWAVE.blue }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
            {report ? "Reuse / Generate Zoning" : "Generate Zoning & Permitting"}
          </button>
          {report && (
            <button
              onClick={() => generate(true)}
              disabled={busy}
              title="Re-fetch from Zoneomics and update the jurisdiction cache for everyone"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white disabled:opacity-50"
              style={{ border: `1.5px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}
            >
              <RefreshCw className="w-4 h-4" /> Force Refresh
            </button>
          )}
        </div>
      </div>

      <p className="text-xs mb-3" style={{ color: SKYWAVE.muted }}>
        Same jurisdiction = fetch once, reuse many times. Zoning is saved to an app-wide jurisdiction cache and reused automatically across SCIPs. Populate this <strong>before</strong> picking your 3 targets so the parcel scoring uses the right zoning. Use <strong>Force Refresh</strong> to re-pull from Zoneomics and update the shared cache.
      </p>

      {provenance && (
        <div className="flex items-center gap-2 text-[11px] mb-4 px-3 py-2 rounded-lg" style={{ background: SKYWAVE.bg, color: SKYWAVE.muted }}>
          <DatabaseZap className="w-3.5 h-3.5" style={{ color: SKYWAVE.blue }} />
          <span>
            {provenance.cache === "hit" ? "Reused cached jurisdiction data" : provenance.cache === "refreshed" ? "Force-refreshed cache" : "Fetched & cached"}
            {provenance.jurisdiction ? ` · ${provenance.jurisdiction}` : ""}
            {provenance.source ? ` · ${provenance.source}` : ""}
            {provenance.verified ? ` · verified ${format(new Date(provenance.verified), "MMM d, yyyy")}` : ""}
          </span>
        </div>
      )}

      {report && <ScipZoningPage report={report} />}

      <div className="mt-5 no-print">
        <h4 className="font-bold text-sm mb-2" style={{ color: SKYWAVE.navy }}>Target Site Intelligence — {target?.label || "Target A"}</h4>
        <TargetSiteIntelPanel
          lat={Number(target?.latitude ?? record.latitude)}
          lon={Number(target?.longitude ?? record.longitude)}
          label={target?.label || "Target A"}
        />
      </div>
    </div>
  );
}