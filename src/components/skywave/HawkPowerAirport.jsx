import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { scipPowerAirportMaps } from "@/functions/scipPowerAirportMaps";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { stampPatch, SECTION_KEYS } from "@/lib/scipTarget";
import ScipPowerAirportPage from "./ScipPowerAirportPage";
import SectionStaleBanner from "./SectionStaleBanner";
import LiveAirportMap from "./LiveAirportMap";

// Step 3.6 — Power (electric service) + Airport maps for the active target.
export default function HawkPowerAirport({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const targets = record.parcel_targets || [];
  const target = targets[record.active_target_index || 0] || null;
  const data = record.power_airport_maps || null;

  async function generate() {
    if (!target) {
      toast.error("Run Step 3 (Find 3 Best Parcels) first — these maps are for Target A.");
      return;
    }
    setBusy(true);
    try {
      const res = await scipPowerAirportMaps({
        lat: Number(target.latitude ?? record.latitude),
        lon: Number(target.longitude ?? record.longitude),
        radius_miles: Number(record.search_radius) || 1.0,
        state: (record.state || "").toUpperCase(),
      });
      const payload = { power: res.data?.power || null, airport: res.data?.airport || null };
      if (!payload.power && !payload.airport) throw new Error("no maps");
      const updated = await base44.entities.ScipRecord.update(record.id, { power_airport_maps: payload, ...stampPatch(record, SECTION_KEYS.power_airport) });
      onUpdate(updated);
      toast.success("Power & Airport maps generated for " + (target.label || "Target A"));
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
          <Zap className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>
            Step 3.6 — Power &amp; Airport {target ? `(${target.label})` : ""}
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {data ? "Refresh Power & Airport" : "Generate Power & Airport"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Electric service map — nearest power provider connected to the tower site with company name, contact address &amp; transmission-line voltage. Airport map — property waypoint with the radius ring and nearest airport (plane icon), distance shown as the hawk flies.
      </p>

      <SectionStaleBanner record={record} sectionKey={SECTION_KEYS.power_airport} hasData={!!data} />
      {data && <ScipPowerAirportPage data={data} />}

      {target && (
        <div className="mt-4 no-print">
          <LiveAirportMap
            lat={Number(target.latitude ?? record.latitude)}
            lon={Number(target.longitude ?? record.longitude)}
            label={target.label || "Target A"}
          />
        </div>
      )}
    </div>
  );
}