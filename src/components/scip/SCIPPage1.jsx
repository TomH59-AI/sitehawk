/**
 * SCIPPage1 — Page 1 of the official SCIP template.
 *
 * Mirrors the structure of the SCIP Pg1 Excel template exactly:
 *   • SITE ACQUISITION  (rows 3–6: Agent Name, Agent Phone, Agent E-mail, Submittal Date)
 *   • SEARCH RING INFORMATION  (rows 8–14: Site Name, Latitude, Longitude, Search Radius,
 *     SARF Height, Tower Type, Compound Size)
 *
 * Rows 3–6 and 8–14 are editable placeholders the user fills out.
 * All other rows (section headers) are preserved as-is to keep the template intact.
 */

import { useState } from "react";
import SCIPPage1SARFMap from "./SCIPPage1SARFMap";
import SCIPPage1SiteOwnerBlock from "./SCIPPage1SiteOwnerBlock";
import SCIPPage1ExistingConditions from "./SCIPPage1ExistingConditions";
import SCIPPage1SiteNotes from "./SCIPPage1SiteNotes";
import SCIPPage1ZoningBlock from "./SCIPPage1ZoningBlock";

function EditableRow({ label, value, placeholder, onChange }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm text-foreground bg-muted/40 border-r border-border">
        {label}
      </div>
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

function SectionHeader({ children }) {
  return (
    <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
      {children}
    </div>
  );
}

export default function SCIPPage1({ initialValues = {}, onChange }) {
  const [values, setValues] = useState({
    // SITE ACQUISITION (rows 3–6)
    agent_name: "",
    agent_phone: "",
    agent_email: "",
    submittal_date: "",
    // SEARCH RING INFORMATION (rows 8–14)
    site_name: "",
    latitude: "",
    longitude: "",
    search_radius: "",
    sarf_height: "",
    tower_type: "",
    compound_size: "",
    ...initialValues,
  });

  const update = (key, value) => {
    const next = { ...values, [key]: value };
    setValues(next);
    onChange?.(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden max-w-4xl mx-auto">
      {/* Banner */}
      <div className="px-4 py-3 bg-gradient-to-r from-[#0C1B2E] to-[#13294a] text-white">
        <div className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase">Page 1</div>
        <div className="font-heading font-bold text-lg">SITE CANDIDATE INFORMATION PACKAGE</div>
      </div>

      {/* SITE ACQUISITION */}
      <SectionHeader>Site Acquisition</SectionHeader>
      <EditableRow
        label="Agent Name"
        value={values.agent_name}
        placeholder="Enter agent name"
        onChange={(v) => update("agent_name", v)}
      />
      <EditableRow
        label="Agent Phone"
        value={values.agent_phone}
        placeholder="(555) 123-4567"
        onChange={(v) => update("agent_phone", v)}
      />
      <EditableRow
        label="Agent E-mail"
        value={values.agent_email}
        placeholder="agent@example.com"
        onChange={(v) => update("agent_email", v)}
      />
      <EditableRow
        label="Submittal Date"
        value={values.submittal_date}
        placeholder="MM/DD/YYYY"
        onChange={(v) => update("submittal_date", v)}
      />

      {/* SEARCH RING INFORMATION */}
      <SectionHeader>Search Ring Information</SectionHeader>
      <EditableRow
        label="Site Name"
        value={values.site_name}
        placeholder="e.g. FL-TPA-0427"
        onChange={(v) => update("site_name", v)}
      />
      <EditableRow
        label="Latitude"
        value={values.latitude}
        placeholder="27.950600"
        onChange={(v) => update("latitude", v)}
      />
      <EditableRow
        label="Longitude"
        value={values.longitude}
        placeholder="-82.457200"
        onChange={(v) => update("longitude", v)}
      />
      <EditableRow
        label="Search Radius"
        value={values.search_radius}
        placeholder="e.g. 0.5 mi / 1.0 mi"
        onChange={(v) => update("search_radius", v)}
      />
      <EditableRow
        label="SARF Height"
        value={values.sarf_height}
        placeholder="e.g. 199 ft AGL"
        onChange={(v) => update("sarf_height", v)}
      />
      <EditableRow
        label="Tower Type"
        value={values.tower_type}
        placeholder="Monopole / Lattice / Guyed / Stealth"
        onChange={(v) => update("tower_type", v)}
      />
      <EditableRow
        label="Compound Size (S.F. & dimensions)"
        value={values.compound_size}
        placeholder="e.g. 10,000 SF / 100' x 100'"
        onChange={(v) => update("compound_size", v)}
      />

      {/* SARF — auto-generated search ring map from lat/lon/radius above */}
      <SCIPPage1SARFMap values={values} />

      {/* SITE INFORMATION + OWNER INFORMATION — auto-found via Notion zoning + Realie + Enformion */}
      <SCIPPage1SiteOwnerBlock page1Values={values} onChange={(siteOwner) => {
        setValues((prev) => ({ ...prev, _siteOwner: siteOwner }));
        onChange?.({ ...values, _siteOwner: siteOwner });
      }} />

      {/* EXISTING CONDITIONS — auto-filled from FEMA / NWI / HIFLD / FCC / OSM */}
      <SCIPPage1ExistingConditions page1Values={values} siteOwner={values._siteOwner} />

      {/* SITE NOTES — free-form site development concerns, with LLM auto-generate */}
      <SCIPPage1SiteNotes page1Values={values} siteOwner={values._siteOwner} />

      {/* ZONING / TOWER SPECIFICS / SITE PLAN / BUILDING PERMIT — pulled from Notion ordinance DB */}
      <SCIPPage1ZoningBlock page1Values={values} siteOwner={values._siteOwner} />
    </div>
  );
}