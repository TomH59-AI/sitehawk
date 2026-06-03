import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { scipBestParcels } from "@/functions/scipBestParcels";
import { Loader2, Crosshair, ChevronRight, Award } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { sectionLabel, SECTION_KEYS } from "@/lib/scipTarget";

const ROWS = [
  ["owner_name", "Owner's Name"],
  ["parcel_address", "Parcel Address"],
  ["apn", "Parcel ID"],
  ["acreage", "Parcel Size (acres)"],
  ["boundaries", "Boundaries"],
  ["zoning_classification", "Zoning Classification"],
  ["mailing_address", "Owner's Mailing Address"],
  ["coordinates", "Coordinates"],
  ["fema_risk_factor", "FEMA Risk Factor"],
];

function cellValue(t, key) {
  if (!t) return "";
  if (key === "coordinates") {
    return t.latitude != null && t.longitude != null ? `${Number(t.latitude).toFixed(5)}, ${Number(t.longitude).toFixed(5)}` : "";
  }
  const v = t[key];
  if (v == null || v === "") return "";
  if (key === "acreage") return Number(v).toFixed(3);
  return String(v);
}

// On-screen, editable Step-3 panel. Generates the three best parcels and lets the user
// advance to the next target if Target A is turned down.
export default function HawkParcelTargets({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const targets = record.parcel_targets || [];
  const activeIdx = record.active_target_index || 0;

  async function generate() {
    setBusy(true);
    try {
      const res = await scipBestParcels({
        lat: Number(record.latitude),
        lon: Number(record.longitude),
        radius_miles: Number(record.search_radius) || 1.0,
        tower_height_ft: Number(record.sarf_height) || 199,
        compound_side_ft: 100,
      });
      const t = res.data?.targets || [];
      if (!t.length) throw new Error("no parcels");
      const updated = await base44.entities.ScipRecord.update(record.id, {
        parcel_targets: t,
        active_target_index: 0,
      });
      onUpdate(updated);
      toast.success(`Found ${res.data.count_scanned} parcels — ranked top 3 targets`);
    } catch {
      toast.error("Parcel search failed — try again");
    } finally {
      setBusy(false);
    }
  }

  async function advanceTarget() {
    if (activeIdx >= targets.length - 1) {
      toast.info("No more targets — all candidates exhausted");
      return;
    }
    const next = activeIdx + 1;
    const updated = await base44.entities.ScipRecord.update(record.id, { active_target_index: next });
    onUpdate(updated);
    toast.success(`SCIP now focused on ${targets[next].label}`);
  }

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Crosshair className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
          <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>{sectionLabel(SECTION_KEYS.parcel_targets)}</h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
          {targets.length ? "Re-run Parcel Search" : "Find 3 Best Parcels"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Searches every parcel in the SARF ring (Realie) and scores them on no-residential, lot size vs setbacks/fall-zone/separation, zoning classification (Zoneomics) and FEMA flood risk.
        <strong> Target A is the SCIP focus</strong> — if the client turns it down, advance to the next.
      </p>

      {targets.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 font-bold uppercase text-xs" style={{ color: SKYWAVE.navy, borderBottom: `2px solid ${SKYWAVE.blue}` }}>Hawk Parcel Data</th>
                  {targets.map((t, i) => (
                    <th key={i} className="text-left p-2 font-bold text-xs" style={{
                      color: i === activeIdx ? "#fff" : SKYWAVE.navy,
                      background: i === activeIdx ? SKYWAVE.blue : "transparent",
                      borderBottom: `2px solid ${SKYWAVE.blue}`,
                    }}>
                      <span className="inline-flex items-center gap-1">
                        {i === activeIdx && <Award className="w-3.5 h-3.5" style={{ color: SKYWAVE.yellow }} />}
                        {t.label}
                        {t.score != null && <span className="ml-1 font-normal opacity-80">· {t.score}</span>}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([key, label]) => (
                  <tr key={key}>
                    <td className="p-2 font-medium align-top" style={{ color: SKYWAVE.blue, borderBottom: `1px solid ${SKYWAVE.line}` }}>{label}:</td>
                    {targets.map((t, i) => (
                      <td key={i} className="p-2 align-top" style={{
                        color: SKYWAVE.ink,
                        background: i === activeIdx ? "rgba(27,63,174,0.04)" : "transparent",
                        borderBottom: `1px solid ${SKYWAVE.line}`,
                      }}>
                        {cellValue(t, key) || <span style={{ color: SKYWAVE.muted }}>—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {targets[activeIdx]?.score_reasons?.length > 0 && (
            <div className="mt-3 text-xs" style={{ color: SKYWAVE.muted }}>
              <strong style={{ color: SKYWAVE.navy }}>{targets[activeIdx].label} rationale:</strong>{" "}
              {targets[activeIdx].score_reasons.join(" · ")}
            </div>
          )}

          {activeIdx < targets.length - 1 && (
            <button
              onClick={advanceTarget}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ border: `1.5px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}
            >
              {targets[activeIdx].label} turned down — move SCIP to {targets[activeIdx + 1].label}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </>
      )}
    </div>
  );
}