/**
 * Section2Zoning — SiteHawk pipeline step 2 ("HAWK ZONING AND PERMITTING VISION").
 *
 * STRICT pipeline gating (mirrors Section 1):
 *  - Stays LOCKED (greyed out) until Section 1 SARF map is complete (`unlocked`).
 *  - Fires NOTHING until the user clicks "Run Zoning", which flips
 *    pipelineStep → "zoning" (via onRun). The lookup only runs when
 *    `active` (pipelineStep === "zoning") is true. No auto-trigger.
 *  - While in flight: ONLY the hawk flying-in-place spinner. No scan-board.
 *  - On success: render the four editable panels (Zoneomics → Notion → manual).
 *  - On finish: STOP. Never auto-advances to the next section.
 *
 * Data source pipeline lives in generateZoningPermitReport:
 *   1. Zoneomics (ZONEOMICS_API_KEY) → 2. Notion Zoning Master → 3. manual entry.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Lock, ClipboardList, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";

// The four panels — labels match the user's BP template EXACTLY. Each row maps
// to a key in the generateZoningPermitReport payload section.
const PANELS = [
  {
    title: "ZONING OVERVIEW",
    section: "zoning_overview",
    rows: [
      ["Zoning Jurisdiction", "zoning_jurisdiction"],
      ["Zoning Contact Information", "zoning_contact_information"],
      ["Zoning Process", "zoning_process"],
      ["Zoning Fees", "zoning_fees"],
      ["Zoning Approval Timeframe", "zoning_approval_timeframe"],
      ["Property Zoning District", "property_zoning_district"],
    ],
  },
  {
    title: "TOWER SPECIFICS",
    section: "tower_specifics",
    rows: [
      ["LDC Section Reference(s)", "ldc_section_references"],
      ["Maximum Tower Height", "maximum_tower_height"],
      ["Stealth Required?", "stealth_required"],
      ["Required Collocations (#)", "required_collocations"],
      ["Residential Separation (ft or %)", "residential_separation"],
      ["Tower Separation (ft or %)", "tower_separation"],
      ["Measured from base or center", "measured_from_base_or_center"],
      ["Fall Zone Requirements", "fall_zone_requirements"],
      ["Special Tower Landscaping?", "special_tower_landscaping"],
    ],
  },
  {
    title: "SITE PLAN OVERVIEW",
    section: "site_plan",
    rows: [
      ["Site Plan Jurisdiction", "site_plan_jurisdiction"],
      ["Site Plan Contact Information", "site_plan_contact_info"],
      ["Site Plan Fees", "site_plan_fees"],
      ["Timeframe for approval", "site_plan_timeframe"],
      ["Existing Site Plan to Amend?", "existing_site_plan_amend"],
      ["Concurrent to Zoning or BP?", "concurrent_to_zoning_or_bp"],
      ["Submittal deadlines?", "submittal_deadlines"],
      ["Electronic, hard copy, or both?", "electronic_hard_or_both"],
    ],
  },
  {
    title: "BUILDING PERMIT INFORMATION",
    section: "building_permit",
    rows: [
      ["Building Permit Jurisdiction", "building_permit_jurisdiction"],
      ["Building Department Contact Info", "building_dept_contact_info"],
      ["Does GC have to submit?", "gc_must_submit"],
      ["Building Permit Fees", "building_permit_fees"],
      ["Building Permit Timeframe", "building_permit_timeframe"],
      ["Bond Required?", "bond_required"],
      ["E911 Address assigned?", "e911_address_assigned"],
    ],
  },
];

function emptyValues() {
  const v = {};
  for (const p of PANELS) {
    v[p.section] = {};
    for (const [, key] of p.rows) v[p.section][key] = "";
  }
  return v;
}

// Flatten the report payload ({ value, source, confidence } per cell) into plain
// editable strings. Empty/sentinel values become "" so the field reads as a gap.
function reportToValues(report) {
  const v = emptyValues();
  if (!report) return v;
  for (const p of PANELS) {
    for (const [, key] of p.rows) {
      const cell = report?.[p.section]?.[key]?.value;
      v[p.section][key] =
        cell == null || cell === "" || cell === "NEEDS RESEARCH" || cell === "NEEDS_HUMAN_REVIEW"
          ? ""
          : String(cell);
    }
  }
  return v;
}

export default function Section2Zoning({ unlocked, active, lat, lon, candidate, onRun, onComplete }) {
  const [values, setValues] = useState(emptyValues);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [noData, setNoData] = useState(false);
  const ranRef = useRef(false);

  const handleChange = (section, key, val) => {
    setValues((prev) => ({ ...prev, [section]: { ...prev[section], [key]: val } }));
  };

  const runLookup = useCallback(async () => {
    setLoading(true);
    setNoData(false);
    try {
      const res = await generateZoningPermitReport({ lat, lon, candidate });
      const report = res.data?.report || null;
      const sources = res.data?.sources_used || {};
      const mapped = reportToValues(report);
      setValues(mapped);

      // "No data found" = neither Zoneomics nor Notion produced anything usable.
      const anyValue = Object.values(mapped).some((sec) =>
        Object.values(sec).some((v) => v && v.trim())
      );
      const anySource = sources.zoneomics || sources.notion;
      if (!report || (!anyValue && !anySource)) {
        setNoData(true);
        toast.warning("No zoning data found — manual entry required.");
      } else {
        toast.success("Zoning ordinance provisions loaded.");
      }
      setDone(true);
    } catch (err) {
      console.error(err);
      setNoData(true);
      setDone(true);
      toast.error(err?.message || "Zoning lookup failed — manual entry required.");
    } finally {
      setLoading(false);
      onComplete?.();
    }
  }, [lat, lon, candidate, onComplete]);

  // Fire EXACTLY once when this step becomes active (pipelineStep === "zoning").
  // No auto-trigger before that — `active` only flips on the user's Run click.
  useEffect(() => {
    if (active && !ranRef.current && lat != null && lon != null) {
      ranRef.current = true;
      runLookup();
    }
  }, [active, lat, lon, runLookup]);

  // ── LOCKED state — Section 1 not complete yet ────────────────────────────
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="bg-slate-700 text-white/80 px-4 py-3 flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 2 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Zoning and Permitting Vision</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete Section 1 (generate the SARF map) to unlock zoning research.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 2 · ZONING</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Zoning and Permitting Vision</h2>
          </div>
        </div>
        {!active ? (
          <Button
            onClick={onRun}
            className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow"
          >
            <Sparkles className="w-4 h-4 mr-2" /> Run Zoning
          </Button>
        ) : done ? (
          <Button
            onClick={runLookup}
            disabled={loading}
            variant="outline"
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold"
          >
            <Sparkles className="w-4 h-4 mr-2" /> Re-run
          </Button>
        ) : null}
      </div>

      {/* In-flight — hawk flying-in-place spinner ONLY */}
      {loading && <HawkFlightSpinner label="Pulling local telecom zoning ordinance…" />}

      {/* Idle — armed, waiting for the Run click */}
      {!loading && !done && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Pull the governing authority's telecommunications tower &amp; antenna ordinance for the SARF coordinates.
          Click <span className="font-semibold text-foreground">Run Zoning</span> to begin.
        </div>
      )}

      {/* Results — four editable panels */}
      {!loading && done && (
        <>
          {noData && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-300/50 text-sm text-amber-800 dark:text-amber-200 font-medium">
              No zoning data found — manual entry required. Fill in the fields below from the local ordinance.
            </div>
          )}
          <div className="divide-y divide-border">
            {PANELS.map((panel) => (
              <div key={panel.title}>
                <div className="bg-slate-800 text-white px-4 py-2 font-heading font-bold text-sm tracking-wider">
                  {panel.title}
                </div>
                <div>
                  {panel.rows.map(([label, key], idx) => (
                    <div
                      key={key}
                      className={`grid grid-cols-1 md:grid-cols-[260px_1fr] border-b border-border last:border-b-0 ${
                        idx % 2 === 0 ? "bg-background" : "bg-muted/40"
                      }`}
                    >
                      <div className="px-4 py-2.5 text-sm font-medium text-foreground border-r border-border">
                        {label}
                      </div>
                      <input
                        type="text"
                        value={values[panel.section][key]}
                        onChange={(e) => handleChange(panel.section, key, e.target.value)}
                        placeholder="—"
                        className="px-4 py-2.5 text-sm bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-950/30"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}