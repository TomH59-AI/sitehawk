import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { scipViewshed } from "@/functions/scipViewshed";
import { Loader2, Mountain } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { stampPatch, SECTION_KEYS, sectionLabel } from "@/lib/scipTarget";
import ScipViewshedPage from "./ScipViewshedPage";
import SectionStaleBanner from "./SectionStaleBanner";

// Step 5 — Viewshed Analysis for Target A.
export default function HawkViewshed({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const targets = record.parcel_targets || [];
  const target = targets[record.active_target_index || 0] || null;
  const vs = record.viewshed || null;

  async function generate() {
    if (!target) {
      toast.error("Run Find 3 Best Parcels (Hawk Parcel Data) first — viewshed is for Target A.");
      return;
    }
    setBusy(true);
    try {
      const res = await scipViewshed({
        lat: Number(target.latitude ?? record.latitude),
        lon: Number(target.longitude ?? record.longitude),
        ring_miles: Number(record.search_radius) || 0.25,
        tower_height_ft: Number(record.sarf_height) || 199,
      });
      const viewshed = res.data?.viewshed;
      if (!viewshed) throw new Error("no viewshed");
      const updated = await base44.entities.ScipRecord.update(record.id, { viewshed, ...stampPatch(record, SECTION_KEYS.viewshed) });
      onUpdate(updated);
      toast.success("Viewshed analysis generated for " + (target.label || "Target A"));
    } catch {
      toast.error("Viewshed generation failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Mountain className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>
            {sectionLabel(SECTION_KEYS.viewshed)} {target ? `(${target.label})` : ""}
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mountain className="w-4 h-4" />}
          {vs ? "Refresh Viewshed" : "Generate Viewshed"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Mapbox aerial of the Target A waypoint with the radius ring + tower marker, then N/S/E/W tree-line viewshed maps and USGS elevation profiles so the RF engineer can spot obstructions in the frequency path.
      </p>

      <SectionStaleBanner record={record} sectionKey={SECTION_KEYS.viewshed} hasData={!!vs} />
      {vs && (
        <ScipViewshedPage
          viewshed={vs}
          siteName={record.site_name}
          fallbackLat={Number(target?.latitude ?? record.latitude)}
          fallbackLon={Number(target?.longitude ?? record.longitude)}
        />
      )}
    </div>
  );
}