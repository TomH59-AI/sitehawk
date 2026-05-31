import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { scipExistingConditions } from "@/functions/scipExistingConditions";
import { Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";

const ROWS = [
  ["flood_zone", "Flood Zone(s)"],
  ["wetland_concerns", "Wetland Concerns?"],
  ["water_management_district", "Water Management District"],
  ["hazardous_waste", "Hazardous Waste Concerns?"],
  ["access_notes", "Access Notes (ROW, driveway, code)"],
  ["contact_911", "911 Contact Information (non-emergency address & phone)"],
  ["local_police", "Local Police (municipality & phone)"],
  ["local_fire", "Local Fire Dept (municipality & phone)"],
];

// Step — Existing Conditions for Target A (the active SCIP target).
export default function HawkExistingConditions({ record, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const targets = record.parcel_targets || [];
  const target = targets[record.active_target_index || 0] || null;
  const ec = record.existing_conditions || null;

  async function generate() {
    if (!target) {
      toast.error("Run Step 3 (Find 3 Best Parcels) first — Existing Conditions describes Target A.");
      return;
    }
    setBusy(true);
    try {
      const res = await scipExistingConditions({
        lat: Number(target.latitude ?? record.latitude),
        lon: Number(target.longitude ?? record.longitude),
        parcel_address: target.parcel_address || "",
        county: record.county || "",
        state: record.state || "",
      });
      const conditions = res.data?.conditions;
      if (!conditions) throw new Error("no conditions");
      const updated = await base44.entities.ScipRecord.update(record.id, { existing_conditions: conditions });
      onUpdate(updated);
      toast.success("Existing conditions generated for " + (target.label || "Target A"));
    } catch {
      toast.error("Lookup failed — try again");
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
            Step 4 — Existing Conditions {target ? `(${target.label})` : ""}
          </h3>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: SKYWAVE.blue }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
          {ec ? "Refresh Conditions" : "Generate Existing Conditions"}
        </button>
      </div>

      <p className="text-xs mb-4" style={{ color: SKYWAVE.muted }}>
        Pulls FEMA flood zone, USFWS wetlands, and nearest police/fire for Target A, plus web-researched water management district, hazardous-waste/brownfield status, and access notes.
      </p>

      {ec && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {ROWS.map(([key, label]) => (
                <tr key={key}>
                  <td className="p-2 font-medium align-top w-[40%]" style={{ color: SKYWAVE.blue, borderBottom: `1px solid ${SKYWAVE.line}` }}>{label}</td>
                  <td className="p-2 align-top" style={{ color: SKYWAVE.ink, borderBottom: `1px solid ${SKYWAVE.line}` }}>
                    {ec[key] || <span style={{ color: SKYWAVE.muted }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}