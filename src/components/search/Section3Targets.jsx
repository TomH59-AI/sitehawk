/**
 * Section3Targets — SiteHawk pipeline step 3 ("HAWK TARGET PARCEL VISION").
 *
 * STRICT pipeline gating (mirrors Sections 1 & 2):
 *  - LOCKED (greyed out) until Section 2 (Zoning) is complete (`unlocked`).
 *  - Fires NOTHING until the user clicks "Run Targets", which flips
 *    pipelineStep → "targets" (via onRun). Lookup only runs when `active`
 *    (pipelineStep === "targets"). No auto-trigger, no parallel scans.
 *  - While in flight: ONLY the hawk flying-in-place spinner. No scan-board.
 *  - On success: vertical Target A/B/C table, every cell editable.
 *  - On finish: STOP. Never auto-advances to the next section.
 *
 * Pipeline (in sequence):
 *   1. Realie ring search + zoning-aware ranking + FEMA  → scipBestParcels
 *   2. Enformion skip-trace for each target owner's phone → skipTrace
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Lock, MapPinned, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import { scipBestParcels } from "@/functions/scipBestParcels";
import { skipTraceCascade } from "@/functions/skipTraceCascade";
import PhoneCascadeCell from "./section3/PhoneCascadeCell";
import PushTargetCrmButton from "./section3/PushTargetCrmButton";
import PushToTrackerButton from "./section3/PushToTrackerButton";
import SectionClearButton from "./SectionClearButton";

const COLS = ["Target A", "Target B", "Target C"];

// Session cache: key `${ownerName}|${mailingAddress}` → cascade result.
// Persists for the browser session so re-rendering Section 3 doesn't re-burn credits.
const cascadeCache = new Map();
const cacheKey = (owner, addr) => `${(owner || "").trim().toLowerCase()}|${(addr || "").trim().toLowerCase()}`;

// Row labels EXACTLY as Tom specified, in order. Each maps to a target field.
const ROWS = [
  ["Owner's Name:", "owner_name"],
  ["Parcel Address:", "parcel_address"],
  ["Parcel ID:", "apn"],
  ["Parcel Size (acres):", "acreage"],
  ["Boundaries", "boundaries"],
  ["Zoning Classification:", "zoning_classification"],
  ["Zoning Status:", "zoning_status"],
  ["CUP / Special Exception:", "cup_note"],
  ["PE Letter (Fall Zone Relief):", "pe_note"],
  ["Owner's Mailing Address:", "mailing_address"],
  ["Coordinates:", "coordinates"],
  ["Phone:", "phone"],
  ["FEMA Risk Factor Letter:", "fema_risk_factor"],
];

const HEADER_GREEN = "#628C83";

function emptyGrid() {
  // grid[rowKey][colIndex] = string
  const g = {};
  for (const [, key] of ROWS) g[key] = ["", "", ""];
  return g;
}

// Derive CUP / PE display strings from a raw target object returned by scipBestParcels.
function deriveCupPeNotes(t) {
  const cup = t?.cup_review_required
    ? "CUP / Special Exception required — all non-residential parcels retained for review"
    : "By-right (no CUP needed)";
  const pe = t?.pe_letter_review_required
    ? "PE sealed letter assumed — engineered fall-zone radius may reduce required setback"
    : "No PE letter relief";
  return { cup, pe };
}

function str(v) {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

// Map a scipBestParcels target → the row values for one column.
function targetToColumn(t) {
  if (!t) return {};
  const { cup, pe } = deriveCupPeNotes(t);
  const zoningStatusLabel = t.zoning_status === "confirmed"
    ? "✓ Confirmed non-residential"
    : t.zoning_status === "unverified"
    ? "⚠ Unverified — confirm before pursuing"
    : str(t.zoning_status);
  return {
    owner_name: str(t.owner_name),
    parcel_address: str(t.parcel_address),
    apn: str(t.apn),
    acreage: t.acreage != null ? String(t.acreage) : "",
    boundaries: str(t.boundaries),
    zoning_classification: str(t.zoning_classification),
    zoning_status: zoningStatusLabel,
    cup_note: cup,
    pe_note: pe,
    mailing_address: str(t.mailing_address),
    coordinates: t.latitude != null && t.longitude != null
      ? `${Number(t.latitude).toFixed(6)}, ${Number(t.longitude).toFixed(6)}`
      : "",
    phone: "", // filled by skip-trace
    fema_risk_factor: str(t.fema_risk_factor),
  };
}

export default function Section3Targets({
  unlocked, active, lat, lon, radiusMiles = 0.5,
  towerHeightFt = 199, compoundSideFt = 100, ringName = "Search Ring", zoningResult, onRun, onTargetAReady, onData, onClear,
  generatedLabels = [],
  searchRingCenter = null,
}) {
  const [grid, setGrid] = useState(emptyGrid);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [noData, setNoData] = useState(false);
  const [scanStats, setScanStats] = useState(null); // {scanned, required_acres} from scipBestParcels
  // Per-column cascade results + loading flags for the Phone row.
  const [phoneResults, setPhoneResults] = useState([null, null, null]);
  const [phoneLoading, setPhoneLoading] = useState([false, false, false]);
  const [targetMeta, setTargetMeta] = useState([null, null, null]); // {owner, addr} per col for retry
  // Full target objects (A/B/C) kept so the user can choose any one as the lead
  // site that the whole downstream pipeline runs on.
  const [targets, setTargets] = useState([null, null, null]);
  const [selectedCol, setSelectedCol] = useState(0); // which column is the lead (0 = Target A)
  const ranRef = useRef(false);
  const emitLeadRef = useRef(null); // latest emitLead, so applyCascade can re-emit without circular deps

  // Emit a chosen target column up to the pipeline as the lead site. Reuses the
  // already-computed target record — no new lookups, no business-logic change.
  const emitLead = useCallback((colIdx) => {
    const a = targets[colIdx];
    if (!a) return;
    const pr = phoneResults[colIdx];
    onTargetAReady?.({
      latitude: a.latitude != null ? Number(a.latitude) : null,
      longitude: a.longitude != null ? Number(a.longitude) : null,
      owner: a.owner_name || "",
      owner_name: a.owner_name || "",
      parcel_address: a.parcel_address || "",
      apn: a.apn || "",
      acreage: a.acreage ?? null,
      boundaries: a.boundaries || "",
      mailing_address: a.mailing_address || "",
      land_use: a.land_use || "",
      fema_risk_factor: a.fema_risk_factor || "",
      zoning_classification: a.zoning_classification || "",
      county: a.county || "",
      state: a.state || "",
      // Owner phone resolved by the skip-trace cascade (Enformion → Apify actors).
      // Skip-trace returns a phone only for individual owners; entity owners
      // (LLC/trust) short-circuit with no phone. There is no contact-person
      // name available from Realie or skip-trace, so contact_person stays blank.
      owner_phone: grid.phone[colIdx] || pr?.display || pr?.phone || "",
      label: COLS[colIdx],
    });
    onData?.({
      parcelFit: {
        acreage: a?.acreage != null ? Number(a.acreage) : null,
        zoning_classification: a?.zoning_classification || null,
        dimensions: a?.boundaries || null,
        apn: a?.apn || null,
        fema_risk_factor: a?.fema_risk_factor || null,
      },
    });
  }, [targets, phoneResults, onTargetAReady, onData]);

  // Keep the ref pointed at the latest emitLead for applyCascade to use.
  useEffect(() => { emitLeadRef.current = emitLead; }, [emitLead]);

  // Keep the active lead column aligned with the ladder once targets are loaded.
  // The current working target is the next un-generated column (nextCol); if all
  // three are locked, stay on the last one. Re-emits so the pipeline + Section 4
  // point at the correct parcel after a refresh.
  useEffect(() => {
    if (!targets.some(Boolean)) return;
    const col = nextCol === -1 ? COLS.length - 1 : nextCol;
    if (col !== selectedCol && targets[col]) {
      setSelectedCol(col);
      setTimeout(() => emitLeadRef.current?.(col), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, generatedLabels]);

  // ── SEQUENTIAL LADDER (A → B → C) ──────────────────────────────────────────
  // A target is LOCKED once its SCIP is generated (label present in
  // generatedLabels). The next target unlocks only when the prior one is locked.
  const isLocked = (colIdx) => generatedLabels.includes(COLS[colIdx]);
  // The single column the user may advance to next: the first not-yet-generated
  // column whose predecessor IS generated (or column 0 when nothing is done).
  const nextCol = (() => {
    for (let i = 0; i < COLS.length; i++) {
      if (!isLocked(i)) return i === 0 || isLocked(i - 1) ? i : -1;
    }
    return -1; // all three locked
  })();

  // Advance the lead to the next target in sequence and re-emit it. Only ever
  // called for `nextCol`, so the ladder can never be skipped.
  const advanceTo = (colIdx) => {
    if (!targets[colIdx] || colIdx !== nextCol) return;
    setSelectedCol(colIdx);
    emitLead(colIdx);
    toast.success(`Advanced to ${COLS[colIdx]} — Section 4 reset fresh for this target.`);
  };

  const setCell = (rowKey, colIdx, val) => {
    setGrid((prev) => {
      const next = { ...prev, [rowKey]: [...prev[rowKey]] };
      next[rowKey][colIdx] = val;
      return next;
    });
  };

  // Resolve one target column's phone via the cascade, using the session cache.
  const runCascade = useCallback(async (colIdx, owner, addr, label, force = false) => {
    const key = cacheKey(owner, addr);
    if (!force && cascadeCache.has(key)) {
      const cached = cascadeCache.get(key);
      applyCascade(colIdx, cached);
      return;
    }
    setPhoneLoading((p) => { const n = [...p]; n[colIdx] = true; return n; });
    try {
      const res = await skipTraceCascade({ owner_name: owner, mailing_address: addr, target_label: label });
      const data = res?.data ?? res;
      cascadeCache.set(key, data);
      applyCascade(colIdx, data);
    } catch {
      const miss = { is_entity_owner: false, phone: null, display: "", source: null, phones: [] };
      applyCascade(colIdx, miss);
    } finally {
      setPhoneLoading((p) => { const n = [...p]; n[colIdx] = false; return n; });
    }
  }, []);

  function applyCascade(colIdx, data) {
    setPhoneResults((p) => { const n = [...p]; n[colIdx] = data; return n; });
    if (data?.display) setCell("phone", colIdx, data.display);
    // If this column is the current lead, re-emit Target A so the freshly
    // resolved owner phone / contact person flow down to the SCIP.
    if (colIdx === selectedCol) {
      setTimeout(() => emitLeadRef.current?.(colIdx), 0);
    }
  }

  const runPipeline = useCallback(async () => {
    setLoading(true);
    setNoData(false);
    setPhoneResults([null, null, null]);
    setPhoneLoading([false, false, false]);
    try {
      // 1. Realie ring search + ranking + FEMA → best 3 targets. Section 2's
      //    zoning relief posture (CUP / PE-letter / fall-zone / setback) is passed
      //    through so the selector can honor reduced fall-zone footprints.
      const z = zoningResult?.zoning;
      const res = await scipBestParcels({
        lat, lon, radius_miles: radiusMiles,
        tower_height_ft: towerHeightFt, compound_side_ft: compoundSideFt,
        cup_or_special_exception: z?.cup_or_special_exception ?? null,
        pe_self_certification: z?.pe_self_certification ?? null,
        fall_zone: z?.fall_zone ?? null,
        setback: z?.setback ?? null,
      });
      const found = res.data?.targets || [];
      setScanStats({
        scanned: res.data?.count_in_ring ?? res.data?.count_scanned ?? 0,
        required_acres: res.data?.required_acres ?? null,
      });

      const fresh = emptyGrid();
      found.slice(0, 3).forEach((t, colIdx) => {
        const col = targetToColumn(t);
        for (const [, key] of ROWS) fresh[key][colIdx] = col[key] ?? "";
      });

      setGrid(fresh);
      // Keep the full target objects so the user can pick any one as the lead.
      const slots = [null, null, null];
      found.slice(0, 3).forEach((t, i) => { slots[i] = t; });
      setTargets(slots);
      setSelectedCol(0); // default lead = Target A

      // 2. Multi-source skip-trace cascade per target owner (Enformion → Apify
      //    actors in parallel). Records meta for retry + fires the lookups.
      const metas = [null, null, null];
      for (let colIdx = 0; colIdx < found.length && colIdx < 3; colIdx++) {
        const t = found[colIdx];
        if (t?.owner_name) metas[colIdx] = { owner: t.owner_name, addr: t.mailing_address || t.parcel_address || "" };
      }
      setTargetMeta(metas);
      // Fire all target cascades in parallel — each cascade internally runs its
      // own sources (Enformion first, then the two Apify actors together).
      metas.forEach((m, colIdx) => { if (m) runCascade(colIdx, m.owner, m.addr, COLS[colIdx]); });
      if (found.length === 0) {
        setNoData(true);
        toast.warning("No buildable target parcels found in the ring.");
      } else {
        toast.success(`Selected ${Math.min(found.length, 3)} best target${found.length > 1 ? "s" : ""}.`);
        // Emit Target A (column 0) up to the pipeline as the default lead site —
        // unlocks Section 4 (Map Suite). The user can switch the lead afterward.
        const a = found[0];
        if (a && onTargetAReady) {
          onTargetAReady({
            latitude: a.latitude != null ? Number(a.latitude) : null,
            longitude: a.longitude != null ? Number(a.longitude) : null,
            owner: a.owner_name || "",
            owner_name: a.owner_name || "",
            parcel_address: a.parcel_address || "",
            apn: a.apn || "",
            acreage: a.acreage ?? null,
            boundaries: a.boundaries || "",
            mailing_address: a.mailing_address || "",
            land_use: a.land_use || "",
            fema_risk_factor: a.fema_risk_factor || "",
            zoning_classification: a.zoning_classification || "",
            county: a.county || "",
            state: a.state || "",
            owner_phone: "",
            label: "Target A",
          });
        }
        // Emit parcel-fit factor to the shared bus — REUSES Target A's already-
        // computed record (no new Realie query, canonical parcel = §3 record).
        onData?.({
          parcelFit: {
            acreage: a?.acreage != null ? Number(a.acreage) : null,
            zoning_classification: a?.zoning_classification || null,
            dimensions: a?.boundaries || null,
            apn: a?.apn || null,
            fema_risk_factor: a?.fema_risk_factor || null,
          },
        });
      }
      setDone(true);
    } catch (err) {
      console.error(err);
      setNoData(true);
      setDone(true);
      toast.error(err?.message || "Target parcel lookup failed.");
    } finally {
      setLoading(false);
    }
  }, [lat, lon, radiusMiles, towerHeightFt, compoundSideFt, zoningResult, onTargetAReady, runCascade]);

  // Fire EXACTLY once when this step becomes active (pipelineStep === "targets").
  useEffect(() => {
    if (active && !ranRef.current && lat != null && lon != null) {
      ranRef.current = true;
      runPipeline();
    }
  }, [active, lat, lon, runPipeline]);

  // ── LOCKED — Section 2 not complete yet ──────────────────────────────────
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="text-white/80 px-4 py-3 flex items-center gap-2" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 3 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Target Parcel Vision</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete Section 2 (run zoning research) to unlock target parcel selection.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Banner */}
      <div
        className="text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
        style={{ background: HEADER_GREEN }}
      >
        <div className="flex items-center gap-2">
          <MapPinned className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 3 · TARGETS</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Target Parcel Vision</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!active ? (
            <Button onClick={onRun} className="bg-white hover:bg-emerald-50 font-semibold shadow" style={{ color: HEADER_GREEN }}>
              <Sparkles className="w-4 h-4 mr-2" /> Run Targets
            </Button>
          ) : done ? (
            <Button
              onClick={runPipeline}
              disabled={loading}
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold"
            >
              <Sparkles className="w-4 h-4 mr-2" /> Re-run
            </Button>
          ) : null}
          {active && onClear && <SectionClearButton onClear={onClear} />}
        </div>
      </div>

      {/* In-flight — hawk flying-in-place spinner ONLY */}
      {loading && <HawkFlightSpinner label="Scanning ring & selecting the 3 best targets…" />}

      {/* Idle — armed, waiting for the Run click */}
      {!loading && !done && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Scan every parcel in the SARF ring, apply your Section 2 zoning, CUP/special-exception, and PE-letter checks, then pick the three best tower targets.
          Click <span className="font-semibold text-foreground">Run Targets</span> to begin.
        </div>
      )}

      {/* Results — vertical Target A/B/C table */}
      {!loading && done && (
        <>
          {noData && (
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-300/50 text-sm text-amber-800 dark:text-amber-200 font-medium space-y-1">
              <p>
                No buildable target parcels found
                {scanStats?.scanned ? ` — scanned ${scanStats.scanned} parcel${scanStats.scanned !== 1 ? "s" : ""} in the ring, but none meet the${scanStats.required_acres ? ` ~${scanStats.required_acres} acre` : ""} footprint + fall-zone requirement (the rest are residential or too small).` : "."}
              </p>
              <p className="font-normal">
                {Number(radiusMiles) < 1
                  ? "Try expanding the ring size to 1 mile to pull in larger rural parcels, lower the tower height/compound size, or enter targets manually below."
                  : "Try lowering the tower height/compound size, or enter targets manually below."}
              </p>
            </div>
          )}
          {/* CUP / PE / Zoning posture summary banner */}
          {!noData && targets.some(Boolean) && (
            <div className="px-4 py-3 border-b border-border bg-emerald-50 dark:bg-emerald-950/20 text-xs text-emerald-900 dark:text-emerald-200 space-y-1.5">
              <p className="font-bold text-sm text-emerald-800 dark:text-emerald-300">✅ CUP / PE Posture Applied to All Targets</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                <div className="rounded bg-emerald-100 dark:bg-emerald-900/30 px-3 py-2">
                  <p className="font-semibold">🏛 Zero Residential Tolerance</p>
                  <p className="opacity-80 mt-0.5">All residential-zoned parcels hard-excluded. No exceptions.</p>
                </div>
                <div className="rounded bg-emerald-100 dark:bg-emerald-900/30 px-3 py-2">
                  <p className="font-semibold">⚖️ CUP Baseline Assumed</p>
                  <p className="opacity-80 mt-0.5">All non-residential targets retained for CUP / special-exception review. By-right not required to qualify.</p>
                </div>
                <div className="rounded bg-emerald-100 dark:bg-emerald-900/30 px-3 py-2">
                  <p className="font-semibold">📉 PE Letter Relief Active</p>
                  <p className="opacity-80 mt-0.5">Engineered PE sealed letter assumed — reduced fall-zone radius applied to tighter parcels to maximize eligible set.</p>
                </div>
              </div>
              {scanStats?.scanned != null && (
                <p className="opacity-70 mt-1">
                  Scanned <strong>{scanStats.scanned}</strong> parcels in ring ·{" "}
                  {scanStats.required_acres != null && <>Min buildable: ~<strong>{scanStats.required_acres} ac</strong> ·{" "}</>}
                  Returned top <strong>{targets.filter(Boolean).length}</strong> ranked targets
                </p>
              )}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ fontFamily: "Inter, Calibri, sans-serif" }}>
              <thead>
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold text-white border border-white/20" style={{ background: HEADER_GREEN, minWidth: 200 }}>
                    &nbsp;
                  </th>
                  {COLS.map((c, colIdx) => {
                    const isLead = selectedCol === colIdx;
                    const hasTarget = !!targets[colIdx];
                    const locked = isLocked(colIdx);
                    const canAdvance = hasTarget && colIdx === nextCol && !isLead;
                    return (
                      <th
                        key={c}
                        className="text-left px-4 py-2.5 font-bold text-white border border-white/20 uppercase tracking-wide"
                        style={{ background: locked ? "#1f4d40" : isLead ? "#2f6b5b" : HEADER_GREEN, minWidth: 220 }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{c}</span>
                          {hasTarget && (
                            locked ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case bg-emerald-400/30 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> SCIP Generated ✓
                              </span>
                            ) : isLead ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case bg-white/20 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Active Target
                              </span>
                            ) : canAdvance ? (
                              <button
                                onClick={() => advanceTo(colIdx)}
                                className="text-[10px] font-semibold normal-case bg-white/20 hover:bg-white/40 px-2 py-0.5 rounded-full transition-colors"
                              >
                                Advance to {c}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold normal-case bg-black/20 px-2 py-0.5 rounded-full opacity-70">
                                <Lock className="w-3 h-3" /> Locked
                              </span>
                            )
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, key], rowIdx) => {
                  // Compliance/posture rows get a distinct teal-tinted background
                  const isPostureRow = key === "zoning_status" || key === "cup_note" || key === "pe_note";
                  const rowBg = isPostureRow
                    ? "bg-emerald-50 dark:bg-emerald-950/20"
                    : rowIdx % 2 === 0 ? "bg-background" : "bg-muted/40";
                  return (
                  <tr key={key} className={rowBg}>
                    <td className={`px-4 py-2 font-bold text-left border border-border align-top ${isPostureRow ? "text-emerald-800 dark:text-emerald-300" : "text-foreground"}`}>
                      {label}
                    </td>
                    {[0, 1, 2].map((colIdx) => {
                      const locked = isLocked(colIdx);
                      const val = grid[key]?.[colIdx] || "";
                      // Zoning status: color the cell by verified/unverified
                      const zoningStatusClass = key === "zoning_status"
                        ? val.includes("✓")
                          ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                          : val.includes("⚠")
                          ? "text-amber-700 dark:text-amber-300 font-semibold"
                          : ""
                        : "";
                      return (
                      <td key={colIdx} className={`border border-border p-0 align-top ${locked ? "opacity-50 pointer-events-none bg-muted/30" : ""}`}>
                        {key === "phone" ? (
                          <PhoneCascadeCell
                            result={phoneResults[colIdx]}
                            loading={phoneLoading[colIdx]}
                            value={grid.phone[colIdx]}
                            onChange={(v) => setCell("phone", colIdx, v)}
                            onPick={(v) => setCell("phone", colIdx, v)}
                            onRetry={() => { const m = targetMeta[colIdx]; if (m) runCascade(colIdx, m.owner, m.addr, COLS[colIdx], true); }}
                          />
                        ) : isPostureRow ? (
                          // Read-only display for compliance posture rows
                          <div className={`px-4 py-2 text-xs leading-snug ${zoningStatusClass || "text-emerald-800 dark:text-emerald-300"}`}>
                            {val || "—"}
                          </div>
                        ) : (
                          <textarea
                            rows={1}
                            value={val}
                            onChange={(e) => setCell(key, colIdx, e.target.value)}
                            disabled={locked}
                            placeholder="—"
                            className="w-full px-4 py-2 text-sm bg-transparent outline-none resize-y text-foreground focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                          />
                        )}
                      </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Per-target actions — push this owner to the CRM as a contact */}
          {!noData && (
            <div className="grid border-t border-border" style={{ gridTemplateColumns: "200px repeat(3, minmax(220px, 1fr))" }}>
              <div className="px-4 py-3 font-bold text-foreground bg-muted/40 border-r border-border text-sm">Actions</div>
              {[0, 1, 2].map((colIdx) => (
                <div key={colIdx} className={`px-3 py-3 border-r border-border last:border-r-0 ${isLocked(colIdx) ? "opacity-50 pointer-events-none" : ""}`}>
                  {targets[colIdx] ? (
                    <div className="flex flex-col gap-1.5">
                      <PushTargetCrmButton
                        ringName={ringName}
                        targetLabel={COLS[colIdx]}
                        targetIndex={colIdx}
                        target={targets[colIdx]}
                      />
                      <PushToTrackerButton
                        ringName={ringName}
                        targetLabel={COLS[colIdx]}
                        target={targets[colIdx]}
                        searchRingCenter={searchRingCenter}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}