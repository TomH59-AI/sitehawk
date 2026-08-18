/**
 * HawkZoningOverview — blank zoning template that mirrors the
 * "ZoningSpecsBP" spreadsheet 1:1. Has its own "Generate with Hawk
 * Intelligence" button that runs independently from the SARF map
 * generation.
 */

import { useState, useEffect, useCallback } from "react";
import { ClipboardList, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";

const SECTIONS = [
  {
    title: "ZONING OVERVIEW",
    rows: [
      "Zoning Jurisdiction",
      "Zoning Contact Information",
      "Zoning Process",
      "Zoning Fees",
      "Zoning Approval Timeframe",
      "Property Zoning District",
      "Property Future Land Use",
      "Property Current Usage",
      "Meets minimum lot requirements?",
    ],
  },
  {
    title: "TOWER SPECIFICS",
    rows: [
      "LDC Section Reference(s)",
      "Maximum Tower Height",
      "Stealth Required?",
      "Required Collocations (#)",
      "Residential Separation (ft or %)",
      "Tower Separation (ft or %)",
      "Measured from base or center",
      "Fall Zone Requirements",
      "Special Tower Landscaping?",
    ],
  },
  {
    title: "SITE PLAN OVERVIEW",
    rows: [
      "Site Plan Jurisdiction",
      "Site Plan Contact Information",
      "Site Plan Fees",
      "Timeframe for approval",
      "Existing Site Plan to Amend?",
      "Concurrent to Zoning or BP?",
      "Submittal deadlines?",
      "Electronic, hard copy, or both?",
    ],
  },
  {
    title: "BUILDING PERMIT INFORMATION",
    rows: [
      "Building Permit Jurisdiction",
      "Building Department Contact Info",
      "Does GC have to submit?",
      "Building Permit Fees",
      "Building Permit Timeframe",
      "Bond Required?",
      "E911 Address assigned?",
    ],
  },
];

// Map rich generateZoningPermitReport payload → template row labels.
// Every cell reads report.<section>.<key>?.value. Anything missing/empty
// is written as the literal sentinel 'NEEDS_HUMAN_REVIEW' — no inference.
function mapZoningToTemplate(report) {
  const NHR = "NEEDS_HUMAN_REVIEW";
  const pick = (section, key) => {
    const v = report?.[section]?.[key]?.value;
    if (v === null || v === undefined || v === "") return NHR;
    return String(v);
  };
  if (!report) {
    return {
      "ZONING OVERVIEW": {
        "Zoning Jurisdiction": NHR,
        "Zoning Contact Information": NHR,
        "Zoning Process": NHR,
        "Zoning Fees": NHR,
        "Zoning Approval Timeframe": NHR,
        "Property Zoning District": NHR,
        "Property Future Land Use": NHR,
        "Property Current Usage": NHR,
        "Meets minimum lot requirements?": NHR,
      },
      "TOWER SPECIFICS": {
        "LDC Section Reference(s)": NHR,
        "Maximum Tower Height": NHR,
        "Stealth Required?": NHR,
        "Required Collocations (#)": NHR,
        "Residential Separation (ft or %)": NHR,
        "Tower Separation (ft or %)": NHR,
        "Measured from base or center": NHR,
        "Fall Zone Requirements": NHR,
        "Special Tower Landscaping?": NHR,
      },
      "SITE PLAN OVERVIEW": {
        "Site Plan Jurisdiction": NHR,
        "Site Plan Contact Information": NHR,
        "Site Plan Fees": NHR,
        "Timeframe for approval": NHR,
        "Existing Site Plan to Amend?": NHR,
        "Concurrent to Zoning or BP?": NHR,
        "Submittal deadlines?": NHR,
        "Electronic, hard copy, or both?": NHR,
      },
      "BUILDING PERMIT INFORMATION": {
        "Building Permit Jurisdiction": NHR,
        "Building Department Contact Info": NHR,
        "Does GC have to submit?": NHR,
        "Building Permit Fees": NHR,
        "Building Permit Timeframe": NHR,
        "Bond Required?": NHR,
        "E911 Address assigned?": NHR,
      },
    };
  }
  return {
    "ZONING OVERVIEW": {
      "Zoning Jurisdiction": pick("zoning_overview", "zoning_jurisdiction"),
      "Zoning Contact Information": pick("zoning_overview", "zoning_contact_information"),
      "Zoning Process": pick("zoning_overview", "zoning_process"),
      "Zoning Fees": pick("zoning_overview", "zoning_fees"),
      "Zoning Approval Timeframe": pick("zoning_overview", "zoning_approval_timeframe"),
      "Property Zoning District": pick("zoning_overview", "property_zoning_district"),
      "Property Future Land Use": pick("zoning_overview", "property_future_land_use"),
      "Property Current Usage": pick("zoning_overview", "property_current_usage"),
      "Meets minimum lot requirements?": pick("zoning_overview", "meets_minimum_lot_requirements"),
    },
    "TOWER SPECIFICS": {
      "LDC Section Reference(s)": pick("tower_specifics", "ldc_section_references"),
      "Maximum Tower Height": pick("tower_specifics", "maximum_tower_height"),
      "Stealth Required?": pick("tower_specifics", "stealth_required"),
      "Required Collocations (#)": pick("tower_specifics", "required_collocations"),
      "Residential Separation (ft or %)": pick("tower_specifics", "residential_separation"),
      "Tower Separation (ft or %)": pick("tower_specifics", "tower_separation"),
      "Measured from base or center": pick("tower_specifics", "measured_from_base_or_center"),
      "Fall Zone Requirements": pick("tower_specifics", "fall_zone_requirements"),
      "Special Tower Landscaping?": pick("tower_specifics", "special_tower_landscaping"),
    },
    "SITE PLAN OVERVIEW": {
      "Site Plan Jurisdiction": pick("site_plan", "site_plan_jurisdiction"),
      "Site Plan Contact Information": pick("site_plan", "site_plan_contact_information"),
      "Site Plan Fees": pick("site_plan", "site_plan_fees"),
      "Timeframe for approval": pick("site_plan", "timeframe_for_approval"),
      "Existing Site Plan to Amend?": pick("site_plan", "existing_site_plan_to_amend"),
      "Concurrent to Zoning or BP?": pick("site_plan", "concurrent_to_zoning_or_bp"),
      "Submittal deadlines?": pick("site_plan", "submittal_deadlines"),
      "Electronic, hard copy, or both?": pick("site_plan", "submittal_format"),
    },
    "BUILDING PERMIT INFORMATION": {
      "Building Permit Jurisdiction": pick("building_permit", "building_permit_jurisdiction"),
      "Building Department Contact Info": pick("building_permit", "building_department_contact_info"),
      "Does GC have to submit?": pick("building_permit", "gc_submits"),
      "Building Permit Fees": pick("building_permit", "building_permit_fees"),
      "Building Permit Timeframe": pick("building_permit", "building_permit_timeframe"),
      "Bond Required?": pick("building_permit", "bond_required"),
      "E911 Address assigned?": pick("building_permit", "e911_address_assigned"),
    },
  };
}

function emptyState() {
  const s = {};
  for (const sec of SECTIONS) {
    s[sec.title] = {};
    for (const row of sec.rows) s[sec.title][row] = "";
  }
  return s;
}

function unresolvedRows(values) {
  const missing = [];
  for (const sec of SECTIONS) {
    for (const row of sec.rows) {
      const value = String(values?.[sec.title]?.[row] || "").trim();
      if (!value || value === "NEEDS_HUMAN_REVIEW") missing.push(`${sec.title}: ${row}`);
    }
  }
  return missing;
}

export default function HawkZoningOverview({ lat, lon, autoRun = false, onComplete }) {
  const [values, setValues] = useState(emptyState);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [resolutionError, setResolutionError] = useState("");

  const handleChange = (section, row, val) => {
    setValues((prev) => ({
      ...prev,
      [section]: { ...prev[section], [row]: val },
    }));
  };

  const handleGenerate = useCallback(async () => {
    if (lat == null || lon == null) {
      toast.error("Coordinates required — run a scan first.");
      return;
    }
    setLoading(true);
    setResolutionError("");
    try {
      const res = await generateZoningPermitReport({ lat, lon });
      const report = res.data?.report || null;
      const resolution = res.data?.zoning_resolution || {};
      const mapped = mapZoningToTemplate(report);
      setValues((prev) => {
        const next = emptyState();
        for (const sec of SECTIONS) {
          for (const row of sec.rows) {
            next[sec.title][row] = mapped[sec.title]?.[row] || prev[sec.title][row] || "";
          }
        }
        return next;
      });
      const missing = unresolvedRows(mapped);
      const explicitNoZoning = resolution.explicit_no_zoning === true || Boolean(report?._unincorporated);
      if (missing.length && !explicitNoZoning) {
        const message = `Zoning is not complete yet (${missing.length} field${missing.length === 1 ? "" : "s"} unresolved). Re-run after the ordinance agent finishes its source check.`;
        setGenerated(false);
        setResolutionError(message);
        toast.error(message);
        return;
      }
      setGenerated(true);
      toast.success(explicitNoZoning ? "No local zoning was explicitly confirmed." : "Hawk Intelligence populated the complete zoning template.");
      onComplete?.({ report, resolution, mapped });
    } catch (err) {
      console.error(err);
      const message = err?.message || "Hawk Intelligence lookup failed.";
      setGenerated(false);
      setResolutionError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [lat, lon, onComplete]);

  // Auto-run once when the pipeline reaches this stage.
  useEffect(() => {
    if (autoRun && !generated && !loading && lat != null && lon != null) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, lat, lon]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · ZONING</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Zoning Overview</h2>
          </div>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" /> {generated ? "Regenerate" : "Generate with Hawk Intelligence"}</>
          )}
        </Button>
      </div>

      {resolutionError && (
        <div className="border-b border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
          {resolutionError} The SCIP will not advance with a blank zoning section.
        </div>
      )}

      {/* Template */}
      <div className="divide-y divide-border">
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className="bg-slate-800 text-white px-4 py-2 font-heading font-bold text-sm tracking-wider">
              {sec.title}
            </div>
            <div>
              {sec.rows.map((row, idx) => (
                <div
                  key={row}
                  className={`grid grid-cols-1 md:grid-cols-[260px_1fr] border-b border-border last:border-b-0 ${
                    idx % 2 === 0 ? "bg-background" : "bg-muted/40"
                  }`}
                >
                  <div className="px-4 py-2.5 text-sm font-medium text-foreground border-r border-border">
                    {row}
                  </div>
                  <input
                    type="text"
                    value={values[sec.title][row]}
                    onChange={(e) => handleChange(sec.title, row, e.target.value)}
                    placeholder="—"
                    className="px-4 py-2.5 text-sm bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-950/30"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}