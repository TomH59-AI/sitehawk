// ZONEOMICS REMOVED — replaced by Regrid + Realie + Notion stack.
/**
 * Section2Zoning — SiteHawk pipeline step 2 ("HAWK ZONING AND PERMITTING VISION").
 *
 * STRICT pipeline gating (mirrors Section 1):
 *  - Stays LOCKED (greyed out) until Section 1 SARF map is complete (`unlocked`).
 *  - Fires NOTHING until the user clicks "Run Zoning", which flips
 *    pipelineStep → "zoning" (via onRun). The lookup only runs when
 *    `active` (pipelineStep === "zoning") is true. No auto-trigger.
 *  - While in flight: ONLY the hawk flying-in-place spinner.
 *  - On finish: STOP. Never auto-advances to the next section.
 *
 * DATA SOURCE PIPELINE (generateZoningPermitReport, run serially on Run Zoning):
 *   STEP 1  MapBox reverse-geocode (MAPBOX_API_KEY)  → state / county / city
 *   STEP 2  Regrid point parcel (REGRID_API_TOKEN)   → PRIMARY zoning district
 *   STEP 3  Realie parcel cross-check (REALIE_API_KEY) → agreement / supplement
 *   STEP 4  Notion Ordinance Vacuum (NOTION)         → PRIMARY telecom tower rules
 *   STEP 5  LLM extraction fallback                  → fills gaps from ordinance prose
 *   STEP 6  Render four panels with a per-field source badge.
 *
 * Each field is inline-editable; a manual edit overrides source data and the
 * badge flips to [Manual edit]. "Re-query Sources" re-runs the lookup WITHOUT
 * overwriting any field the user has manually edited. A wrong reverse-geocode
 * can be corrected via the jurisdiction edit button.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Lock, ClipboardList, Sparkles, RefreshCw, MapPin, Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import SourceBadge, { normalizeSource } from "./section2/SourceBadge";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";

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

const EMPTY_SENTINELS = ["", "NEEDS RESEARCH", "NEEDS_HUMAN_REVIEW"];

function emptyCells() {
  const v = {};
  for (const p of PANELS) {
    v[p.section] = {};
    for (const [, key] of p.rows) v[p.section][key] = { value: "", tag: "manual" };
  }
  return v;
}

// Flatten the report payload ({ value, source } per cell) into editable cells
// carrying a normalized source tag. `prev` lets us PRESERVE manual edits on re-query.
function reportToCells(report, prev) {
  const v = emptyCells();
  for (const p of PANELS) {
    for (const [, key] of p.rows) {
      const prevCell = prev?.[p.section]?.[key];
      // Preserve a field the user manually edited — never overwrite on re-query.
      if (prevCell && prevCell.tag === "manual edit") {
        v[p.section][key] = prevCell;
        continue;
      }
      const raw = report?.[p.section]?.[key];
      const rawVal = raw?.value;
      const value = EMPTY_SENTINELS.includes(rawVal) || rawVal == null ? "" : String(rawVal);
      v[p.section][key] = { value, tag: normalizeSource(raw?.source, !!value) };
    }
  }
  return v;
}

function countTags(cells) {
  const c = { regrid: 0, realie: 0, notion: 0, ai: 0, manual: 0 };
  for (const p of PANELS) {
    for (const [, key] of p.rows) {
      const tag = cells[p.section][key].tag;
      if (tag === "regrid" || tag === "discrepancy") c.regrid++;
      else if (tag === "realie") c.realie++;
      else if (tag === "notion") c.notion++;
      else if (tag === "ai") c.ai++;
      else c.manual++; // manual + manual edit both count as user-supplied gaps
    }
  }
  return c;
}

export default function Section2Zoning({ unlocked, active, lat, lon, candidate, onRun, onComplete }) {
  const [cells, setCells] = useState(emptyCells);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [jurisdiction, setJurisdiction] = useState(null);
  const [notionMatched, setNotionMatched] = useState(true);
  const [discrepancy, setDiscrepancy] = useState(null);
  const [editingJur, setEditingJur] = useState(false);
  const [jurLabel, setJurLabel] = useState("");
  const ranRef = useRef(false);

  const handleChange = (section, key, val) => {
    setCells((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: { value: val, tag: "manual edit" } },
    }));
  };

  const runLookup = useCallback(async (preserveEdits = false) => {
    setLoading(true);
    try {
      const res = await generateZoningPermitReport({ lat, lon, candidate });
      const report = res.data?.report || null;
      const jur = res.data?.jurisdiction || null;
      setJurisdiction(jur);
      setJurLabel(jur?.label || "");
      setNotionMatched(res.data?.notion_matched !== false);
      setDiscrepancy(res.data?.zoning_discrepancy || null);
      setCells((prev) => reportToCells(report, preserveEdits ? prev : null));
      if (report) toast.success("Zoning ordinance provisions loaded.");
      else toast.warning("No zoning data found — manual entry required.");
      setDone(true);
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";
      toast.error(msg || "Zoning lookup failed — manual entry required.");
      setNotionMatched(false);
      setDone(true);
    } finally {
      setLoading(false);
      onComplete?.();
    }
  }, [lat, lon, candidate, onComplete]);

  // Fire EXACTLY once when this step becomes active (pipelineStep === "zoning").
  useEffect(() => {
    if (active && !ranRef.current && lat != null && lon != null) {
      ranRef.current = true;
      runLookup(false);
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

  const counts = countTags(cells);

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
        <div className="flex items-center gap-2">
          {!active ? (
            <Button onClick={onRun} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow">
              <Sparkles className="w-4 h-4 mr-2" /> Run Zoning
            </Button>
          ) : done ? (
            <Button
              onClick={() => runLookup(true)}
              disabled={loading}
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Re-query Sources
            </Button>
          ) : null}
        </div>
      </div>

      {/* In-flight — hawk flying-in-place spinner ONLY */}
      {loading && <HawkFlightSpinner label="Regrid + Realie parcel · Notion Ordinance Vacuum…" />}

      {/* Idle — armed, waiting for the Run click */}
      {!loading && !done && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Resolve the jurisdiction from the SARF coordinates, pull the zoning district from Regrid (cross-checked
          against Realie), then pull telecom tower provisions from the Notion Ordinance Vacuum. Click{" "}
          <span className="font-semibold text-foreground">Run Zoning</span> to begin.
        </div>
      )}

      {/* Results */}
      {!loading && done && (
        <>
          {/* Resolved jurisdiction (editable) + coverage banner */}
          <div className="px-4 py-3 border-b border-border bg-muted/30 space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="shrink-0">Jurisdiction resolved:</span>
              {editingJur ? (
                <input
                  autoFocus
                  value={jurLabel}
                  onChange={(e) => setJurLabel(e.target.value)}
                  onBlur={() => setEditingJur(false)}
                  onKeyDown={(e) => { if (e.key === "Enter") setEditingJur(false); }}
                  className="font-mono text-sm border border-blue-400 rounded px-2 py-0.5 bg-background outline-none flex-1 min-w-0"
                />
              ) : (
                <>
                  <span className="font-mono">{jurLabel || "Unknown — confirm manually"}</span>
                  <button
                    onClick={() => setEditingJur(true)}
                    className="text-blue-600 hover:text-blue-700 shrink-0"
                    title="Correct the resolved jurisdiction"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              Regrid: {counts.regrid ? "✓" : "—"}
              {" | "}Realie: {counts.realie ? "✓" : "—"}
              {" | "}Notion: {notionMatched ? `✓ ${counts.notion} fields` : "✗"}
              {" | "}AI: {counts.ai} fields
              {" | "}Manual: {counts.manual} fields
            </div>
          </div>

          {/* Zoning discrepancy banner */}
          {discrepancy && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-950/20 border-b border-red-300/50 text-sm text-red-800 dark:text-red-200 font-medium flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Zoning code disagreement — <strong>Regrid: {discrepancy.regrid}</strong> vs{" "}
                <strong>Realie: {discrepancy.realie}</strong>. Confirm the correct district in the field below.
              </span>
            </div>
          )}

          {/* No Notion page banner */}
          {!notionMatched && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-300/50 text-sm text-amber-800 dark:text-amber-200 font-medium">
              No Notion page for {jurLabel || "this jurisdiction"} yet — run /hackerstacker-skill in Claude to add it
              to the Ordinance Vacuum, or fill the panels manually below.
            </div>
          )}

          <div className="divide-y divide-border">
            {PANELS.map((panel) => (
              <div key={panel.title}>
                <div className="bg-slate-800 text-white px-4 py-2 font-heading font-bold text-sm tracking-wider">
                  {panel.title}
                </div>
                <div>
                  {panel.rows.map(([label, key], idx) => {
                    const cell = cells[panel.section][key];
                    return (
                      <div
                        key={key}
                        className={`grid grid-cols-1 md:grid-cols-[260px_1fr] border-b border-border last:border-b-0 ${
                          idx % 2 === 0 ? "bg-background" : "bg-muted/40"
                        }`}
                      >
                        <div className="px-4 py-2.5 text-sm font-medium text-foreground border-r border-border">
                          {label}
                        </div>
                        <div className="flex items-center px-4">
                          <input
                            type="text"
                            value={cell.value}
                            onChange={(e) => handleChange(panel.section, key, e.target.value)}
                            placeholder="—"
                            className="flex-1 py-2.5 text-sm bg-transparent outline-none focus:bg-blue-50 dark:focus:bg-blue-950/30"
                          />
                          <SourceBadge tag={cell.tag} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}