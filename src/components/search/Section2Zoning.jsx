// Zoning cascade: telecom_ordinances Supabase cache → Realie → web-grounded AI.
// ⛔ Zoneomics paid API (api.zoneomics.com) is BANNED after a billing incident — never re-enable.
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
 *   STEP 1  MapBox reverse-geocode (MAPBOX_API_KEY)      → state / county / city
 *   STEP 2  telecom_ordinances Supabase table            → SANCTIONED PRIMARY zoning text
 *   STEP 3  Realie parcel @ SARF center (REALIE_API_KEY) → cross-check district + fill gaps
 *   STEP 4  LLM extraction (web-grounded)                → fills any field still empty
 *   STEP 5  Render four panels with a per-field source badge.
 *   ⛔ Zoneomics paid API (api.zoneomics.com) is BANNED and hard short-circuited
 *      in the backend (getZoneomics is a no-op) after a billing incident. Never re-enable.
 *
 * Each field is inline-editable; a manual edit overrides source data and the
 * badge flips to [Manual edit]. "Re-query Sources" re-runs the lookup WITHOUT
 * overwriting any field the user has manually edited. A wrong reverse-geocode
 * can be corrected via the jurisdiction edit button.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Lock, ClipboardList, Sparkles, RefreshCw, MapPin, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import SourceBadge, { normalizeSource } from "./section2/SourceBadge";
import NZACrossCheckCard from "./section2/NZACrossCheckCard";
import SectionClearButton from "./SectionClearButton";
import { generateZoningPermitReport } from "@/functions/generateZoningPermitReport";
import { useScipPaywall } from "@/lib/scipPaywall";
import ScipUpgradeModal from "@/components/billing/ScipUpgradeModal";

const PANELS = [
  {
    title: "ZONING OVERVIEW",
    section: "zoning_overview",
    rows: [
      ["Zoning Jurisdiction", "zoning_jurisdiction"],
      ["Zoning Contact Information", "zoning_contact_information"],
      ["Zoning Process", "zoning_process"],
      ["CUP / Special Exception Path", "cup_or_special_exception"],
      ["PE Self-Certification", "pe_self_certification"],
      ["Zoning Fees", "zoning_fees"],
      ["Zoning Approval Timeframe", "zoning_approval_timeframe"],
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
      ["PE Letter — Fall Zone / Setback Relief", "pe_letter"],
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
  const c = { zoneomics: 0, realie: 0, ai: 0, manual: 0 };
  for (const p of PANELS) {
    for (const [, key] of p.rows) {
      const tag = cells[p.section][key].tag;
      if (tag === "zoneomics") c.zoneomics++;
      else if (tag === "realie") c.realie++;
      else if (tag === "ai") c.ai++;
      else c.manual++; // manual + manual edit both count as user-supplied gaps
    }
  }
  return c;
}

export default function Section2Zoning({ unlocked, active, lat, lon, candidate, onRun, onComplete, onData, onClear }) {
  const [cells, setCells] = useState(emptyCells);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [jurisdiction, setJurisdiction] = useState(null);
  const [zoneomics, setZoneomics] = useState(null); // { ok, http_status, error, populated_count, zone_code }
  const [districtConflict, setDistrictConflict] = useState(null); // { zoneomics, realie }
  const [editingJur, setEditingJur] = useState(false);
  const [jurLabel, setJurLabel] = useState("");
  const ranRef = useRef(false);
  // HawkSCIP quota gate — Run Zoning is the billing trigger. If the backend
  // returns 402 / upgrade_required, the upgrade modal appears and routes to plans.
  const { generate, quota, clearQuota } = useScipPaywall();

  const handleChange = (section, key, val) => {
    setCells((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: { value: val, tag: "manual edit" } },
    }));
  };

  const runLookup = useCallback(async (preserveEdits = false) => {
    setLoading(true);
    try {
      // HawkSCIP quota gate lives in generateZoningPermitReport. The paywall
      // helper detects a 402 / upgrade_required and shows the upgrade modal.
      const gateResult = await generate(() => generateZoningPermitReport({ lat, lon, candidate }));
      if (!gateResult.ok) {
        setLoading(false);
        return; // blocked by quota — modal is shown, do not process a report
      }
      const res = gateResult.data;
      const report = res.data?.report || null;
      const jur = res.data?.jurisdiction || null;
      setJurisdiction(jur);
      setJurLabel(jur?.label || "");
      setZoneomics(res.data?.zoneomics || null);
      setDistrictConflict(res.data?.zoning_district_conflict || null);
      setCells((prev) => reportToCells(report, preserveEdits ? prev : null));
      // Emit zoning factor to the shared bus — Zoneomics canonical, Realie fallback.
      const zo = report?.zoning_overview || {};
      const tw = report?.tower_specifics || {};
      const sp = report?.site_plan || {};
      const bp = report?.building_permit || {};
      const val = (cell) => (cell?.value && !EMPTY_SENTINELS.includes(cell.value) ? cell.value : null);
      onData?.({
        zoning: {
          // Scorecard / downstream factors (unchanged)
          district: val(zo.property_zoning_district) || jur?.zone_code || null,
          height_limit: val(tw.maximum_tower_height),
          setback: val(tw.residential_separation),
          fall_zone: val(tw.fall_zone_requirements),
          permit_path: val(zo.zoning_process),
          cup_or_special_exception: val(zo.cup_or_special_exception),
          pe_self_certification: val(zo.pe_self_certification),
          // PE-sealed-letter fall-zone/setback relief scoured from the ordinance.
          pe_letter: val(tw.pe_letter),
          source: res.data?.zoneomics?.ok ? "zoneomics" : "realie_or_ai",
          conflict: res.data?.zoning_district_conflict || null,
          // Full SCIP document fields (Zoning Overview + Tower Specifics)
          jurisdiction: jur?.label || val(zo.zoning_jurisdiction) || null,
          contact: val(zo.zoning_contact_information),
          process: val(zo.zoning_process),
          fees: val(zo.zoning_fees),
          timeframe: val(zo.zoning_approval_timeframe),
          future_land_use: val(zo.property_future_land_use),
          current_usage: val(zo.property_current_usage),
          meets_min_lot: val(zo.meets_minimum_lot_requirements),
          ldc_reference: val(tw.ldc_section_references),
          max_height: val(tw.maximum_tower_height),
          stealth: val(tw.stealth_required),
          collocations: val(tw.required_collocations),
          residential_separation: val(tw.residential_separation),
          tower_separation: val(tw.tower_separation),
          measured_from: val(tw.measured_from_base_or_center),
          landscaping: val(tw.special_tower_landscaping),
          notes: val(tw.fall_zone_requirements),
          // Site Plan + Building Permit panels — printed on their own SCIP page.
          site_plan: {
            jurisdiction: val(sp.site_plan_jurisdiction),
            contact: val(sp.site_plan_contact_info),
            fees: val(sp.site_plan_fees),
            timeframe: val(sp.site_plan_timeframe),
            amend_existing: val(sp.existing_site_plan_amend),
            concurrent: val(sp.concurrent_to_zoning_or_bp),
            deadlines: val(sp.submittal_deadlines),
            submission_format: val(sp.electronic_hard_or_both),
          },
          building_permit: {
            jurisdiction: val(bp.building_permit_jurisdiction),
            contact: val(bp.building_dept_contact_info),
            gc_must_submit: val(bp.gc_must_submit),
            fees: val(bp.building_permit_fees),
            timeframe: val(bp.building_permit_timeframe),
            bond_required: val(bp.bond_required),
            e911: val(bp.e911_address_assigned),
          },
        },
      });
      if (report) toast.success("Zoning ordinance provisions loaded.");
      else toast.warning("No zoning data found — manual entry required.");
      setDone(true);
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";
      toast.error(msg || "Zoning lookup failed — manual entry required.");
      setDone(true);
    } finally {
      setLoading(false);
      onComplete?.();
    }
  }, [lat, lon, candidate, onComplete, generate]);

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
      <ScipUpgradeModal quota={quota} onClose={clearQuota} />
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
            <Button data-tour="run-zoning" onClick={onRun} className="bg-white text-blue-700 hover:bg-blue-50 font-semibold shadow">
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
          {active && onClear && <SectionClearButton onClear={onClear} />}
        </div>
      </div>

      {/* In-flight — hawk flying-in-place spinner ONLY */}
      {loading && <HawkFlightSpinner label="Realie parcel · Notion Ordinance Vacuum…" />}

      {/* Idle — armed, waiting for the Run click */}
      {!loading && !done && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Resolve the jurisdiction from the SARF coordinates, then pull the zoning district + telecom tower controls
          from <span className="font-semibold text-foreground">Realie parcel data</span> and web-grounded AI research.
          Click <span className="font-semibold text-foreground">Run Zoning</span> to begin.
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
              Realie: {counts.realie ? `✓ ${counts.realie} fields` : "—"}
              {" | "}AI: {counts.ai} fields
              {" | "}Manual: {counts.manual} fields
            </div>
          </div>

          {/* District conflict between sources */}
          {districtConflict && (
            <div className="px-4 py-2 bg-rose-50 dark:bg-rose-950/20 border-b border-rose-300/50 text-sm text-rose-800 dark:text-rose-200 font-medium">
              Zoning district conflict detected — confirm manually.
            </div>
          )}

          {/* Free second-source verification via the NZA public map */}
          <NZACrossCheckCard jurisdiction={jurLabel} lat={lat} lon={lon} />

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