/**
 * HawkZoningOverview — blank zoning template that mirrors the
 * "ZoningSpecsBP" spreadsheet 1:1. Has its own "Generate with Hawk
 * Intelligence" button that runs independently from the SARF map
 * generation.
 */

import { useState } from "react";
import { ClipboardList, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { notionZoningLookup } from "@/functions/notionZoningLookup";

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

// Map Notion / zoning lookup payload keys → template row labels.
function mapZoningToTemplate(z) {
  if (!z) return {};
  return {
    "ZONING OVERVIEW": {
      "Zoning Jurisdiction": z.jurisdiction || "",
      "Zoning Contact Information": z.zoning_contact || "",
      "Zoning Process": z.zoning_process || "",
      "Zoning Fees": z.zoning_fees || "",
      "Zoning Approval Timeframe": z.zoning_timeframe || "",
      "Property Zoning District": z.zoning_district || z.zoning_classification || "",
      "Property Future Land Use": z.future_land_use || "",
      "Property Current Usage": z.current_usage || "",
      "Meets minimum lot requirements?": z.meets_min_lot || "",
    },
    "TOWER SPECIFICS": {
      "LDC Section Reference(s)": z.ldc_section || "",
      "Maximum Tower Height": z.max_tower_height || "",
      "Stealth Required?": z.stealth_required || "",
      "Required Collocations (#)": z.required_collocations || "",
      "Residential Separation (ft or %)": z.residential_separation || "",
      "Tower Separation (ft or %)": z.tower_separation || "",
      "Measured from base or center": z.measured_from || "",
      "Fall Zone Requirements": z.fall_zone || "",
      "Special Tower Landscaping?": z.tower_landscaping || "",
    },
    "SITE PLAN OVERVIEW": {
      "Site Plan Jurisdiction": z.site_plan_jurisdiction || "",
      "Site Plan Contact Information": z.site_plan_contact || "",
      "Site Plan Fees": z.site_plan_fees || "",
      "Timeframe for approval": z.site_plan_timeframe || "",
      "Existing Site Plan to Amend?": z.existing_site_plan || "",
      "Concurrent to Zoning or BP?": z.concurrent || "",
      "Submittal deadlines?": z.submittal_deadlines || "",
      "Electronic, hard copy, or both?": z.submittal_format || "",
    },
    "BUILDING PERMIT INFORMATION": {
      "Building Permit Jurisdiction": z.bp_jurisdiction || "",
      "Building Department Contact Info": z.bp_contact || "",
      "Does GC have to submit?": z.gc_submits || "",
      "Building Permit Fees": z.bp_fees || "",
      "Building Permit Timeframe": z.bp_timeframe || "",
      "Bond Required?": z.bond_required || "",
      "E911 Address assigned?": z.e911_assigned || "",
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

export default function HawkZoningOverview({ lat, lon }) {
  const [values, setValues] = useState(emptyState);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleChange = (section, row, val) => {
    setValues((prev) => ({
      ...prev,
      [section]: { ...prev[section], [row]: val },
    }));
  };

  async function handleGenerate() {
    if (lat == null || lon == null) {
      toast.error("Coordinates required — run a scan first.");
      return;
    }
    setLoading(true);
    try {
      const res = await notionZoningLookup({ lat, lon });
      const z = res.data?.zoning || {};
      const mapped = mapZoningToTemplate(z);
      setValues((prev) => {
        const next = emptyState();
        for (const sec of SECTIONS) {
          for (const row of sec.rows) {
            next[sec.title][row] = mapped[sec.title]?.[row] || prev[sec.title][row] || "";
          }
        }
        return next;
      });
      setGenerated(true);
      toast.success("Hawk Intelligence populated the zoning template.");
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Hawk Intelligence lookup failed.");
    } finally {
      setLoading(false);
    }
  }

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