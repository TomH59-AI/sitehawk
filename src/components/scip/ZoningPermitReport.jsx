import { useEffect, useState } from "react";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";
import { Loader2, FileSearch, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SyncToNotionButton from "./SyncToNotionButton";

const SOURCE_COLORS = {
  "Verified":      "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Parcel Data":   "bg-teal-100 text-teal-800 border-teal-200",
  "AI Research":   "bg-violet-100 text-violet-800 border-violet-200",
  "Web Research":  "bg-amber-100 text-amber-800 border-amber-200",
  none:            "bg-slate-100 text-slate-500 border-slate-200",
};

const CONF_DOT = { high: "bg-green-500", medium: "bg-amber-500", low: "bg-red-500" };

function Cell({ row }) {
  if (!row) return <span className="text-slate-400 italic">NEEDS RESEARCH</span>;
  const isMissing = !row.value || row.value === "NEEDS RESEARCH";
  return (
    <div className="flex items-start justify-between gap-2">
      <span className={isMissing ? "text-slate-400 italic" : "text-slate-900"}>
        {row.value || "NEEDS RESEARCH"}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${CONF_DOT[row.confidence] || "bg-slate-300"}`} title={`Confidence: ${row.confidence || "unknown"}`} />
        <Badge variant="outline" className={`text-[10px] font-mono ${SOURCE_COLORS[row.source] || SOURCE_COLORS.none}`}>
          {row.source || "none"}
        </Badge>
      </div>
    </div>
  );
}

const SECTIONS = [
  {
    title: "ZONING OVERVIEW",
    key: "zoning_overview",
    rows: [
      ["Zoning Jurisdiction",            "zoning_jurisdiction"],
      ["Zoning Contact Information",     "zoning_contact_information"],
      ["Zoning Process",                 "zoning_process"],
      ["CUP / Special Exception Path",   "cup_special_exception_path"],
      ["PE Self-Certification",          "pe_self_certification"],
      ["Zoning Fees",                    "zoning_fees"],
      ["Zoning Approval Timeframe",      "zoning_approval_timeframe"],
      ["Property Zoning District",       "property_zoning_district"],
      ["Property Future Land Use",       "property_future_land_use"],
      ["Property Current Usage",         "property_current_usage"],
      ["Meets minimum lot requirements?","meets_min_lot_requirements"],
    ],
  },
  {
    title: "JURISDICTION TOWER SPECIFICS",
    key: "tower_specifics",
    rows: [
      ["LDC Section Reference(s)",       "ldc_section_references"],
      ["Maximum Tower Height",           "maximum_tower_height"],
      ["Stealth Required?",              "stealth_required"],
      ["Required Collocations (#)",      "required_collocations"],
      ["Residential Separation (ft or %)","residential_separation"],
      ["Tower Separation (ft or %)",     "tower_separation"],
      ["Measured from base or center",   "measured_from_base_or_center"],
      ["Fall Zone Requirements",                   "fall_zone_requirements"],
      ["PE Letter — Fall Zone / Setback Relief",   "pe_letter_fall_zone_setback_relief"],
      ["Special Tower Landscaping?",     "special_tower_landscaping"],
    ],
  },
  {
    title: "SITE PLAN OVERVIEW",
    key: "site_plan",
    rows: [
      ["Site Plan Jurisdiction",         "site_plan_jurisdiction"],
      ["Site Plan Contact Information",  "site_plan_contact_info"],
      ["Site Plan Fees",                 "site_plan_fees"],
      ["Timeframe for approval",         "site_plan_timeframe"],
      ["Existing Site Plan to Amend?",   "existing_site_plan_amend"],
      ["Concurrent to Zoning or BP?",    "concurrent_to_zoning_or_bp"],
      ["Submittal deadlines?",           "submittal_deadlines"],
      ["Electronic, hard copy, or both?","electronic_hard_or_both"],
    ],
  },
  {
    title: "BUILDING PERMIT INFORMATION",
    key: "building_permit",
    rows: [
      ["Building Permit Jurisdiction",   "building_permit_jurisdiction"],
      ["Building Department Contact Info","building_dept_contact_info"],
      ["Does GC have to submit?",        "gc_must_submit"],
      ["Building Permit Fees",           "building_permit_fees"],
      ["Building Permit Timeframe",      "building_permit_timeframe"],
      ["Bond Required?",                 "bond_required"],
      ["E911 Address assigned?",         "e911_address_assigned"],
    ],
  },
];

export default function ZoningPermitReport({ lat, lon, candidate, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (lat == null || lon == null) return;
    setLoading(true);
    setError(null);
    generateZoningPermitReport({ lat, lon, candidate })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setLoading(false);
        onComplete?.(res.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || "Report generation failed");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [lat, lon, candidate?.parcel_id]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <div className="font-heading font-semibold text-foreground">Pulling zoning + permit data from live planning department sources…</div>
        <div className="text-xs text-muted-foreground">This usually takes 30–60 seconds.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-red-900">Report failed</div>
          <div className="text-sm text-red-800">{error}</div>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const report = data.report || {};
  const sources = data.sources_used || {};

  return (
    <div className="space-y-4">
      {/* Sources used header */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <FileSearch className="w-5 h-5 text-primary" />
        <div className="font-heading font-semibold text-foreground">Zoning & Permit Report — {data.jurisdiction_resolved}</div>
        <div className="flex flex-wrap gap-1.5 ml-auto items-center">
          {sources.telecom_ordinance && <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Verified Data</Badge>}
          {sources.realie && <Badge className="bg-teal-100 text-teal-800 border-teal-200"><CheckCircle2 className="w-3 h-3 mr-1" />Parcel Data</Badge>}
          <Badge className="bg-violet-100 text-violet-800 border-violet-200"><CheckCircle2 className="w-3 h-3 mr-1" />AI Research</Badge>
          <SyncToNotionButton reportData={data} candidate={candidate} />
        </div>
      </div>

      {/* The 4 tables */}
      {SECTIONS.map((section) => (
        <div key={section.key} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-slate-700 text-white px-4 py-2 font-heading font-semibold text-sm tracking-wide">
            {section.title}
          </div>
          <table className="w-full text-sm">
            <tbody>
              {section.rows.map(([label, key], i) => (
                <tr key={key} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-4 py-2.5 font-semibold text-slate-700 w-1/3 border-r border-slate-200">{label}</td>
                  <td className="px-4 py-2.5">
                    <Cell row={report[section.key]?.[key]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}