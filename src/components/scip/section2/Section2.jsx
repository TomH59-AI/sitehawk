/**
 * Section2 — Zoning Overview + Jurisdiction Tower Specifics + Building Permit Info.
 *
 * Strict 1:1 with Section2.xlsx. One Generate button per sub-block. All three
 * pull from the same backend call (notionZoningLookup → Notion Master Zoning
 * + LLM ordinance parse + Oxylabs fallback) for accuracy. Applies to TARGET
 * ONE — the best Hawk Vision selection.
 *
 * Hierarchy:
 *   2.1 Zoning Overview          (Notion + Oxylabs · GENERATE ZONING)
 *   2.2 Jurisdiction Tower Specs (Notion + Oxylabs · GENERATE SPECS)
 *   2.3 Building Permit Info     (Notion + Oxylabs · GENERATE PERMITS)
 */

import { useState } from "react";
import Section1Shell from "../section1/Section1Shell";
import { Landmark, Building2, FileSignature } from "lucide-react";
import { notionZoningLookup } from "@/functions/notionZoningLookup";

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
  // Zoning Overview
  zoning_jurisdiction: "",
  zoning_contact_name: "",
  zoning_department_address: "",
  zoning_department_phone: "",
  zoning_process: "",
  zoning_fees: "",
  zoning_approval_timeframe: "",
  property_zoning_classification: "",
  property_current_usage: "",
  // Tower Specifics
  ldc_section_reference: "",
  max_tower_height: "",
  tower_property_setbacks: "",
  stealth_required: "",
  required_collocations: "",
  residential_separation: "",
  tower_separation: "",
  measured_from: "",
  fall_zone: "",
  landscaping: "",
  // Building Permit
  building_permit_jurisdiction: "",
  building_dept_contact_name: "",
  building_dept_phone: "",
  building_dept_address: "",
  gc_submits: "",
  building_permit_fees: "",
  building_permit_timeframe: "",
  bond_required: "",
  pe_letter_accepted: "",
};

// Split a contact blob like "Planning Dept, 123 Main St, Tampa FL 33602, (813) 555-1212"
// into (name, address, phone).
function splitContact(blob) {
  if (!blob) return { name: "", address: "", phone: "" };
  const phoneMatch = String(blob).match(/(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/);
  const phone = phoneMatch?.[1] || "";
  const withoutPhone = String(blob).replace(phone, "").replace(/[,;]\s*$/, "").trim();
  const parts = withoutPhone.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { name: "", address: "", phone };
  const name = parts.shift() || "";
  const address = parts.join(", ");
  return { name, address, phone };
}

export default function Section2({ targetOne }) {
  const [values, setValues] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null);

  const update = (k, v) => setValues((p) => ({ ...p, [k]: v }));

  async function runLookup() {
    const lat = parseFloat(targetOne?.latitude);
    const lon = parseFloat(targetOne?.longitude);
    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Run Hawk Vision in Section 1 first — Section 2 uses Target One's coordinates.");
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await notionZoningLookup({ lat, lon });
      const data = res?.data || res;
      const z = data?.zoning;
      if (!z) {
        setError(data?.notion_error || data?.message || "No Notion match for this jurisdiction.");
        return null;
      }
      setSource(z.source || "Notion + LLM");
      return { zoning: z, geo: data.geocode || {} };
    } catch (e) {
      setError(e.message || "Notion lookup failed");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function fillZoningOverview({ zoning, geo }) {
    // Prefer the explicit broken-out fields the LLM now returns; fall back to
    // splitContact() only if the LLM rolled the contact info into one blob.
    const fallback = splitContact(zoning.zoning_contact);
    setValues((p) => ({
      ...p,
      zoning_jurisdiction: zoning.jurisdiction || [geo.city, geo.county, geo.state].filter(Boolean).join(", "),
      zoning_contact_name: zoning.zoning_contact || fallback.name,
      zoning_department_address: zoning.zoning_department_address || fallback.address,
      zoning_department_phone: zoning.zoning_department_phone || fallback.phone,
      zoning_process: zoning.zoning_process || "",
      zoning_fees: zoning.zoning_fees || "",
      zoning_approval_timeframe: zoning.zoning_approval_timeframe || "",
      property_zoning_classification: targetOne?.zoning || zoning.code_section || "",
      property_current_usage: zoning.property_current_usage || targetOne?.land_use || "",
    }));
  }

  function fillTowerSpecs({ zoning }) {
    setValues((p) => ({
      ...p,
      ldc_section_reference: zoning.code_section || "",
      max_tower_height: zoning.max_tower_height || "",
      tower_property_setbacks: zoning.residential_separation || "",
      stealth_required: zoning.stealth_required || "",
      required_collocations: zoning.collocation_required || "",
      residential_separation: zoning.residential_separation || "",
      tower_separation: zoning.tower_separation || "",
      measured_from: zoning.measured_from || "",
      fall_zone: zoning.fall_zone || "",
      landscaping: zoning.landscaping || "",
    }));
  }

  function fillBuildingPermit({ zoning }) {
    const fallback = splitContact(zoning.building_permit_contact);
    setValues((p) => ({
      ...p,
      building_permit_jurisdiction: zoning.building_permit_jurisdiction || zoning.jurisdiction || "",
      building_dept_contact_name: zoning.building_permit_contact || fallback.name,
      building_dept_phone: zoning.building_permit_department_phone || fallback.phone,
      building_dept_address: zoning.building_permit_department_address || fallback.address,
      gc_submits: zoning.building_permit_gc_submits || "",
      building_permit_fees: zoning.building_permit_fees || "",
      building_permit_timeframe: zoning.building_permit_timeframe || "",
      bond_required: zoning.building_permit_bond_required || "",
      pe_letter_accepted: zoning.building_permit_pe_letter_accepted || zoning.e911_address_required || "",
    }));
  }

  async function handleGenerateZoning() {
    const result = await runLookup();
    if (result) fillZoningOverview(result);
  }
  async function handleGenerateSpecs() {
    const result = await runLookup();
    if (result) fillTowerSpecs(result);
  }
  async function handleGeneratePermits() {
    const result = await runLookup();
    if (result) fillBuildingPermit(result);
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Section banner */}
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-transparent to-transparent border border-amber-500/30">
        <div className="text-[10px] font-mono text-amber-700 tracking-[0.3em] mb-0.5">SCIP · SECTION TWO</div>
        <div className="font-heading font-bold text-lg text-foreground">
          Zoning, Tower Specifics & Building Permits — Target One
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Pulls from the Notion Master Zoning DB and falls back to Oxylabs for live Municode / eCode360 scraping.
          Accuracy &gt; speed — these calls can take 10–30s. Every row gets filled.
        </div>
        {error && (
          <div className="mt-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-700">
            {error}
          </div>
        )}
        {source && !error && (
          <div className="mt-2 text-[10px] font-mono text-emerald-700 tracking-wider">
            ✓ SOURCE · {source}
          </div>
        )}
      </div>

      {/* 2.1 Zoning Overview */}
      <Section1Shell
        step={6}
        title="Zoning Overview"
        subtitle="Notion Master Zoning · Oxylabs fallback"
        icon={Landmark}
        generateLabel="GENERATE ZONING"
        onGenerate={handleGenerateZoning}
        loading={loading}
      >
        <Row label="Zoning Jurisdiction" value={values.zoning_jurisdiction} onChange={(v) => update("zoning_jurisdiction", v)} />
        <Row label="Zoning Contact Information (Name)" value={values.zoning_contact_name} onChange={(v) => update("zoning_contact_name", v)} />
        <Row label="Zoning Department Address" value={values.zoning_department_address} onChange={(v) => update("zoning_department_address", v)} />
        <Row label="Zoning Department Phone Number" value={values.zoning_department_phone} onChange={(v) => update("zoning_department_phone", v)} />
        <Row label="Zoning Process" value={values.zoning_process} onChange={(v) => update("zoning_process", v)} placeholder="Admin Review / SUP / Public Hearing" />
        <Row label="Zoning Fees" value={values.zoning_fees} onChange={(v) => update("zoning_fees", v)} />
        <Row label="Zoning Approval Timeframe" value={values.zoning_approval_timeframe} onChange={(v) => update("zoning_approval_timeframe", v)} />
        <Row label="Property Zoning Classification" value={values.property_zoning_classification} onChange={(v) => update("property_zoning_classification", v)} />
        <Row label="Property Current Usage" value={values.property_current_usage} onChange={(v) => update("property_current_usage", v)} />
      </Section1Shell>

      {/* 2.2 Jurisdiction Tower Specifics */}
      <Section1Shell
        step={7}
        title="Jurisdiction Tower Specifics"
        subtitle="LDC code section · setbacks · separations · fall zone"
        icon={Building2}
        generateLabel="GENERATE SPECS"
        onGenerate={handleGenerateSpecs}
        loading={loading}
      >
        <Row label="LDC Section Reference(s)" value={values.ldc_section_reference} onChange={(v) => update("ldc_section_reference", v)} />
        <Row label="Maximum Tower Height" value={values.max_tower_height} onChange={(v) => update("max_tower_height", v)} placeholder="e.g. 199 ft AGL" />
        <Row label="Tower Property Setbacks" value={values.tower_property_setbacks} onChange={(v) => update("tower_property_setbacks", v)} />
        <Row label="Stealth Required?" value={values.stealth_required} onChange={(v) => update("stealth_required", v)} placeholder="Yes / No" />
        <Row label="Required Collocations (#)" value={values.required_collocations} onChange={(v) => update("required_collocations", v)} />
        <Row label="Residential Separation (ft or %)" value={values.residential_separation} onChange={(v) => update("residential_separation", v)} />
        <Row label="Tower Separation (ft or %)" value={values.tower_separation} onChange={(v) => update("tower_separation", v)} />
        <Row label="Measured from base or center" value={values.measured_from} onChange={(v) => update("measured_from", v)} />
        <Row label="Fall Zone Requirements" value={values.fall_zone} onChange={(v) => update("fall_zone", v)} />
        <Row label="Special Tower Landscaping?" value={values.landscaping} onChange={(v) => update("landscaping", v)} />
      </Section1Shell>

      {/* 2.3 Building Permit Information */}
      <Section1Shell
        step={8}
        title="Building Permit Information"
        subtitle="Notion + Oxylabs · jurisdiction contact + fees + timeframe"
        icon={FileSignature}
        generateLabel="GENERATE PERMITS"
        onGenerate={handleGeneratePermits}
        loading={loading}
      >
        <Row label="Building Permit Jurisdiction?" value={values.building_permit_jurisdiction} onChange={(v) => update("building_permit_jurisdiction", v)} />
        <Row label="Building Department Contact Name" value={values.building_dept_contact_name} onChange={(v) => update("building_dept_contact_name", v)} />
        <Row label="Building Department Phone #" value={values.building_dept_phone} onChange={(v) => update("building_dept_phone", v)} />
        <Row label="Building Department Address" value={values.building_dept_address} onChange={(v) => update("building_dept_address", v)} />
        <Row label="Does GC have to submit?" value={values.gc_submits} onChange={(v) => update("gc_submits", v)} placeholder="Yes / No" />
        <Row label="Building Permit Fees?" value={values.building_permit_fees} onChange={(v) => update("building_permit_fees", v)} />
        <Row label="Building Permit Timeframe?" value={values.building_permit_timeframe} onChange={(v) => update("building_permit_timeframe", v)} />
        <Row label="Bond Required?" value={values.bond_required} onChange={(v) => update("bond_required", v)} />
        <Row label="Will Jurisdiction accept PE Letter" value={values.pe_letter_accepted} onChange={(v) => update("pe_letter_accepted", v)} />
      </Section1Shell>
    </div>
  );
}