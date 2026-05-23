/**
 * SCIPPage1ZoningBlock — Page 1 ZONING / TOWER SPECIFICS / SITE PLAN /
 * BUILDING PERMIT blocks. All driven by `notionZoningLookup` which:
 *   1. Reverse-geocodes lat/lon to a jurisdiction.
 *   2. Finds the jurisdiction's section in our Notion master zoning DB.
 *   3. Uses Gemini Pro (with live web context) to extract every ordinance
 *      field — fees, timeframes, code section, height limits, fall zones,
 *      site plan + building permit process — into a structured object.
 *
 * One "Pull from Notion" button populates all 32 rows. The 3 NOTES rows
 * (zoning_notes / site_plan_notes / bp_notes) are free-form textareas left
 * blank for the user to elaborate.
 */

import { useState, useEffect, useRef } from "react";
import { Loader2, FileSearch } from "lucide-react";
import { notionZoningLookup } from "@/functions/notionZoningLookup";

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

function NotesRow({ label, value, placeholder, onChange }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm text-foreground bg-muted/40 border-r border-border whitespace-pre-line">
        {label}
      </div>
      <textarea
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="px-3 py-2 text-sm bg-card focus:outline-none focus:bg-primary/5 resize-y min-h-[110px]"
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

const DEFAULTS = {
  // ZONING OVERVIEW
  zoning_jurisdiction: "",
  zoning_contact: "",
  zoning_process: "",
  zoning_fees: "",
  zoning_approval_timeframe: "",
  property_zoning_district: "",
  property_future_land_use: "",
  property_current_usage: "",
  meets_min_lot: "",
  // JURISDICTION TOWER SPECIFICS
  ldc_section: "",
  max_tower_height: "",
  stealth_required: "",
  required_collocations: "",
  residential_separation: "",
  tower_separation: "",
  measured_from: "",
  fall_zone: "",
  landscaping: "",
  zoning_notes: "",
  // SITE PLAN
  site_plan_jurisdiction: "",
  site_plan_contact: "",
  site_plan_fees: "",
  site_plan_timeframe: "",
  existing_site_plan_amend: "",
  site_plan_concurrent: "",
  site_plan_deadlines: "",
  site_plan_submittal_format: "",
  site_plan_notes: "",
  // BUILDING PERMIT
  bp_jurisdiction: "",
  bp_contact: "",
  bp_gc_submits: "",
  bp_fees: "",
  bp_timeframe: "",
  bp_bond_required: "",
  e911_address: "",
  bp_notes: "",
};

export default function SCIPPage1ZoningBlock({ page1Values, siteOwner }) {
  const [values, setValues] = useState(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const autoPulledRef = useRef(false);

  const update = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  // Auto-pull from Notion once we have valid coords. The user can still hit
  // the "Pull from Notion" button to refresh.
  useEffect(() => {
    if (autoPulledRef.current) return;
    const lat = parseFloat(siteOwner?.site?.latitude || page1Values?.latitude);
    const lon = parseFloat(siteOwner?.site?.longitude || page1Values?.longitude);
    if (isFinite(lat) && isFinite(lon)) {
      autoPulledRef.current = true;
      pullFromNotion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteOwner?.site?.latitude, siteOwner?.site?.longitude, page1Values?.latitude, page1Values?.longitude]);

  async function pullFromNotion() {
    const lat = parseFloat(siteOwner?.site?.latitude || page1Values?.latitude);
    const lon = parseFloat(siteOwner?.site?.longitude || page1Values?.longitude);
    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Enter Latitude / Longitude (or run Find Best Parcel) first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await notionZoningLookup({ lat, lon });
      const data = res?.data || res;
      const z = data?.zoning || {};
      if (!z || Object.keys(z).length === 0) {
        setError(data?.notion_error || "No zoning data returned from Notion lookup.");
        return;
      }

      setValues((prev) => ({
        ...prev,
        // ZONING OVERVIEW
        zoning_jurisdiction: z.jurisdiction || "",
        zoning_contact: z.zoning_contact || "",
        zoning_process: z.zoning_process || "",
        zoning_fees: z.zoning_fees || "",
        zoning_approval_timeframe: z.zoning_approval_timeframe || "",
        property_zoning_district: siteOwner?.site?.zoning_classification || prev.property_zoning_district,
        property_future_land_use: z.property_future_land_use || "",
        property_current_usage: siteOwner?.site?.parcel_size_acres ? "See site information" : "",
        meets_min_lot: siteOwner?.site?.conforming_size || "",
        // TOWER SPECIFICS
        ldc_section: z.code_section || "",
        max_tower_height: z.max_tower_height || "",
        stealth_required: z.stealth_required || "",
        required_collocations: z.collocation_required || "",
        residential_separation: z.residential_separation || "",
        tower_separation: z.tower_separation || "",
        measured_from: z.measured_from || "",
        fall_zone: z.fall_zone || "",
        landscaping: z.landscaping || "",
        // SITE PLAN
        site_plan_jurisdiction: z.site_plan_jurisdiction || "",
        site_plan_contact: z.site_plan_contact || "",
        site_plan_fees: z.site_plan_fees || "",
        site_plan_timeframe: z.site_plan_timeframe || "",
        site_plan_concurrent: z.site_plan_concurrent || "",
        site_plan_submittal_format: z.site_plan_submittal_format || "",
        // BUILDING PERMIT
        bp_jurisdiction: z.building_permit_jurisdiction || "",
        bp_contact: z.building_permit_contact || "",
        bp_gc_submits: z.building_permit_gc_submits || "",
        bp_fees: z.building_permit_fees || "",
        bp_timeframe: z.building_permit_timeframe || "",
        bp_bond_required: z.building_permit_bond_required || "",
        e911_address: z.e911_address_required || "",
      }));
    } catch (e) {
      setError(e.message || "Notion lookup failed");
    } finally {
      setLoading(false);
    }
  }

  const pullButton = (
    <button
      onClick={pullFromNotion}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSearch className="w-3 h-3" />}
      {loading ? "Pulling…" : "Pull from Notion"}
    </button>
  );

  return (
    <>
      {/* ZONING OVERVIEW */}
      <SectionHeader action={pullButton}>Zoning Overview</SectionHeader>
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}
      <EditableRow label="Zoning Jurisdiction" value={values.zoning_jurisdiction} placeholder="e.g. City of Tampa, FL" onChange={(v) => update("zoning_jurisdiction", v)} />
      <EditableRow label="Zoning Contact Information" value={values.zoning_contact} placeholder="Dept name, address, phone, email" onChange={(v) => update("zoning_contact", v)} />
      <EditableRow label="Zoning Process" value={values.zoning_process} placeholder="Admin review / Special Use / Public Hearing" onChange={(v) => update("zoning_process", v)} />
      <EditableRow label="Zoning Fees" value={values.zoning_fees} placeholder="e.g. $1,500 base + $250/acre" onChange={(v) => update("zoning_fees", v)} />
      <EditableRow label="Zoning Approval Timeframe" value={values.zoning_approval_timeframe} placeholder="e.g. 60–90 days from complete submittal" onChange={(v) => update("zoning_approval_timeframe", v)} />
      <EditableRow label="Property Zoning District" value={values.property_zoning_district} placeholder="e.g. CG, M-1, A-1" onChange={(v) => update("property_zoning_district", v)} />
      <EditableRow label="Property Future Land Use" value={values.property_future_land_use} placeholder="FLU designation" onChange={(v) => update("property_future_land_use", v)} />
      <EditableRow label="Property Current Usage" value={values.property_current_usage} placeholder="e.g. Vacant, commercial, agricultural" onChange={(v) => update("property_current_usage", v)} />
      <EditableRow label="Meets minimum lot requirements?" value={values.meets_min_lot} placeholder="Yes / No / TBD" onChange={(v) => update("meets_min_lot", v)} />

      {/* TOWER SPECIFICS */}
      <SectionHeader>Jurisdiction Tower Specifics</SectionHeader>
      <EditableRow label="LDC Section Reference(s)" value={values.ldc_section} placeholder="e.g. Sec. 27-282.6" onChange={(v) => update("ldc_section", v)} />
      <EditableRow label="Maximum Tower Height" value={values.max_tower_height} placeholder="e.g. 199 ft AGL" onChange={(v) => update("max_tower_height", v)} />
      <EditableRow label="Stealth Required?" value={values.stealth_required} placeholder="Yes / No / Conditional" onChange={(v) => update("stealth_required", v)} />
      <EditableRow label="Required Collocations (#)" value={values.required_collocations} placeholder="e.g. 3 carriers" onChange={(v) => update("required_collocations", v)} />
      <EditableRow label="Residential Separation (ft or %)" value={values.residential_separation} placeholder="e.g. 300 ft or 100% of height" onChange={(v) => update("residential_separation", v)} />
      <EditableRow label="Tower Separation (ft or %)" value={values.tower_separation} placeholder="e.g. ½ mi or 2,640 ft" onChange={(v) => update("tower_separation", v)} />
      <EditableRow label="Measured from base or center" value={values.measured_from} placeholder="Base / Center" onChange={(v) => update("measured_from", v)} />
      <EditableRow label="Fall Zone Requirements" value={values.fall_zone} placeholder="e.g. 1:1, 110%, 50% of height" onChange={(v) => update("fall_zone", v)} />
      <EditableRow label="Special Tower Landscaping?" value={values.landscaping} placeholder="Buffer / screening requirements" onChange={(v) => update("landscaping", v)} />

      {/* ZONING NOTES */}
      <SectionHeader>Zoning Notes</SectionHeader>
      <NotesRow
        label={"Please elaborate on any zoning\nconcerns, fees, etc."}
        value={values.zoning_notes}
        placeholder="e.g. Tower must be processed as Special Use Permit; expect 2 public hearings. Fee waiver possible if collocated."
        onChange={(v) => update("zoning_notes", v)}
      />

      {/* SITE PLAN */}
      <SectionHeader>Site Plan Overview</SectionHeader>
      <EditableRow label="Site Plan Jurisdiction" value={values.site_plan_jurisdiction} placeholder="e.g. Hillsborough County Planning" onChange={(v) => update("site_plan_jurisdiction", v)} />
      <EditableRow label="Site Plan Contact Information" value={values.site_plan_contact} placeholder="Dept name, address, phone, email" onChange={(v) => update("site_plan_contact", v)} />
      <EditableRow label="Site Plan Fees" value={values.site_plan_fees} placeholder="e.g. $2,200 minor site plan" onChange={(v) => update("site_plan_fees", v)} />
      <EditableRow label="Timeframe for approval" value={values.site_plan_timeframe} placeholder="e.g. 45–60 days" onChange={(v) => update("site_plan_timeframe", v)} />
      <EditableRow label="Existing Site Plan to Amend?" value={values.existing_site_plan_amend} placeholder="Yes / No / TBD" onChange={(v) => update("existing_site_plan_amend", v)} />
      <EditableRow label="Concurrent to Zoning or BP?" value={values.site_plan_concurrent} placeholder="Yes — concurrent with zoning" onChange={(v) => update("site_plan_concurrent", v)} />
      <EditableRow label="Submittal deadlines?" value={values.site_plan_deadlines} placeholder="e.g. 1st & 15th of month" onChange={(v) => update("site_plan_deadlines", v)} />
      <EditableRow label="Electronic, hard copy, or both?" value={values.site_plan_submittal_format} placeholder="Electronic / Hard copy / Both" onChange={(v) => update("site_plan_submittal_format", v)} />

      {/* SITE PLAN NOTES */}
      <SectionHeader>Site Plan Notes</SectionHeader>
      <NotesRow
        label={"Please elaborate on any site plan\nconcerns, fees, etc."}
        value={values.site_plan_notes}
        placeholder="e.g. Site plan requires civil engineer sealed drawings; pre-app meeting recommended."
        onChange={(v) => update("site_plan_notes", v)}
      />

      {/* BUILDING PERMIT */}
      <SectionHeader>Building Permit Information</SectionHeader>
      <EditableRow label="Building Permit Jurisdiction" value={values.bp_jurisdiction} placeholder="e.g. City of Tampa Construction Services" onChange={(v) => update("bp_jurisdiction", v)} />
      <EditableRow label="Building Department Contact Info" value={values.bp_contact} placeholder="Dept name, address, phone, email" onChange={(v) => update("bp_contact", v)} />
      <EditableRow label="Does GC have to submit?" value={values.bp_gc_submits} placeholder="Yes / No" onChange={(v) => update("bp_gc_submits", v)} />
      <EditableRow label="Building Permit Fees" value={values.bp_fees} placeholder="e.g. $0.50/SF + $300 plan review" onChange={(v) => update("bp_fees", v)} />
      <EditableRow label="Building Permit Timeframe" value={values.bp_timeframe} placeholder="e.g. 30 days from complete submittal" onChange={(v) => update("bp_timeframe", v)} />
      <EditableRow label="Bond Required?" value={values.bp_bond_required} placeholder="Yes / No / amount" onChange={(v) => update("bp_bond_required", v)} />
      <EditableRow label="E911 Address assigned?" value={values.e911_address} placeholder="Yes / No / process" onChange={(v) => update("e911_address", v)} />

      {/* BUILDING PERMIT NOTES */}
      <SectionHeader>Building Permit Notes</SectionHeader>
      <NotesRow
        label={"Please elaborate on any BP\nconcerns, fees, etc."}
        value={values.bp_notes}
        placeholder="e.g. Florida Product Approval required for all wind-loaded components; threshold inspector required for towers > 50 ft."
        onChange={(v) => update("bp_notes", v)}
      />
    </>
  );
}