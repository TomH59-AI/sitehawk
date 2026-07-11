import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { scipPowerAirportMaps } from "@/functions/scipPowerAirportMaps";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { stampPatch, SECTION_KEYS, sectionLabel, resolveScipActiveTarget } from "@/lib/scipTarget";
import ScipPowerAirportPage from "./ScipPowerAirportPage";
import UnifiedGridMap from "@/components/powerlines/UnifiedGridMap";
import SectionStaleBanner from "./SectionStaleBanner";
import LiveAirportMap from "./LiveAirportMap";
import LiveTowerMap from "./LiveTowerMap";

// Step 3.6 — Power (electric service) + Airport maps for the active target.
export default function HawkPowerAirport({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const ctx = resolveScipActiveTarget(record);
  const targets = record.parcel_targets || [];
  const target = targets.length > 0 ? (targets[ctx.target_index] || null) : null;
  const data = record.power_airport_maps || null;

  async function generate() {
    if (!target) {
      toast.error("Run Section 1 (Find 3 Best Parcels) first — these maps are for Target A.");
      return;
    }
    setBusy(true);
    try {
      const res = await scipPowerAirportMaps({
        lat: ctx.lat,
        lon: ctx.lon,
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
            {sectionLabel(SECTION_KEYS.power_airport)} {target ? `(${target.label})` : ""}
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

      {/* Unified Power + Fiber map — piped in RIGHT AFTER the existing Power & Airport
          map, driven by the same Target A (resolveScipActiveTarget), keeping the flow. */}
      {ctx.lat != null && ctx.lon != null && (
        <div className="mt-5 no-print space-y-2 border-t pt-4" style={{ borderColor: SKYWAVE.line }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[10px] font-mono tracking-[0.25em]" style={{ color: SKYWAVE.blue }}>SCIP · POWER + FIBER · ONE VIEW · LIVE</div>
              <div className="font-heading font-bold text-lg leading-tight" style={{ color: SKYWAVE.navy }}>Unified Power + Fiber Map — {ctx.target_label}</div>
            </div>
            <Link
              to={`/site-power-map?scip=${record.id}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ border: `1px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}
            >
              <Zap className="w-3.5 h-3.5" /> Open full-screen ↗
            </Link>
          </div>
          <UnifiedGridMap target={{ lat: ctx.lat, lon: ctx.lon, label: ctx.target_label, address: target?.parcel_address || "" }} height={520} />
        </div>
      )}

      {ctx.lat != null && ctx.lon != null && (
        <div className="mt-4 no-print">
          <LiveAirportMap
            lat={ctx.lat}
            lon={ctx.lon}
            label={ctx.target_label}
            radiusMiles={Number(record.search_radius) || 1}
          />
          <div className="mt-4">
            <LiveTowerMap
              lat={ctx.lat}
              lon={ctx.lon}
              label={ctx.target_label}
            />
          </div>
        </div>
      )}
    </div>
  );
}