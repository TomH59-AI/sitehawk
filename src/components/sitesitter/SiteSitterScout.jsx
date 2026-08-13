import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Crosshair } from "lucide-react";
import SiteSitterScoutMap from "./SiteSitterScoutMap";
import SavedScoutTargets from "./SavedScoutTargets";

const MAX_EXTRA = 3;
const LETTERS = ["D", "E", "F"];
const RADIUS_MILES = 2;

/**
 * SiteSitterScout — "Explore More Targets" on the SiteSitter dashboard.
 * Anchored to the user's latest SCIP search ring center, with a LARGER
 * exploration radius (5 miles). Every click is graded by TalonFit-AI-1.0,
 * which pulls the parcel from Realie and zoning rules from the SiteHawk
 * ordinance registry (same zoning process as SCIP Section 2). The user can
 * save up to three extra targets (D/E/F) from the popup.
 */
export default function SiteSitterScout() {
  const [anchor, setAnchor] = useState(null);
  const [loadingAnchor, setLoadingAnchor] = useState(true);
  const [heightFt, setHeightFt] = useState(150);
  const [probe, setProbe] = useState(null);
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Anchor on the latest SCIP search ring; if none, fall back to the most
    // recent scored site (the same coordinates driving this dashboard).
    const mk = (lat, lon, label) => ({
      lat,
      lon,
      label,
      key: `${lat.toFixed(4)},${lon.toFixed(4)}`,
    });
    base44.entities.ScipRecord.list("-updated_date", 1)
      .then(async (rows) => {
        const r = rows?.[0];
        if (r && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) {
          setAnchor(mk(r.latitude, r.longitude, r.site_name || "Search Ring Center"));
          return;
        }
        const runs = await base44.entities.TalonFitRunLog.list("-run_timestamp_utc", 1);
        const run = runs?.[0];
        if (run && Number.isFinite(run.latitude) && Number.isFinite(run.longitude)) {
          setAnchor(mk(run.latitude, run.longitude, run.jurisdiction || "your last scored site"));
        }
      })
      .finally(() => setLoadingAnchor(false));
  }, []);

  useEffect(() => {
    if (!anchor) return;
    base44.entities.SiteCandidate.list("-created_date", 100).then((rows) => {
      setSaved(
        (rows || [])
          .filter((c) => c?.field_provenance?.sitesitter_scout?.anchor_key === anchor.key)
          .slice(0, MAX_EXTRA)
      );
    });
  }, [anchor]);

  const handleProbe = async ({ lat, lon }) => {
    setProbe({ lat, lon, solving: true, solve: null });
    try {
      const { data } = await base44.functions.invoke("talonfitAiSolve", {
        lat,
        lon,
        center_lat: lat,
        center_lon: lon,
        requested_height_ft: Number(heightFt) || 150,
        compound_width_ft: 100,
        compound_depth_ft: 100,
        saved_count: saved.length,
      });
      const pt = data?.candidate_point || { latitude: lat, longitude: lon };
      setProbe({ lat: pt.latitude, lon: pt.longitude, solving: false, solve: data });
    } catch (e) {
      setProbe({ lat, lon, solving: false, solve: null, error: e?.message || "Solver failed" });
    }
  };

  const handleSave = async () => {
    const solve = probe?.solve;
    if (!solve || saved.length >= MAX_EXTRA || saving) return;
    setSaving(true);
    try {
      const p = solve.parcel || {};
      const d = solve.parcel_details || {};
      const r = solve.calculated_result || {};
      const o = solve.ordinance_rules || {};
      const now = new Date().toISOString();
      const created = await base44.entities.SiteCandidate.create({
        site_label: `Target ${LETTERS[saved.length]} — ${p.address || `${probe.lat.toFixed(6)}, ${probe.lon.toFixed(6)}`}`,
        address: p.address || "",
        latitude: probe.lat,
        longitude: probe.lon,
        apn: p.parcel_id || "",
        owner_name: d.owner || "",
        ...(Number.isFinite(Number(d.acreage)) ? { acreage: Number(d.acreage) } : {}),
        zoning_code: p.zoning_classification || "",
        jurisdiction: p.jurisdiction || "",
        ...(p.geometry ? { parcel_geometry: p.geometry } : {}),
        ordinance: {
          height_limit_ft: o.maximum_tower_height_ft ?? null,
          source_ref: o.ordinance_section || null,
          source_url: o.ordinance_source_url || null,
          verified: o.ordinance_data_verified === true,
        },
        fit: {
          max_height_ft: r.maximum_buildable_height_ft ?? null,
          binding_constraint: r.binding_constraint || null,
          feasible: r.decision === "APPROVED",
          decision: r.decision || null,
        },
        field_provenance: { sitesitter_scout: { anchor_key: anchor.key, saved_at: now } },
        status: r.decision === "APPROVED" ? "qualified" : "partially_qualified",
        qualified_at: now,
      });
      setSaved((prev) => [...prev, created]);
      setProbe(null);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id) => {
    await base44.entities.SiteCandidate.delete(id);
    setSaved((prev) => prev.filter((c) => c.id !== id));
  };

  if (loadingAnchor) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Crosshair className="h-4 w-4 text-primary" /> Explore More Targets
        </div>
        <span className="text-xs text-muted-foreground">
          {anchor
            ? `${RADIUS_MILES}-mile exploration radius around ${anchor.label}. Click any point — parcel from Realie, zoning from the SiteHawk ordinance registry.`
            : "No search ring found — generate a SCIP first to anchor this map."}
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
            Saved {saved.length}/{MAX_EXTRA} extra targets
          </span>
        )}
      </div>

      {anchor && (
        <div className="grid gap-0 border-t border-border lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SiteSitterScoutMap
              anchor={anchor}
              radiusMiles={RADIUS_MILES}
              probe={probe}
              saved={saved}
              onProbe={handleProbe}
              onSave={handleSave}
              canSave={saved.length < MAX_EXTRA && !saving}
              saving={saving}
              nextLetter={LETTERS[saved.length] || null}
            />
          </div>
          <div className="border-t border-border lg:border-l lg:border-t-0">
            <SavedScoutTargets saved={saved} onRemove={handleRemove} />
          </div>
        </div>
      )}
    </section>
  );
}