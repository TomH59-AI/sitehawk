import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { scipMapSuite } from "@/functions/scipMapSuite";
import { Loader2, Map } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { stampPatch, SECTION_KEYS, sectionLabel, resolveScipActiveTarget } from "@/lib/scipTarget";
import ScipHawkMapsPage from "./ScipHawkMapsPage";
import SectionStaleBanner from "./SectionStaleBanner";

// Step 3.5 — HAWK MAPS for the active target (Aerial / Topography / Floodplain / Zoning).
export default function HawkMaps({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const ctx = resolveScipActiveTarget(record);
  const targets = record.parcel_targets || [];
  const target = targets.length > 0 ? (targets[ctx.target_index] || null) : null;
  const maps = record.hawk_maps || null;

  async function generate() {
    if (!target) {
      toast.error("Run Section 1 (Find 3 Best Parcels) first — HAWK MAPS are for Target A.");
      return;
    }
    setBusy(true);
    try {
      const res = await scipMapSuite({
        targets: [{
          label: ctx.target_label,
          site_name: record.site_name || "Site",
          lat: ctx.lat,
          lng: ctx.lon,
          apn: ctx.apn || null,
          owner: ctx.owner_name || null,
        }],
        jurisdiction: record.zoning_jurisdiction || record.county || "Unknown",
        state: (record.state || "XX").toUpperCase(),
        search_radius_mi: Number(record.search_radius) || 1.0,
      });
      const targetMaps = res.data?.targets?.[0]?.maps || [];
      if (!targetMaps.length) throw new Error("no maps");
      const byType = Object.fromEntries(targetMaps.map((m) => [m.type, m]));
      const hawk_maps = {
        aerial_url: byType.aerial?.url || "",
        topography_url: byType.topography?.url || "",
        floodplain_url: byType.floodplain?.url || "",
        zoning_url: byType.zoning?.url || "",
        zone_code: byType.zoning?.zone_code || "",
        center_amsl_ft: byType.topography?.center_amsl_ft ?? null,
      };
      const updated = await base44.entities.ScipRecord.update(record.id, { hawk_maps, ...stampPatch(record, SECTION_KEYS.hawk_maps) });
      onUpdate(updated);
      toast.success("HAWK MAPS generated for " + (target.label || "Target A"));
    } catch {
      toast.error("Map generation failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Map className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>
            {sectionLabel(SECTION_KEYS.hawk_maps)} {target ? `(${target.label})` : ""}
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Map className="w-4 h-4" />}
          {maps ? "Refresh HAWK MAPS" : "Generate HAWK MAPS"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Renders the four core HAWK MAPS for Target A — Aerial, Topography (USGS 3DEP), Floodplain (FEMA NFHL overlay) and Zoning (Zoneomics overlay).
      </p>

      <SectionStaleBanner record={record} sectionKey={SECTION_KEYS.hawk_maps} hasData={!!maps} />
      {maps && <ScipHawkMapsPage hawkMaps={maps} />}
    </div>
  );
}