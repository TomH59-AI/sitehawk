import { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Crosshair, Zap, Loader2, MapPin } from "lucide-react";
import TalonFitMap from "@/components/talonfit/TalonFitMap";
import TalonFitSavedSites from "@/components/talonfit/TalonFitSavedSites";
import { invokeTalonfitAgent } from "@/lib/talonfitAgent";

const RADIUS_MILES = 2;
const MAX_SAVED = 3;
const LETTERS = ["A", "B", "C"];

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
 * TalonFIT™ (Patent Pending) — the single unified tower-siting engine.
 *
 * A standalone page with a 2-mile search ring centered on user coordinates.
 * Three auto-selected targets are graded immediately; the user can click
 * three more points for smart-cursor TalonFit-AI-1.0 grading. Up to 3 sites
 * can be saved via double-click. GREEN tower icons mark approved sites;
 * RED icons mark rejected sites. All computed constraints are displayed.
 *
 * Uses the TalonFit-AI-1.0 solver (talonfitAiSolve) as the single source of
 * truth for: m_eff logic, fall-zone multiplier, setback, height limit,
 * external structure, separation, PE reduction, and save-site logic.
 * Turf.js handles parcel buffer, fall-zone circle, containment check, and
 * search ring generation on the map.
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
  }, [centerLat, centerLon]);

  // ── Auto-select 3 targets: solve at 3 points around the ring ──
  const handleAutoSelect = useCallback(async () => {
    if (!anchor) return;
    setAutoLoading(true);
    setAutoTargets([]);
    const points = generateAutoPoints(anchor.lat, anchor.lon);
    const results = await Promise.all(
      points.map(async (pt, i) => {
        try {
          const { data } = await base44.functions.invoke("talonfitAiSolve", {
            lat: pt.lat,
            lon: pt.lon,
            center_lat: anchor.lat,
            center_lon: anchor.lon,
            requested_height_ft: Number(heightFt) || 150,
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
    setProbe({ lat, lon, solving: true, solve: null });
    try {
      const { data } = await base44.functions.invoke("talonfitAiSolve", {
        lat,
        lon,
        center_lat: anchor.lat,
        center_lon: anchor.lon,
        requested_height_ft: Number(heightFt) || 150,
        compound_width_ft: 100,
        compound_depth_ft: 100,
        saved_count: saved.length,
      });
      const cp = data?.candidate_point || { latitude: lat, longitude: lon };
      setProbe({
        lat: cp.latitude,
        lon: cp.longitude,
        solving: false,
        solve: data,
        agentThinking: true,
        agentAnalysis: null,
      });
      // TalonFit® agent analysis — the WHY behind the numbers
      invokeTalonfitAgent({
        lat: cp.latitude,
        lon: cp.longitude,
        heightFt: Number(heightFt) || 150,
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

  // ── Save: double-click on map (or Save button in popup) ──
  const handleSave = useCallback(async (clickLat, clickLon) => {
    if (!probe || saved.length >= MAX_SAVED || saving) return;
    const solve = probe.solve;
    if (!solve) return;
    setSaving(true);
    try {
      const r = solve.calculated_result || {};
      const p = solve.parcel || {};
      const d = solve.parcel_details || {};
      const o = solve.ordinance_rules || {};
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
        savedAt: new Date().toISOString(),
      };
      setSaved((prev) => [...prev, newSite]);
      setProbe(null);
    } finally {
      setSaving(false);
    }
  }, [probe, saved.length, saving]);

  const handleRemove = useCallback((index) => {
    setSaved((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-8">
      {/* ── Header ── */}
      <header>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="font-heading text-2xl text-foreground">TalonFIT™</h1>
          <span className="text-xs font-medium text-muted-foreground">Patent Pending</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The unified tower-siting engine. Enter coordinates to center a {RADIUS_MILES}-mile search ring,
          auto-select 3 targets, then click anywhere to probe. Double-click to save up to {MAX_SAVED} sites.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Screening tool only — ordinance readings and fit results are not a substitute for a PE-stamped
          drawing or the jurisdiction's own determination.
        </p>
      </header>

      {/* ── Coordinate input + controls ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground">Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={centerLat}
              onChange={(e) => setCenterLat(e.target.value)}
              placeholder="e.g. 28.0836"
              className="w-36 rounded-md border border-input bg-secondary px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground">Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={centerLon}
              onChange={(e) => setCenterLon(e.target.value)}
              placeholder="e.g. -80.7553"
              className="w-36 rounded-md border border-input bg-secondary px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-muted-foreground">Tower height (ft)</label>
            <input
              type="number"
              min="50"
              max="500"
              value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
              className="w-24 rounded-md border border-input bg-secondary px-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={handleSetCenter}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <Crosshair className="h-4 w-4" /> Set Search Ring
          </button>
          {anchor && (
            <button
              onClick={handleAutoSelect}
              disabled={autoLoading}
              className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {autoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Auto-Select 3 Targets
            </button>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>

      {/* ── Map + Saved sites ── */}
      {anchor ? (
        <div className="grid gap-0 rounded-xl border border-border bg-card lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TalonFitMap
              anchor={anchor}
              radiusMiles={RADIUS_MILES}
              probe={probe}
              saved={saved}
              autoTargets={autoTargets}
              onProbe={handleProbe}
              onSave={handleSave}
              canSave={saved.length < MAX_SAVED && !saving}
              saving={saving}
              nextLetter={nextLetter}
              heightFt={heightFt}
            />
          </div>
          <div className="border-t border-border lg:border-l lg:border-t-0">
            <TalonFitSavedSites sites={saved} onRemove={handleRemove} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Enter latitude and longitude above to center a {RADIUS_MILES}-mile search ring.
        </div>
      )}
    </div>
  );
}