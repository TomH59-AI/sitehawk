/**
 * SCIPPage1SiteOwnerBlock — Page 1 SITE INFORMATION + OWNER INFORMATION rows.
 *
 * One-click "Find Best Parcel" button calls the findBestParcelForTower backend
 * function, which:
 *   1. Reads the SARF center + radius + tower height the user typed above.
 *   2. Pulls the local telecom ordinance from our Notion master zoning DB
 *      to determine allowable zoning classifications.
 *   3. Fetches parcels in the ring via Realie, filters out residential, scores
 *      by zoning match + acreage + proximity, picks the winner.
 *   4. Skip-traces the owner via Enformion for phone + email.
 *
 * All 15 SITE INFORMATION fields and 5 OWNER INFORMATION fields auto-fill,
 * and the user can still hand-edit any row before exporting.
 */

import { useState, useEffect } from "react";
import { Loader2, Target } from "lucide-react";
import { findBestParcelForTower } from "@/functions/findBestParcelForTower";

// Split a single-line address into street / city / state / zip.
function splitAddress(addr) {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const m = addr.match(/^(.*?),\s*([^,]+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/i);
  if (m) return { street: m[1].trim(), city: m[2].trim(), state: m[3].trim().toUpperCase(), zip: m[4] || "" };
  return { street: addr, city: "", state: "", zip: "" };
}

// Map a SearchResult candidate to the SITE / OWNER row shapes.
function candidateToRows(c) {
  if (!c) return null;
  const addr = splitAddress(c.parcel_address);
  return {
    site: {
      parcel_county: c.parcel_county || "",
      parcel_id: c.parcel_id || "",
      owner_name_on_deed: c.owner_name || "",
      parcel_street_address: addr.street,
      parcel_city: addr.city,
      parcel_state: addr.state,
      parcel_zip: addr.zip,
      parcel_size_acres: c.parcel_size_acres ? `${c.parcel_size_acres} ac MOL` : "",
      latitude: c.latitude != null ? String(c.latitude) : "",
      longitude: c.longitude != null ? String(c.longitude) : "",
      tower_height: "",
      parcel_dimensions: "",
      conforming_size: "",
      taxes_paid_to_date: "",
      // Extra fields used by ZoningBlock
      zoning_classification: c.zoning_classification || "",
    },
    owner: {
      names: c.owner_name || "",
      contact_person: "",
      mailing_address: c.owner_mailing_address || "",
      email_address: c.email || "",
      phone_number: c.phone || "",
    },
  };
}

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

function SectionHeader({ children, action }) {
  return (
    <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase flex items-center justify-between">
      <span>{children}</span>
      {action}
    </div>
  );
}

const SITE_DEFAULTS = {
  parcel_county: "", parcel_id: "", owner_name_on_deed: "",
  parcel_street_address: "", parcel_city: "", parcel_state: "", parcel_zip: "",
  parcel_size_acres: "", latitude: "", longitude: "", tower_height: "",
  parcel_dimensions: "", conforming_size: "", taxes_paid_to_date: "",
};
const OWNER_DEFAULTS = {
  names: "", contact_person: "", mailing_address: "", email_address: "", phone_number: "",
};

export default function SCIPPage1SiteOwnerBlock({ page1Values, candidate, onChange }) {
  const [site, setSite] = useState(SITE_DEFAULTS);
  const [owner, setOwner] = useState(OWNER_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reasoning, setReasoning] = useState(null);

  // Pre-populate from the candidate the user actually selected — no extra lookup,
  // no overwriting fields the user has manually edited.
  useEffect(() => {
    const rows = candidateToRows(candidate);
    if (!rows) return;
    setSite((prev) => ({ ...prev, ...rows.site }));
    setOwner((prev) => ({ ...prev, ...rows.owner }));
    onChange?.({ site: rows.site, owner: rows.owner });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id]);

  const updateSite = (k, v) => {
    const next = { ...site, [k]: v };
    setSite(next);
    onChange?.({ site: next, owner });
  };
  const updateOwner = (k, v) => {
    const next = { ...owner, [k]: v };
    setOwner(next);
    onChange?.({ site, owner: next });
  };

  async function findParcel() {
    const lat = parseFloat(page1Values?.latitude);
    const lon = parseFloat(page1Values?.longitude);
    const radius = parseFloat(String(page1Values?.search_radius || "1").replace(/[^0-9.]/g, "")) || 1.0;
    const towerHeight = parseFloat(String(page1Values?.sarf_height || "").replace(/[^0-9.]/g, "")) || null;

    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Enter Latitude and Longitude in the Search Ring Information above first.");
      return;
    }

    setLoading(true);
    setError(null);
    setReasoning(null);
    try {
      const res = await findBestParcelForTower({
        lat, lon, radius_miles: radius, tower_height_ft: towerHeight,
      });
      const data = res?.data || res;
      if (data?.error) {
        setError(data.error);
        return;
      }
      setSite(data.site_information || SITE_DEFAULTS);
      setOwner(data.owner_information || OWNER_DEFAULTS);
      setReasoning(data.reasoning || null);
      onChange?.({ site: data.site_information, owner: data.owner_information, targets: data.targets || [] });
    } catch (e) {
      setError(e.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  const findButton = (
    <button
      onClick={findParcel}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
      {loading ? "Finding…" : "Find Best Parcel"}
    </button>
  );

  return (
    <>
      <SectionHeader action={findButton}>Site Information</SectionHeader>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}
      {reasoning && !error && (
        <div className="px-3 py-2 bg-cyan-500/10 border-b border-cyan-500/30 text-[11px] text-cyan-900">
          <span className="font-semibold">{reasoning.jurisdiction}</span> · allowable zones:{" "}
          <span className="font-mono">{reasoning.allowable_zones?.join(", ") || "n/a"}</span> ·{" "}
          {reasoning.non_residential_candidates}/{reasoning.total_parcels_in_ring} non-residential parcels ·{" "}
          chosen zoning: <span className="font-mono">{reasoning.chosen_parcel_zoning}</span>
          <div className="mt-1">
            Source: <span className="font-mono">{reasoning.zoning_source || "zoning screen"}</span> | CUP:{" "}
            <span className="font-mono">
              {reasoning.requires_cup
                ? reasoning.cup_path_available ? "required / path found" : "assumed - verify"
                : "not required"}
            </span> | PE letter:{" "}
            <span className="font-mono">{reasoning.pe_letter_accepted ? "accepted" : "not verified"}</span>
          </div>
        </div>
      )}

      <EditableRow label="Parcel County" value={site.parcel_county} placeholder="e.g. Hillsborough County" onChange={(v) => updateSite("parcel_county", v)} />
      <EditableRow label="Parcel ID Number" value={site.parcel_id} placeholder="APN / Parcel ID" onChange={(v) => updateSite("parcel_id", v)} />
      <EditableRow label="Owner Name (on Deed)" value={site.owner_name_on_deed} placeholder="As recorded on deed" onChange={(v) => updateSite("owner_name_on_deed", v)} />
      <EditableRow label="Parcel Street Address" value={site.parcel_street_address} placeholder="e.g. 7326 E Sligh Ave" onChange={(v) => updateSite("parcel_street_address", v)} />
      <EditableRow label="Parcel City" value={site.parcel_city} placeholder="e.g. Tampa" onChange={(v) => updateSite("parcel_city", v)} />
      <EditableRow label="Parcel State" value={site.parcel_state} placeholder="e.g. FL" onChange={(v) => updateSite("parcel_state", v)} />
      <EditableRow label="Parcel Zip" value={site.parcel_zip} placeholder="e.g. 33602" onChange={(v) => updateSite("parcel_zip", v)} />
      <EditableRow label="Parcel Size (acres, MOL)" value={site.parcel_size_acres} placeholder="e.g. 2.45 ac MOL" onChange={(v) => updateSite("parcel_size_acres", v)} />
      <EditableRow label="Latitude" value={site.latitude} placeholder="27.950600" onChange={(v) => updateSite("latitude", v)} />
      <EditableRow label="Longitude" value={site.longitude} placeholder="-82.457200" onChange={(v) => updateSite("longitude", v)} />
      <EditableRow label="Tower Height" value={site.tower_height} placeholder="e.g. 199 ft AGL" onChange={(v) => updateSite("tower_height", v)} />
      <EditableRow label="Parcel Dimensions (feet)" value={site.parcel_dimensions} placeholder="e.g. 330' x 330'" onChange={(v) => updateSite("parcel_dimensions", v)} />
      <EditableRow label="Conforming Size?" value={site.conforming_size} placeholder="Yes / No / TBD" onChange={(v) => updateSite("conforming_size", v)} />
      <EditableRow label="Taxes Paid-to-Date?" value={site.taxes_paid_to_date} placeholder="Yes / No / TBD" onChange={(v) => updateSite("taxes_paid_to_date", v)} />

      <SectionHeader>Owner Information</SectionHeader>
      <EditableRow label="Name(s)" value={owner.names} placeholder="Owner name(s)" onChange={(v) => updateOwner("names", v)} />
      <EditableRow label="Contact Person" value={owner.contact_person} placeholder="Primary contact" onChange={(v) => updateOwner("contact_person", v)} />
      <EditableRow label="Mailing Address" value={owner.mailing_address} placeholder="Owner mailing address" onChange={(v) => updateOwner("mailing_address", v)} />
      <EditableRow label="E-mail Address" value={owner.email_address} placeholder="owner@example.com" onChange={(v) => updateOwner("email_address", v)} />
      <EditableRow label="Phone Number" value={owner.phone_number} placeholder="(555) 123-4567" onChange={(v) => updateOwner("phone_number", v)} />
    </>
  );
}
