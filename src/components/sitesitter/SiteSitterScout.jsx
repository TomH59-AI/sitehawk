import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Crosshair, ChevronDown } from "lucide-react";
import SiteSitterScoutMap from "./SiteSitterScoutMap";
import SavedScoutTargets from "./SavedScoutTargets";
import { invokeTalonfitAgent } from "@/lib/talonfitAgent";

const MAX_TARGETS = 6;
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const RADIUS_MILES = 2;

/**
 * TalonFit™ Target Selector — the primary target selection flow.
 *
 * Anchored to a ScipRecord (SARF search ring). The user clicks any point in
 * the 2-mile radius; TalonFit-AI-1.0 grades it and the result is saved
 * directly onto the ScipRecord's parcel_targets array (Target A first, then
 * B, C, D, E, F). Data persists so when the user returns for SCIP B or C,
 * everything is already filled in waiting.
 *
 * Up to 6 targets per search ring. The user can SCIP any target by setting
 * active_target_index. Site recall by original name + coordinates via the
 * "Recall a previous search ring" dropdown.
 */
export default function SiteSitterScout() {
  const [scipRecord, setScipRecord] = useState(null);
  const [scipRecords, setScipRecords] = useState([]);
  const [loadingAnchor, setLoadingAnchor] = useState(true);
  const [heightFt, setHeightFt] = useState(150);
  const [probe, setProbe] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showRecall, setShowRecall] = useState(false);

  useEffect(() => {
    base44.entities.ScipRecord.list("-updated_date", 50)
      .then((rows) => {
        setScipRecords(rows || []);
        if (rows?.[0]) setScipRecord(rows[0]);
      })
      .finally(() => setLoadingAnchor(false));
  }, []);

  const targets = scipRecord?.parcel_targets || [];
  const nextLetter = targets.length < MAX_TARGETS ? LETTERS[targets.length] : null;

  const anchor = scipRecord
    ? {
        lat: scipRecord.latitude,
        lon: scipRecord.longitude,
        label: scipRecord.site_name || "Search Ring Center",
        key: `${Number(scipRecord.latitude).toFixed(4)},${Number(scipRecord.longitude).toFixed(4)}`,
      }
    : null;

  // Transform parcel_targets into the marker format the map expects
  const mapSaved = targets.map((t, i) => ({
    id: `${scipRecord.id}-${i}`,
    latitude: t.latitude,
    longitude: t.longitude,
    fit: { feasible: t.talonfit_data?.decision === "APPROVED" },
  }));

  const handleProbe = async ({ lat, lon }) => {
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
        saved_count: targets.length,
      });
      const pt = data?.candidate_point || { latitude: lat, longitude: lon };
      setProbe({
        lat: pt.latitude,
        lon: pt.longitude,
        solving: false,
        solve: data,
        agentThinking: true,
        agentAnalysis: null,
      });
      invokeTalonfitAgent({
        lat: pt.latitude,
        lon: pt.longitude,
        heightFt: Number(heightFt) || 150,
        centerLat: anchor.lat,
        centerLon: anchor.lon,
        solveResult: data,
      })
        .then((analysis) => {
          setProbe((prev) =>
            prev && prev.lat === pt.latitude && prev.lon === pt.longitude
              ? { ...prev, agentThinking: false, agentAnalysis: analysis }
              : prev
          );
        })
        .catch(() => {
          setProbe((prev) =>
            prev && prev.lat === pt.latitude && prev.lon === pt.longitude
              ? { ...prev, agentThinking: false, agentAnalysis: null }
              : prev
          );
        });
    } catch (e) {
      setProbe({ lat, lon, solving: false, solve: null, error: e?.message || "Solver failed" });
    }
  };

  const handleSave = async () => {
    const solve = probe?.solve;
    if (!solve || targets.length >= MAX_TARGETS || saving) return;
    setSaving(true);
    try {
      const p = solve.parcel || {};
      const d = solve.parcel_details || {};
      const r = solve.calculated_result || {};
      const o = solve.ordinance_rules || {};
      const newTarget = {
        label: `Target ${LETTERS[targets.length]}`,
        owner_name: d.owner || "",
        parcel_address: p.address || "",
        apn: p.parcel_id || "",
        ...(Number.isFinite(Number(d.acreage)) ? { acreage: Number(d.acreage) } : {}),
        zoning_classification: p.zoning_classification || "",
        latitude: probe.lat,
        longitude: probe.lon,
        talonfit_data: {
          decision: r.decision || "",
          max_height_ft: r.maximum_buildable_height_ft ?? null,
          binding_constraint: r.binding_constraint || "",
          ordinance_section: o.ordinance_section || "",
          ordinance_source_url: o.ordinance_source_url || "",
          ordinance_verified: o.ordinance_data_verified === true,
          agent_analysis: probe.agentAnalysis || "",
          solved_at: new Date().toISOString(),
        },
      };
      const updatedTargets = [...targets, newTarget];
      const updated = await base44.entities.ScipRecord.update(scipRecord.id, {
        parcel_targets: updatedTargets,
      });
      setScipRecord(updated);
      setProbe(null);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (index) => {
    const updatedTargets = targets.filter((_, i) => i !== index);
    const updated = await base44.entities.ScipRecord.update(scipRecord.id, {
      parcel_targets: updatedTargets,
    });
    setScipRecord(updated);
  };

  const handleScip = async (index) => {
    await base44.entities.ScipRecord.update(scipRecord.id, {
      active_target_index: index,
    });
    window.location.href = `/scip/${scipRecord.id}`;
  };

  const handleRecall = (record) => {
    setScipRecord(record);
    setShowRecall(false);
    setProbe(null);
  };

  if (loadingAnchor) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Crosshair className="h-4 w-4 text-primary" /> TalonFit™ Target Selector
        </div>
        <span className="text-xs text-muted-foreground">
          {anchor
            ? `${RADIUS_MILES}-mile exploration radius around ${anchor.label}. Click any point — Target A first, then B, C, D, E, F.`
            : "No search ring found — generate a SARF first to anchor this map."}
        </span>
        {anchor && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Tower height (ft)
            <input
              type="number"
              min="50"
              max="500"
              value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
              className="w-20 rounded-md border border-input bg-secondary px-2 py-1 text-xs"
            />
          </label>
        )}
        {anchor && (
          <span className="text-[11px] font-medium text-muted-foreground">
            {targets.length}/{MAX_TARGETS} targets · {MAX_TARGETS - targets.length} SCIP slots remaining
          </span>
        )}
      </div>

      {/* Site Recall — switch between search rings by name + coordinates */}
      {scipRecords.length > 1 && (
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={() => setShowRecall(!showRecall)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showRecall ? "rotate-180" : ""}`} />
            Recall a previous search ring ({scipRecords.length} sites)
          </button>
          {showRecall && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {scipRecords.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleRecall(r)}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all ${
                    r.id === scipRecord?.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/40 hover:bg-muted/60"
                  }`}
                >
                  <div className="font-semibold text-foreground">{r.site_name || "Unnamed"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {Number(r.latitude).toFixed(6)}, {Number(r.longitude).toFixed(6)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {anchor && (
        <div className="grid gap-0 border-t border-border lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SiteSitterScoutMap
              anchor={anchor}
              radiusMiles={RADIUS_MILES}
              probe={probe}
              saved={mapSaved}
              onProbe={handleProbe}
              onSave={handleSave}
              canSave={targets.length < MAX_TARGETS && !saving}
              saving={saving}
              nextLetter={nextLetter}
              heightFt={heightFt}
            />
          </div>
          <div className="border-t border-border lg:border-l lg:border-t-0">
            <SavedScoutTargets
              targets={targets}
              onRemove={handleRemove}
              onScip={handleScip}
              scipId={scipRecord?.id}
            />
          </div>
        </div>
      )}
    </section>
  );
}