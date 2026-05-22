/**
 * SCIPPage1ExistingConditions — Page 1 EXISTING CONDITIONS block.
 *
 * One-click "Run Site Diagnostics" button fans out parallel lookups against the
 * backend functions we already have:
 *   • Flood Zone(s)            ← femaFloodLookup (NFHL)
 *   • Wetland Concerns         ← wetlandsLookup (USFWS NWI)
 *   • Water Management District ← state-based (FL = SWFWMD/SJRWMD/SFWMD/NWFWMD/SRWMD,
 *                                 other states = state environmental agency)
 *   • Power Provider           ← electricUtilityLookup (HIFLD)
 *   • Fiber Available          ← fccBroadbandLookup (FCC + OSM)
 *   • Nearest Airport          ← nearestAirport
 *   • Police / Fire            ← publicSafetyLookup (OSM Overpass)
 *
 * Two fields aren't programmatically derivable (hazardous waste & access notes)
 * — those stay manual rows the user fills in.
 */

import { useState } from "react";
import { Loader2, Activity } from "lucide-react";
import { femaFloodLookup } from "@/functions/femaFloodLookup";
import { wetlandsLookup } from "@/functions/wetlandsLookup";
import { electricUtilityLookup } from "@/functions/electricUtilityLookup";
import { fccBroadbandLookup } from "@/functions/fccBroadbandLookup";
import { nearestAirport } from "@/functions/nearestAirport";
import { publicSafetyLookup } from "@/functions/publicSafetyLookup";

function EditableRow({ label, value, placeholder, onChange }) {
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

const DEFAULTS = {
  flood_zones: "",
  wetland_concerns: "",
  water_management_district: "",
  hazardous_waste: "",
  access_notes: "",
  power_provider: "",
  fiber_available: "",
  telco_provider: "",
  nearest_airport: "",
  local_police: "",
  local_fire: "",
};

// Florida is the only state with named WMDs; for everything else we point to
// the state environmental/water agency. Lightweight lookup — no API call.
const WMD_BY_STATE = {
  FL_DEFAULT: "Florida WMD (district depends on county — SWFWMD / SJRWMD / SFWMD / NWFWMD / SRWMD)",
};
function guessWaterMgmtDistrict(state) {
  if (!state) return "";
  const s = state.toUpperCase();
  if (s === "FL") return WMD_BY_STATE.FL_DEFAULT;
  const stateAgencies = {
    GA: "GA Environmental Protection Division (EPD)",
    NC: "NC Division of Water Resources (DWR)",
    SC: "SC Dept. of Environmental Services (SCDES)",
    TN: "TN Dept. of Environment & Conservation (TDEC)",
    AL: "AL Dept. of Environmental Management (ADEM)",
    VA: "VA Dept. of Environmental Quality (DEQ)",
    TX: "TX Commission on Environmental Quality (TCEQ)",
  };
  return stateAgencies[s] || `${s} state environmental agency`;
}

function formatPhone(p) {
  if (!p) return "";
  return String(p).replace(/[^\d]/g, "").replace(/^1?(\d{3})(\d{3})(\d{4}).*/, "($1) $2-$3") || p;
}

export default function SCIPPage1ExistingConditions({ page1Values, siteOwner }) {
  const [values, setValues] = useState(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  async function runDiagnostics() {
    const lat = parseFloat(siteOwner?.site?.latitude || page1Values?.latitude);
    const lon = parseFloat(siteOwner?.site?.longitude || page1Values?.longitude);
    const state = siteOwner?.site?.parcel_state || "";

    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Enter Latitude / Longitude (or click Find Best Parcel) first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [flood, wet, util, fiber, air, safety] = await Promise.allSettled([
        femaFloodLookup({ lat, lon }),
        wetlandsLookup({ lat, lon }),
        electricUtilityLookup({ lat, lon }),
        fccBroadbandLookup({ lat, lon }),
        nearestAirport({ lat, lon }),
        publicSafetyLookup({ lat, lon }),
      ]);

      const next = { ...values };

      // Flood
      if (flood.status === "fulfilled") {
        const d = flood.value?.data || {};
        const zone = d.fema_zone || d.zone || "";
        const desc = d.fema_zone_description || d.description || "";
        next.flood_zones = [zone, desc].filter(Boolean).join(" — ") || "Zone X (minimal risk)";
      }

      // Wetlands
      if (wet.status === "fulfilled") {
        const d = wet.value?.data || {};
        if (d.wetlands_present) {
          const types = (d.wetland_types || []).join(", ");
          next.wetland_concerns = `Yes — ${d.wetland_proximity || "on-site"}${types ? ` (${types})` : ""}`;
        } else {
          next.wetland_concerns = "None mapped (USFWS NWI)";
        }
      }

      // Water Management District (state-based)
      next.water_management_district = guessWaterMgmtDistrict(state);

      // Power Provider
      if (util.status === "fulfilled") {
        const d = util.value?.data || {};
        const name = d.utility_name || d.power_utility || "";
        const phone = formatPhone(d.utility_phone || d.phone);
        next.power_provider = [name, phone].filter(Boolean).join(" — ");
      }

      // Fiber Available
      if (fiber.status === "fulfilled") {
        const d = fiber.value?.data || {};
        if (d.has_fiber) {
          const providers = (d.fiber_providers || []).map((p) => p.provider_name).filter(Boolean);
          next.fiber_available = `Yes${providers.length ? ` — ${providers.slice(0, 3).join(", ")}` : ""}`;
          next.telco_provider = providers[0] || "";
        } else if (d.fiber_distance_miles != null) {
          next.fiber_available = `Nearest fiber ~${Number(d.fiber_distance_miles).toFixed(2)} mi (${d.fiber_operator || "unknown operator"})`;
        } else {
          next.fiber_available = "No fiber mapped at this location";
        }
      }

      // Nearest Airport
      if (air.status === "fulfilled") {
        const d = air.value?.data || {};
        const name = d.airport_name || d.name || "";
        const dist = d.airport_distance_miles ?? d.distance_miles;
        if (name && dist != null) next.nearest_airport = `${name} — ${Number(dist).toFixed(1)} mi`;
      }

      // Police / Fire
      if (safety.status === "fulfilled") {
        const d = safety.value?.data || {};
        const police = d.police || {};
        const fire = d.fire || {};
        if (police.name) {
          next.local_police = [police.name, formatPhone(police.phone)].filter(Boolean).join(" — ");
        }
        if (fire.name) {
          next.local_fire = [fire.name, formatPhone(fire.phone)].filter(Boolean).join(" — ");
        }
      }

      setValues(next);
    } catch (e) {
      setError(e.message || "Diagnostics failed");
    } finally {
      setLoading(false);
    }
  }

  const runButton = (
    <button
      onClick={runDiagnostics}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
      {loading ? "Running…" : "Run Site Diagnostics"}
    </button>
  );

  return (
    <>
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase flex items-center justify-between">
        <span>Existing Conditions</span>
        {runButton}
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <EditableRow label="Flood Zone(s)" value={values.flood_zones} placeholder="e.g. Zone X — minimal risk" onChange={(v) => update("flood_zones", v)} />
      <EditableRow label="Wetland Concerns?" value={values.wetland_concerns} placeholder="None mapped / on-site / adjacent" onChange={(v) => update("wetland_concerns", v)} />
      <EditableRow label="Water Management District" value={values.water_management_district} placeholder="e.g. SWFWMD" onChange={(v) => update("water_management_district", v)} />
      <EditableRow label="Hazardous Waste Concerns?" value={values.hazardous_waste} placeholder="Yes / No / TBD (Phase I ESA)" onChange={(v) => update("hazardous_waste", v)} />
      <EditableRow label="Access Notes (ROW, driveway, code)" value={values.access_notes} placeholder="e.g. Paved ROW access via Sligh Ave; recorded easement" onChange={(v) => update("access_notes", v)} />
      <EditableRow label="Power Provider (name & phone)" value={values.power_provider} placeholder="e.g. Duke Energy — (800) 700-8744" onChange={(v) => update("power_provider", v)} />
      <EditableRow label="Fiber Available?" value={values.fiber_available} placeholder="Yes / No / nearest distance" onChange={(v) => update("fiber_available", v)} />
      <EditableRow label="Telco Provider (name & phone)" value={values.telco_provider} placeholder="e.g. Frontier — (855) 981-0710" onChange={(v) => update("telco_provider", v)} />
      <EditableRow label="Nearest Airport (name & distance)" value={values.nearest_airport} placeholder="e.g. KTPA — 4.2 mi" onChange={(v) => update("nearest_airport", v)} />
      <EditableRow label="Local Police (municipality & phone)" value={values.local_police} placeholder="e.g. Tampa PD — (813) 231-6130" onChange={(v) => update("local_police", v)} />
      <EditableRow label="Local Fire Dept (municipality & phone)" value={values.local_fire} placeholder="e.g. Tampa Fire Rescue — (813) 274-7011" onChange={(v) => update("local_fire", v)} />
    </>
  );
}