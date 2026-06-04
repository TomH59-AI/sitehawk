/**
 * SiteAcquisitionBlock — Section 1.1 (manual user inputs).
 *
 * Mirrors the SectionOne.xlsx template exactly:
 *   Agent Name, Tower Height (ft AGL), Search Radius, Compound Dimensions,
 *   Latitude, Longitude
 *
 * No generate button — this is the user's hand-entered seed data for everything
 * downstream in Section One.
 */

import Section1Shell from "./Section1Shell";
import { UserCog } from "lucide-react";

const SARF_RADIUS_OPTIONS = [
  { value: "0.25", label: "0.25 miles" },
  { value: "0.50", label: "0.50 miles" },
  { value: "1.0", label: "1.0 mile" },
];

function Row({ label, value, placeholder, onChange }) {
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

function RadiusRow({ value, onChange }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm text-foreground bg-muted/40 border-r border-border">
        Search Radius
      </div>
      <select
        value={value || "1.0"}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-sm bg-card focus:outline-none focus:bg-primary/5"
      >
        {SARF_RADIUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function SiteAcquisitionBlock({ values, onChange }) {
  const update = (k, v) => onChange({ ...values, [k]: v });

  return (
    <Section1Shell step={1} title="Site Acquisition User" subtitle="Manual entry · agent + waypoint seed" icon={UserCog}>
      <Row label="Agent Name" value={values.agent_name} placeholder="Enter agent name" onChange={(v) => update("agent_name", v)} />
      <Row label="Tower Height (ft AGL)" value={values.tower_height_ft} placeholder="e.g. 199" onChange={(v) => update("tower_height_ft", v)} />
      <RadiusRow value={values.search_radius} onChange={(v) => update("search_radius", v)} />
      <Row label="Compound Dimensions" value={values.compound_dimensions} placeholder="e.g. 100' x 100' (10,000 SF)" onChange={(v) => update("compound_dimensions", v)} />
      <Row label="Latitude" value={values.latitude} placeholder="27.950600" onChange={(v) => update("latitude", v)} />
      <Row label="Longitude" value={values.longitude} placeholder="-82.457200" onChange={(v) => update("longitude", v)} />
    </Section1Shell>
  );
}
