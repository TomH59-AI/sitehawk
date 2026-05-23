/**
 * ExistingConditionsBlock — Section 1.4.
 *
 * Single Generate button runs the diagnostics fan-out for Target One's lat/lon:
 *   Flood Zone(s)          ← femaFloodLookup (NFHL)
 *   Wetland Concerns?      ← wetlandsLookup (USFWS NWI)
 *   Water Management Dist  ← state-based static map
 *   Hazardous Waste        ← manual (no public point-API)
 *   Access Notes           ← manual
 *
 * Rows match SectionOne.xlsx exactly — no extras, no omissions.
 */

import { useState } from "react";
import Section1Shell from "./Section1Shell";
import { Activity } from "lucide-react";
import { femaFloodLookup } from "@/functions/femaFloodLookup";
import { wetlandsLookup } from "@/functions/wetlandsLookup";

const WMD_BY_STATE = {
  FL: "Florida WMD (SWFWMD / SJRWMD / SFWMD / NWFWMD / SRWMD — by county)",
  GA: "GA Environmental Protection Division (EPD)",
  NC: "NC Division of Water Resources (DWR)",
  SC: "SC Dept. of Environmental Services (SCDES)",
  TN: "TN Dept. of Environment & Conservation (TDEC)",
  AL: "AL Dept. of Environmental Management (ADEM)",
  VA: "VA Dept. of Environmental Quality (DEQ)",
  TX: "TX Commission on Environmental Quality (TCEQ)",
};

function Row({ label, value, placeholder, onChange }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm text-foreground bg-muted/40 border-r border-border">{label}</div>
      <input
        type="text"
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-sm bg-card focus:outline-none focus:bg-primary/5"
      />
    </div>
  );
}

const EMPTY = {
  flood_zones: "",
  wetland_concerns: "",
  water_management_district: "",
  hazardous_waste: "",
  access_notes: "",
};

export default function ExistingConditionsBlock({ targetOne }) {
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setValues((p) => ({ ...p, [k]: v }));

  async function handleGenerate() {
    const lat = parseFloat(targetOne?.latitude);
    const lon = parseFloat(targetOne?.longitude);
    const state = (targetOne?.parcel_state || "").toUpperCase();

    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Generate Hawk Vision Targets first — Existing Conditions runs on Target One's coordinates.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const [flood, wet] = await Promise.allSettled([
        femaFloodLookup({ lat, lon }),
        wetlandsLookup({ lat, lon }),
      ]);

      const next = { ...values };

      if (flood.status === "fulfilled") {
        const d = flood.value?.data || {};
        const zone = d.fema_zone || d.zone || "";
        const desc = d.fema_zone_description || d.description || "";
        next.flood_zones = [zone, desc].filter(Boolean).join(" — ") || "Zone X (minimal risk)";
      } else {
        next.flood_zones = "Lookup failed — verify manually";
      }

      if (wet.status === "fulfilled") {
        const d = wet.value?.data || {};
        if (d.wetlands_present) {
          const types = (d.wetland_types || []).join(", ");
          next.wetland_concerns = `Yes — ${d.wetland_proximity || "on-site"}${types ? ` (${types})` : ""}`;
        } else {
          next.wetland_concerns = "None mapped (USFWS NWI)";
        }
      } else {
        next.wetland_concerns = "Lookup failed — verify manually";
      }

      next.water_management_district =
        WMD_BY_STATE[state] || (state ? `${state} state environmental agency` : "TBD — confirm by state/county");

      if (!next.hazardous_waste) next.hazardous_waste = "TBD — Phase I ESA recommended";
      if (!next.access_notes) next.access_notes = "TBD — confirm ROW, driveway, gate code on site visit";

      setValues(next);
    } catch (e) {
      setError(e.message || "Diagnostics failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section1Shell
      step={4}
      title="Target One · Existing Conditions"
      subtitle="FEMA NFHL · USFWS NWI · State WMD"
      icon={Activity}
      generateLabel="GENERATE CONDITIONS"
      onGenerate={handleGenerate}
      loading={loading}
    >
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <Row label="Flood Zone(s)" value={values.flood_zones} placeholder="e.g. Zone X — minimal risk" onChange={(v) => update("flood_zones", v)} />
      <Row label="Wetland Concerns?" value={values.wetland_concerns} placeholder="None mapped / on-site / adjacent" onChange={(v) => update("wetland_concerns", v)} />
      <Row label="Water Management District" value={values.water_management_district} placeholder="e.g. SWFWMD" onChange={(v) => update("water_management_district", v)} />
      <Row label="Hazardous Waste Concerns?" value={values.hazardous_waste} placeholder="Yes / No / TBD (Phase I ESA)" onChange={(v) => update("hazardous_waste", v)} />
      <Row label="Access Notes (ROW, driveway, code)" value={values.access_notes} placeholder="Paved ROW / recorded easement / gate code" onChange={(v) => update("access_notes", v)} />
    </Section1Shell>
  );
}