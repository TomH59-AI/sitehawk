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
import { Lock, MapPinned, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFlightSpinner from "./HawkFlightSpinner";
import { scipBestParcels } from "@/functions/scipBestParcels";
import { skipTraceCascade } from "@/functions/skipTraceCascade";
import PhoneCascadeCell from "./section3/PhoneCascadeCell";
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

function str(v) {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

// Map a scipBestParcels target → the row values for one column.
function targetToColumn(t) {
  if (!t) return {};
  return {
    owner_name: str(t.owner_name),
    parcel_address: str(t.parcel_address),
    apn: str(t.apn),
    acreage: t.acreage != null ? String(t.acreage) : "",
    boundaries: str(t.boundaries),
    zoning_classification: str(t.zoning_classification),
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
  towerHeightFt = 199, compoundSideFt = 100, onRun, onTargetAReady, onData, onClear,
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
  const ranRef = useRef(false);

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
  }

  const runPipeline = useCallback(async () => {
    setLoading(true);
    setNoData(false);
    setPhoneResults([null, null, null]);
    setPhoneLoading([false, false, false]);
    try {
      // 1. Realie ring search + ranking + FEMA → best 3 targets
      const res = await scipBestParcels({
        lat, lon, radius_miles: radiusMiles,
        tower_height_ft: towerHeightFt, compound_side_ft: compoundSideFt,
      });
      const targets = res.data?.targets || [];
      setScanStats({
        scanned: res.data?.count_in_ring ?? res.data?.count_scanned ?? 0,
        required_acres: res.data?.required_acres ?? null,
      });

      const fresh = emptyGrid();
      targets.slice(0, 3).forEach((t, colIdx) => {
        const col = targetToColumn(t);
        for (const [, key] of ROWS) fresh[key][colIdx] = col[key] ?? "";
      });

      setGrid(fresh);

      // 2. Multi-source skip-trace cascade per target owner (Enformion → Apify
      //    actors in parallel). Records meta for retry + fires the lookups.
      const metas = [null, null, null];
      for (let colIdx = 0; colIdx < targets.length && colIdx < 3; colIdx++) {
        const t = targets[colIdx];
        if (t?.owner_name) metas[colIdx] = { owner: t.owner_name, addr: t.mailing_address || t.parcel_address || "" };
      }
      setTargetMeta(metas);
      // Fire all target cascades in parallel — each cascade internally runs its
      // own sources (Enformion first, then the two Apify actors together).
      metas.forEach((m, colIdx) => { if (m) runCascade(colIdx, m.owner, m.addr, COLS[colIdx]); });
      if (targets.length === 0) {
        setNoData(true);
        toast.warning("No buildable target parcels found in the ring.");
      } else {
        toast.success(`Selected ${Math.min(targets.length, 3)} best target${targets.length > 1 ? "s" : ""}.`);
        // Emit Target A (column 0) up to the pipeline — unlocks Section 4 (Map Suite).
        const a = targets[0];
        if (a && onTargetAReady) {
          onTargetAReady({
            latitude: a.latitude != null ? Number(a.latitude) : null,
            longitude: a.longitude != null ? Number(a.longitude) : null,
            owner: a.owner_name || "",
            parcel_address: a.parcel_address || "",
            apn: a.apn || "",
            zoning_classification: a.zoning_classification || "",
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
  }, [lat, lon, radiusMiles, towerHeightFt, compoundSideFt, onTargetAReady, runCascade]);

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
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ fontFamily: "Inter, Calibri, sans-serif" }}>
              <thead>
                <tr>
                  <th className="text-left px-4 py-2.5 font-bold text-white border border-white/20" style={{ background: HEADER_GREEN, minWidth: 200 }}>
                    &nbsp;
                  </th>
                  {COLS.map((c) => (
                    <th
                      key={c}
                      className="text-left px-4 py-2.5 font-bold text-white border border-white/20 uppercase tracking-wide"
                      style={{ background: HEADER_GREEN, minWidth: 220 }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([label, key], rowIdx) => (
                  <tr key={key} className={rowIdx % 2 === 0 ? "bg-background" : "bg-muted/40"}>
                    <td className="px-4 py-2 font-bold text-left text-foreground border border-border align-top">
                      {label}
                    </td>
                    {[0, 1, 2].map((colIdx) => (
                      <td key={colIdx} className="border border-border p-0 align-top">
                        {key === "phone" ? (
                          <PhoneCascadeCell
                            result={phoneResults[colIdx]}
                            loading={phoneLoading[colIdx]}
                            value={grid.phone[colIdx]}
                            onChange={(v) => setCell("phone", colIdx, v)}
                            onPick={(v) => setCell("phone", colIdx, v)}
                            onRetry={() => { const m = targetMeta[colIdx]; if (m) runCascade(colIdx, m.owner, m.addr, COLS[colIdx], true); }}
                          />
                        ) : (
                          <textarea
                            rows={1}
                            value={grid[key][colIdx]}
                            onChange={(e) => setCell(key, colIdx, e.target.value)}
                            placeholder="—"
                            className="w-full px-4 py-2 text-sm bg-transparent outline-none resize-y text-foreground focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
