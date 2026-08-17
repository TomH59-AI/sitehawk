import { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import TalonFitMap from "@/components/talonfit/TalonFitMap";
import TalonFitDataPanel from "@/components/talonfit/TalonFitDataPanel";
import { invokeTalonfitAgent } from "@/lib/talonfitAgent";

const RADIUS_MILES = 2;
const MAX_SAVED = 3;
const LETTERS = ["D", "E", "F"];

// Auto-select points: 3 points at 0.5mi from center, 120° apart
function generateAutoPoints(lat, lon) {
  const R_M = 0.5 * 1609.344; // 0.5 miles in meters
  const angles = [0, 120, 240]; // degrees from north
  return angles.map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const dLat = (R_M * Math.cos(rad)) / 111320;
    const dLon = (R_M * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
    return { lat: lat + dLat, lon: lon + dLon };
  });
}

/**
 * Unified tower-siting page — a 2-mile search ring on a full-page map.
 * The map renders immediately at world view; entering coordinates and
 * clicking Set Ring flies to the search center. Clicking a parcel inside
 * the ring runs the solver and shows a GREEN/RED verdict popup; approved
 * sites can be saved from the popup as Targets D/E/F (max 3).
 *
 * The talonfitAiSolve solver is the single source of truth for: m_eff
 * logic, fall-zone multiplier, setback, height limit, external structure,
 * separation, PE reduction, and save-site logic. Turf.js handles ring
 * generation and point-in-polygon click gating on the map.
 */
export default function TalonFit() {
  const [centerLat, setCenterLat] = useState("");
  const [centerLon, setCenterLon] = useState("");
  const [heightFt, setHeightFt] = useState(199);
  const [anchor, setAnchor] = useState(null);
  const [probe, setProbe] = useState(null);
  const [autoTargets, setAutoTargets] = useState([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [solveResult, setSolveResult] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const nextLetter = saved.length < MAX_SAVED ? LETTERS[saved.length] : null;

  const handleSetCenter = useCallback(() => {
    const lat = parseFloat(centerLat);
    const lon = parseFloat(centerLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError("Enter valid latitude and longitude.");
      return;
    }
    setError("");
    setAnchor({ lat, lon, label: `${lat.toFixed(6)}, ${lon.toFixed(6)}` });
    setProbe(null);
    setAutoTargets([]);
    setSaved([]);
    setSolveResult(null);
  }, [centerLat, centerLon]);

  // ── Auto-select 3 targets: solve at 3 points around the ring ──
  const handleAutoSelect = useCallback(async () => {
    if (!anchor) return;
    setAutoLoading(true);
    setAutoTargets([]);
    const points = generateAutoPoints(anchor.lat, anchor.lon);
    const results = await Promise.all(
      points.map(async (pt, _i) => {
        try {
          const { data } = await base44.functions.invoke("talonfitAiSolve", {
            lat: pt.lat,
            lon: pt.lon,
            center_lat: anchor.lat,
            center_lon: anchor.lon,
            requested_height_ft: Number(heightFt) || 199,
            compound_width_ft: 100,
            compound_depth_ft: 100,
            saved_count: 0,
          });
          const cp = data?.candidate_point || pt;
          const r = data?.calculated_result || {};
          return {
            lat: cp.latitude,
            lon: cp.longitude,
            solving: false,
            solve: data,
            decision: r.decision,
          };
        } catch {
          return { lat: pt.lat, lon: pt.lon, solving: false, solve: null, decision: "VERIFY" };
        }
      })
    );
    setAutoTargets(results);
    setAutoLoading(false);
  }, [anchor, heightFt]);

  // ── Probe: single-click on map → solve ──
  const handleProbe = useCallback(async ({ lat, lon }) => {
    if (!anchor) return;
    setProbe({ lat, lon, solving: true, solve: null });
    try {
      const { data } = await base44.functions.invoke("talonfitAiSolve", {
        lat,
        lon,
        center_lat: anchor.lat,
        center_lon: anchor.lon,
        requested_height_ft: Number(heightFt) || 199,
        compound_width_ft: 100,
        compound_depth_ft: 100,
        saved_count: saved.length,
      });
      setSolveResult(data);
      const cp = data?.candidate_point || { latitude: lat, longitude: lon };
      setProbe({
        lat: cp.latitude,
        lon: cp.longitude,
        solving: false,
        solve: data,
        agentThinking: true,
        agentAnalysis: null,
      });
      // Agent analysis — the WHY behind the numbers
      invokeTalonfitAgent({
        lat: cp.latitude,
        lon: cp.longitude,
        heightFt: Number(heightFt) || 199,
        centerLat: anchor.lat,
        centerLon: anchor.lon,
        solveResult: data,
      })
        .then((analysis) => {
          setProbe((prev) =>
            prev && prev.lat === cp.latitude && prev.lon === cp.longitude
              ? { ...prev, agentThinking: false, agentAnalysis: analysis }
              : prev
          );
        })
        .catch(() => {
          setProbe((prev) =>
            prev && prev.lat === cp.latitude && prev.lon === cp.longitude
              ? { ...prev, agentThinking: false, agentAnalysis: null }
              : prev
          );
        });
    } catch (e) {
      setProbe({ lat, lon, solving: false, solve: null, error: e?.message || "Solver failed" });
    }
  }, [anchor, heightFt, saved.length]);

  // ── Save: from the Save button in the verdict popup ──
  // Creates a ScipRecord for APPROVED sites so they enter the SCIP pipeline.
  const handleSave = useCallback(async () => {
    if (!probe || saved.length >= MAX_SAVED || saving) return;
    const solve = probe.solve;
    if (!solve) return;
    const r = solve.calculated_result || {};
    // Rejected sites are never saved — the popup shows no save button and
    // this guard is the second line of defense.
    if ((r.decision || r.verdict || "").toString().toUpperCase() === "REJECTED") return;
    setSaving(true);
    try {
      const p = solve.parcel || {};
      const d = solve.parcel_details || {};
      const o = solve.ordinance_rules || {};
      const letter = LETTERS[saved.length] || "X";
      const newSite = {
        latitude: probe.lat,
        longitude: probe.lon,
        decision: r.decision || "VERIFY",
        maxHeight: r.maximum_buildable_height_ft ?? null,
        bindingConstraint: r.binding_constraint || "",
        ordinanceSection: o.ordinance_section || "",
        ordinanceVerified: o.ordinance_data_verified === true,
        address: p.address || "",
        apn: p.parcel_id || "",
        owner: d.owner || "",
        acreage: d.acreage ?? null,
        zoning: p.zoning_classification || "",
        agentAnalysis: probe.agentAnalysis || "",
        solve: solve,
        // Raw solver payload, normalized for the saved-targets tray
        parcel: {
          ...p,
          owner_name: p.owner_name || d.owner || "",
          apn: p.apn || p.parcel_id || "",
          acreage: p.acreage ?? d.acreage ?? null,
          zoning: p.zoning || o.zoning_district || p.zoning_classification || "",
        },
        calculated_result: {
          ...r,
          max_buildable_height_ft: r.max_buildable_height_ft ?? r.maximum_buildable_height_ft ?? null,
        },
        savedAt: new Date().toISOString(),
      };
      setSaved((prev) => [...prev, newSite]);
      setProbe(null);

      // Auto-create a ScipRecord for APPROVED sites — enters the SCIP pipeline
      // with the full decision verdict, H_MAX(p), and all constraints.
      if (r.decision === "APPROVED") {
        try {
          const user = await base44.auth.me();
          const today = new Date().toISOString().split("T")[0];
          await base44.entities.ScipRecord.create({
            agent_name: user?.full_name || "SiteHawk User",
            agent_phone: user?.phone || "",
            agent_email: user?.email || "",
            submittal_date: today,
            site_name: `TalonFit-${letter}-${probe.lat.toFixed(6)},${probe.lon.toFixed(6)}`,
            latitude: probe.lat,
            longitude: probe.lon,
            search_radius: "1.00",
            sarf_height: Number(heightFt) || 199,
            county: d.county || "",
            state: d.state || "",
            parcel_targets: [{
              label: `Target ${letter}`,
              owner_name: d.owner || "",
              parcel_address: p.address || "",
              apn: p.parcel_id || "",
              acreage: d.acreage ?? null,
              latitude: probe.lat,
              longitude: probe.lon,
              zoning_classification: p.zoning_classification || "",
              talonfit_data: {
                decision: r.decision,
                max_height_ft: r.maximum_buildable_height_ft ?? null,
                binding_constraint: r.binding_constraint || "",
                ordinance_section: o.ordinance_section || "",
                ordinance_source_url: o.ordinance_source_url || "",
                ordinance_verified: o.ordinance_data_verified === true,
                agent_analysis: probe.agentAnalysis || "",
                solved_at: new Date().toISOString(),
              },
            }],
            active_target_index: 0,
            zoning_jurisdiction: p.jurisdiction || "",
            zoning_report: {
              height_limit: { value: o.maximum_tower_height_ft, source: "TalonFit™ Ordinance Registry", confidence: o.ordinance_data_verified ? "verified" : "unverified" },
              setback: { value: o.property_line_rule?.fixed_distance_ft, source: "TalonFit™ Ordinance Registry", confidence: o.property_line_rule?.data_status === "verified" ? "verified" : "unverified" },
              fall_zone: { value: r.effective_fall_zone_multiplier, source: "TalonFit™ Solver", confidence: "computed" },
              tower_separation: { value: o.tower_separation?.required_distance_ft, source: "TalonFit™ Ordinance Registry", confidence: o.tower_separation?.data_status === "verified" ? "verified" : "unverified" },
              structure_separation: { value: o.structure_separation?.required_distance_ft, source: "TalonFit™ Ordinance Registry", confidence: o.structure_separation?.data_status === "verified" ? "verified" : "unverified" },
              pe_letter_required: { value: r.pe_letter_required, source: "TalonFit™ Solver", confidence: "computed" },
              binding_constraint: { value: r.binding_constraint, source: "TalonFit™ Solver", confidence: "computed" },
              max_buildable_height: { value: r.maximum_buildable_height_ft, source: "TalonFit™ Solver", confidence: "computed" },
            },
            status: "draft",
          });
        } catch (e) {
          console.warn("ScipRecord auto-create failed:", e?.message || String(e));
        }
      }
    } finally {
      setSaving(false);
    }
  }, [probe, saved.length, saving, heightFt]);

  // ── Remove a saved target (tray × button) ──
  const handleRemoveSaved = useCallback((index) => {
    setSaved((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Reset: clear probes and auto-targets, keep saved sites ──
  const handleReset = useCallback(() => {
    setProbe(null);
    setAutoTargets([]);
    setError("");
    setSolveResult(null);
  }, []);

  return (
    <div className="flex w-full flex-col">
      {/* ── Top control bar ── */}
      <div className="flex h-12 w-full shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400">Latitude</label>
          <input
            type="number"
            step="0.000001"
            value={centerLat}
            onChange={(e) => setCenterLat(e.target.value)}
            placeholder="e.g. 28.0836"
            className="w-32 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-100"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400">Longitude</label>
          <input
            type="number"
            step="0.000001"
            value={centerLon}
            onChange={(e) => setCenterLon(e.target.value)}
            placeholder="e.g. -80.7553"
            className="w-32 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-100"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-slate-400">Tower Height (ft)</label>
          <input
            type="number"
            min="50"
            max="500"
            value={heightFt}
            onChange={(e) => setHeightFt(e.target.value)}
            className="w-32 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-100"
          />
        </div>
        <div className="self-end">
          <button
            onClick={handleSetCenter}
            className="rounded bg-cyan-600 px-3 py-1 text-xs font-bold text-white hover:bg-cyan-500"
          >
            Set Ring
          </button>
        </div>
        <div className="self-end">
          <button
            onClick={handleAutoSelect}
            disabled={!anchor || autoLoading}
            className="rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-40"
          >
            {autoLoading ? "Selecting…" : "Auto-Select D/E/F"}
          </button>
        </div>
        {error && <span className="ml-auto text-xs text-red-400">{error}</span>}
      </div>

      {/* ── Data panel + map — the map is the entire experience ── */}
      <div style={{ height: "calc(100vh - 48px)" }} className="flex">
        <TalonFitDataPanel
          solveResult={solveResult}
          towerHeightFt={heightFt}
          lat={anchor?.lat}
          lon={anchor?.lon}
          saved={saved}
          isOpen={panelOpen}
          onToggle={() => setPanelOpen((p) => !p)}
        />
        <div className="relative h-full flex-1">
          <TalonFitMap
            anchor={anchor}
            radiusMiles={RADIUS_MILES}
            probe={probe}
            saved={saved}
            autoTargets={autoTargets}
            onProbe={handleProbe}
            onSave={handleSave}
            saving={saving}
            nextLetter={nextLetter}
            heightFt={heightFt}
            onReset={handleReset}
            solveResult={solveResult}
          />

          {/* ── Saved targets tray — bottom of map, always visible ── */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-3 items-center">
            {LETTERS.map((letter, i) => {
              const site = saved[i];
              return (
                <div
                  key={letter}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border shadow-lg ${
                    site
                      ? "bg-emerald-900/90 border-emerald-600 text-emerald-100"
                      : "bg-slate-900/80 border-slate-700 text-slate-500"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      site ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {letter}
                  </span>
                  {site ? (
                    <>
                      <div>
                        <div className="font-medium">{site.parcel?.owner_name || site.address || "Parcel " + letter}</div>
                        <div className="text-emerald-400">
                          {site.calculated_result?.max_buildable_height_ft || 199} ft · {site.parcel?.zoning || "—"}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveSaved(i)}
                        className="ml-1 text-slate-400 hover:text-red-400 text-base leading-none"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <span>Target {letter} — click a parcel</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
