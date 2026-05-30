import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { verifyLayers } from "@/functions/verifyLayers";
import { Loader2, ShieldCheck, Mountain, Droplets, Waves, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { SKYWAVE } from "@/lib/skywave";

const STATUS_COLOR = {
  ok: "#15803d", hit: "#15803d",
  miss: SKYWAVE.muted, none: SKYWAVE.muted, nodata: SKYWAVE.muted,
  error: "#b91c1c", cached: SKYWAVE.blue,
};

function StatusDot({ status }) {
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: STATUS_COLOR[status] || SKYWAVE.muted, display: "inline-block" }} />;
}

function LayerCard({ icon: Icon, title, status, source, children }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: SKYWAVE.blue }} />
          <span className="text-sm font-semibold" style={{ color: SKYWAVE.navy }}>{title}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase" style={{ color: STATUS_COLOR[status] || SKYWAVE.muted }}>
          <StatusDot status={status} />{status || "—"}
        </span>
      </div>
      <div className="text-sm" style={{ color: SKYWAVE.ink }}>{children}</div>
      {source && <div className="text-[10px] mt-1.5" style={{ color: SKYWAVE.muted }}>{source}</div>}
    </div>
  );
}

// Step 6 — Live federal-source Verification Map for Target A. Not printed in the SCIP.
export default function VerificationMap({ scipRecord, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const targets = scipRecord.parcel_targets || [];
  const target = targets[scipRecord.active_target_index || 0] || null;
  const vm = scipRecord.verification_map || null;

  async function generate() {
    if (!target) {
      toast.error("Run Step 3 (Find 3 Best Parcels) first — verification runs against Target A.");
      return;
    }
    setBusy(true);
    try {
      const res = await verifyLayers({
        lat: Number(target.latitude ?? scipRecord.latitude),
        lon: Number(target.longitude ?? scipRecord.longitude),
        targetLabel: target.label || "Target A",
      });
      const data = res.data?.verification_map || res.data;
      if (!data) throw new Error("no data");
      const updated = await base44.entities.ScipRecord.update(scipRecord.id, { verification_map: data });
      onUpdated(updated.verification_map);
      toast.success(`Verification map generated for ${target.label || "Target A"}`);
    } catch {
      toast.error("Verification failed — federal source may be down, try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>
            Step 6 — Verification Map {target ? `(${target.label})` : ""}
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {vm ? "Refresh Verification" : "Generate Verification"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Live federal-source proof for Target A — USGS 3DEP elevation, USFWS NWI wetlands, USGS NHD hydrography and USGS WBD watershed. Interactive only; never printed in the SCIP deliverable.
      </p>

      {vm && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <LayerCard icon={Mountain} title="Elevation" status={vm.elevation?.status} source={vm.elevation?.source}>
              {vm.elevation?.value_ft != null
                ? `${vm.elevation.value_ft} ft (${vm.elevation.value_m} m) AMSL`
                : <span style={{ color: SKYWAVE.muted }}>No elevation data</span>}
            </LayerCard>

            <LayerCard icon={Droplets} title="Wetlands" status={vm.wetlands?.status} source={vm.wetlands?.source}>
              {vm.wetlands?.present
                ? `${vm.wetlands.wetland_type || "Wetland"}${vm.wetlands.attribute_code ? ` (${vm.wetlands.attribute_code})` : ""}${vm.wetlands.acres ? ` · ${vm.wetlands.acres} ac` : ""}`
                : <span style={{ color: SKYWAVE.muted }}>No NWI wetlands at the pin</span>}
            </LayerCard>

            <LayerCard icon={Waves} title="Hydrography" status={vm.hydrography?.status} source={vm.hydrography?.source}>
              {vm.hydrography?.nearest_feature
                ? `${vm.hydrography.nearest_feature}${vm.hydrography.ftype ? ` · ${vm.hydrography.ftype}` : ""}`
                : <span style={{ color: SKYWAVE.muted }}>No named NHD feature nearby</span>}
            </LayerCard>

            <LayerCard icon={GitBranch} title="Watershed" status={vm.watershed?.status} source={vm.watershed?.source}>
              {vm.watershed?.name
                ? `${vm.watershed.name}${vm.watershed.huc12 ? ` · HUC12 ${vm.watershed.huc12}` : ""}`
                : <span style={{ color: SKYWAVE.muted }}>No WBD watershed resolved</span>}
            </LayerCard>
          </div>

          <div className="flex items-center justify-between mt-3 text-[10px]" style={{ color: SKYWAVE.muted }}>
            <span>{vm.target_label} · {Number(vm.target_lat).toFixed(5)}, {Number(vm.target_lon).toFixed(5)}</span>
            {vm.generated_at && (
              <span>
                {vm.served_from_cache ? "Cached · " : ""}
                {(() => { try { return format(new Date(vm.generated_at), "MMM d, yyyy h:mm a"); } catch { return vm.generated_at; } })()}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}