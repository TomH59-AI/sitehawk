/**
 * HawkVisionTargetsBlock — Section 1.3.
 *
 * Single Generate button calls findBestParcelForTower (Realie API + Notion zoning
 * + Enformion skip-trace) and fills out THREE complete target blocks:
 *   Target A / Target B / Target C
 *
 * Each target gets every row from SectionOne.xlsx:
 *   Parcel County, Parcel ID Number, Owner Name (on Deed),
 *   Parcel Street Address, Parcel City, Parcel State, Parcel Zip,
 *   Parcel Size (acres, MOL), Latitude, Longitude, Tower Height,
 *   Parcel Dimensions (feet), Conforming Size?, Taxes Paid-to-Date?,
 *   Owner Information → Name(s), Contact Person, Mailing Address,
 *   E-mail Address, Phone Number.
 */

import { useState } from "react";
import Section1Shell from "./Section1Shell";
import { Crosshair } from "lucide-react";
import { findBestParcelForTower } from "@/functions/findBestParcelForTower";

const LABELS = ["TARGET A", "TARGET B", "TARGET C"];
const COLORS = ["#00d4ff", "#10b981", "#f59e0b"];

const EMPTY_TARGET = {
  parcel_county: "", parcel_id: "", owner_name_on_deed: "",
  parcel_street_address: "", parcel_city: "", parcel_state: "", parcel_zip: "",
  parcel_size_acres: "", latitude: "", longitude: "", tower_height: "",
  parcel_dimensions: "", conforming_size: "", taxes_paid_to_date: "",
  owner_names: "", contact_person: "", mailing_address: "", email_address: "", phone_number: "",
};

function splitAddress(addr) {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const parts = String(addr).split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const sz = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
    return { street: parts[0] || "", city: parts[1] || "", state: sz?.[1] || "", zip: sz?.[2] || "" };
  }
  return { street: parts[0] || addr, city: "", state: "", zip: "" };
}

function mapApiTarget(t, towerHeight, compoundDims) {
  const a = splitAddress(t.parcel_address);
  return {
    parcel_county: t.county || "",
    parcel_id: t.parcel_id || "",
    owner_name_on_deed: t.owner_name || "",
    parcel_street_address: a.street || t.parcel_address || "",
    parcel_city: t.parcel_city || a.city || "",
    parcel_state: t.parcel_state || a.state || "",
    parcel_zip: t.parcel_zip || a.zip || "",
    parcel_size_acres: t.acreage != null ? `${t.acreage} ac MOL` : "",
    latitude: t.latitude != null ? Number(t.latitude).toFixed(6) : "",
    longitude: t.longitude != null ? Number(t.longitude).toFixed(6) : "",
    tower_height: towerHeight ? `${towerHeight} ft AGL` : "",
    parcel_dimensions: compoundDims || "",
    conforming_size: t.acreage != null ? (t.acreage >= 1 ? "Yes" : "TBD") : "TBD",
    taxes_paid_to_date: "TBD",
    owner_names: t.owner_name || "",
    contact_person: t.owner_name || "",
    mailing_address: t.mailing_address || t.parcel_address || "",
    email_address: t.email || "",
    phone_number: t.phone || "",
    zoning_fit: t.zoning_fit || "",
    requires_cup: t.requires_cup ? "Yes" : "No",
    cup_path_available: t.cup_path_available ? "Yes" : t.cup_assumed ? "Assumed - verify" : "No",
    pe_letter_accepted: t.pe_letter_accepted ? "Yes" : "Not verified",
    selection_criteria: Array.isArray(t.selection_criteria) ? t.selection_criteria.join(" ") : "",
  };
}

function TargetRow({ label, value, onChange }) {
  return (
    <div className="grid grid-cols-[240px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-xs text-foreground bg-muted/30 border-r border-border">{label}</div>
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-xs bg-card font-mono focus:outline-none focus:bg-primary/5"
      />
    </div>
  );
}

function TargetCard({ index, target, onChange }) {
  const color = COLORS[index] || COLORS[0];
  const update = (k, v) => onChange({ ...target, [k]: v });

  return (
    <div className="border-t border-border">
      <div
        className="px-4 py-2 flex items-center gap-2 text-white font-mono font-bold text-xs tracking-[0.2em]"
        style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)`, color: "#0a0e17" }}
      >
        <Crosshair className="w-3.5 h-3.5" /> {LABELS[index]} <span className="opacity-60 font-normal">· Realie API</span>
      </div>

      {/* Parcel rows */}
      <TargetRow label="Parcel County" value={target.parcel_county} onChange={(v) => update("parcel_county", v)} />
      <TargetRow label="Parcel ID Number" value={target.parcel_id} onChange={(v) => update("parcel_id", v)} />
      <TargetRow label="Owner Name (on Deed)" value={target.owner_name_on_deed} onChange={(v) => update("owner_name_on_deed", v)} />
      <TargetRow label="Parcel Street Address" value={target.parcel_street_address} onChange={(v) => update("parcel_street_address", v)} />
      <TargetRow label="Parcel City" value={target.parcel_city} onChange={(v) => update("parcel_city", v)} />
      <TargetRow label="Parcel State" value={target.parcel_state} onChange={(v) => update("parcel_state", v)} />
      <TargetRow label="Parcel Zip" value={target.parcel_zip} onChange={(v) => update("parcel_zip", v)} />
      <TargetRow label="Parcel Size (acres, MOL)" value={target.parcel_size_acres} onChange={(v) => update("parcel_size_acres", v)} />
      <TargetRow label="Latitude" value={target.latitude} onChange={(v) => update("latitude", v)} />
      <TargetRow label="Longitude" value={target.longitude} onChange={(v) => update("longitude", v)} />
      <TargetRow label="Tower Height" value={target.tower_height} onChange={(v) => update("tower_height", v)} />
      <TargetRow label="Parcel Dimensions (feet)" value={target.parcel_dimensions} onChange={(v) => update("parcel_dimensions", v)} />
      <TargetRow label="Conforming Size?" value={target.conforming_size} onChange={(v) => update("conforming_size", v)} />
      <TargetRow label="Taxes Paid-to-Date?" value={target.taxes_paid_to_date} onChange={(v) => update("taxes_paid_to_date", v)} />

      {/* Owner sub-header */}
      <div className="px-4 py-1.5 bg-[#0C1B2E]/90 text-cyan-300 font-mono text-[10px] tracking-[0.2em] uppercase border-t border-border">
        Owner Information · Realie API + Enformion
      </div>
      <TargetRow label="Name(s)" value={target.owner_names} onChange={(v) => update("owner_names", v)} />
      <TargetRow label="Contact Person" value={target.contact_person} onChange={(v) => update("contact_person", v)} />
      <TargetRow label="Mailing Address" value={target.mailing_address} onChange={(v) => update("mailing_address", v)} />
      <TargetRow label="E-mail Address" value={target.email_address} onChange={(v) => update("email_address", v)} />
      <TargetRow label="Phone Number" value={target.phone_number} onChange={(v) => update("phone_number", v)} />
    </div>
  );
}

export default function HawkVisionTargetsBlock({ acquisition, onTargetsReady }) {
  const [targets, setTargets] = useState([EMPTY_TARGET, EMPTY_TARGET, EMPTY_TARGET]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reasoning, setReasoning] = useState(null);

  async function handleGenerate() {
    const lat = parseFloat(acquisition.latitude);
    const lon = parseFloat(acquisition.longitude);
    const r = parseFloat(String(acquisition.search_radius || "").replace(/[^0-9.]/g, ""));
    const h = parseFloat(acquisition.tower_height_ft);

    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Enter Latitude and Longitude in Section 1 first.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await findBestParcelForTower({
        lat, lon,
        radius_miles: isFinite(r) ? r : 1.0,
        tower_height_ft: isFinite(h) ? h : 199,
      });
      const data = res?.data || res;
      if (data?.error) {
        setError(data.error);
      } else {
        const mapped = (data.targets || []).slice(0, 3).map((t) =>
          mapApiTarget(t, acquisition.tower_height_ft, acquisition.compound_dimensions)
        );
        while (mapped.length < 3) mapped.push(EMPTY_TARGET);
        setTargets(mapped);
        setReasoning(data.reasoning || null);
        onTargetsReady?.(mapped);
      }
    } catch (e) {
      setError(e.message || "Hawk Vision scan failed");
    } finally {
      setLoading(false);
    }
  }

  const updateTarget = (i, next) => {
    const updated = targets.map((t, idx) => (idx === i ? next : t));
    setTargets(updated);
    onTargetsReady?.(updated);
  };

  return (
    <Section1Shell
      step={3}
      title="Hawk Vision · Intelligent Parcel Selection"
      subtitle="Realie API · 3 feasible targets ranked by zoning + acreage + proximity"
      icon={Crosshair}
      generateLabel="GENERATE 3 TARGETS"
      onGenerate={handleGenerate}
      loading={loading}
    >
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}
      {reasoning && (
        <div className="px-3 py-2 bg-cyan-500/5 border-b border-cyan-500/20 text-[11px] font-mono text-cyan-700">
          {reasoning.jurisdiction || "Jurisdiction"} · Allowable zones:{" "}
          <span className="font-bold">{reasoning.allowable_zones?.join(", ") || "—"}</span> ·{" "}
          {reasoning.non_residential_candidates}/{reasoning.total_parcels_in_ring} non-residential parcels in ring
          <div className="mt-1 text-cyan-800">
            Source: <span className="font-bold">{reasoning.zoning_source || "zoning screen"}</span> | CUP:{" "}
            <span className="font-bold">
              {reasoning.requires_cup
                ? reasoning.cup_path_available ? "required / path found" : "assumed - verify"
                : "not required"}
            </span> | PE letter:{" "}
            <span className="font-bold">{reasoning.pe_letter_accepted ? "accepted" : "not verified"}</span>
          </div>
        </div>
      )}

      {targets.map((t, i) => (
        <TargetCard key={i} index={i} target={t} onChange={(next) => updateTarget(i, next)} />
      ))}
    </Section1Shell>
  );
}
