import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Crosshair, Loader2, CheckCircle2 } from "lucide-react";
import ScoutRingMap from "@/components/talonscout/ScoutRingMap";

const VERDICT = { APPROVED: "fit", REJECTED: "ejected", VERIFY: "verify" };

/**
 * ChangeTargetCPanel — Target C is the LAST target in the pipeline, so the
 * subscriber gets to pick it themselves on the TalonFit map instead of taking
 * the scored candidate. Click a point inside the ring to grade it with the
 * TalonFit-AI-1.0 solver; if the parcel resolves, they can set it as Target C.
 * Whatever they land on is the parcel their final SCIP is generated from.
 */
export default function ChangeTargetCPanel({ center, proposal, onPick }) {
  const [probe, setProbe] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [applied, setApplied] = useState(false);
  const [solving, setSolving] = useState(false);

  const handleProbe = async ({ lat, lon }) => {
    setProbe({ lat, lon, verdict: "pending" });
    setCandidate(null);
    setApplied(false);
    setSolving(true);
    try {
      const { data } = await base44.functions.invoke("talonfitAiSolve", {
        lat,
        lon,
        center_lat: center.lat,
        center_lon: center.lon,
        requested_height_ft: proposal?.tower_height_ft || 150,
        compound_width_ft: 100,
        compound_depth_ft: 100,
        saved_count: 0,
      });
      const r = data?.calculated_result || {};
      setProbe({
        lat,
        lon,
        verdict: VERDICT[r.decision] || "verify",
        reason: r.reasons?.[0] || null,
        max_height_ft: r.maximum_buildable_height_ft ?? null,
      });
      const p = data?.parcel || null;
      const d = data?.parcel_details || null;
      // Never invent a parcel — only offer the swap when Realie actually
      // resolved a record at the clicked coordinate.
      if (p?.parcel_id || p?.address) {
        setCandidate({
          label: "Target C",
          latitude: lat,
          longitude: lon,
          apn: p.parcel_id || "",
          parcel_address: p.address || "",
          zoning_classification: p.zoning_classification || "",
          owner_name: d?.owner || "",
          acreage: d?.acreage ?? null,
          county: d?.county || "",
          state: d?.state || "",
          parcel_geometry: p.geometry || null,
          max_height_ft: r.maximum_buildable_height_ft ?? null,
          talonfit_decision: r.decision || null,
        });
      }
    } catch (e) {
      setProbe({ lat, lon, verdict: "verify", reason: e?.message || "Solver failed" });
    } finally {
      setSolving(false);
    }
  };

  const apply = () => {
    if (!candidate) return;
    onPick(candidate);
    setApplied(true);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Crosshair className="h-4 w-4 text-primary" /> Change Target C — TalonFit pick
        </div>
        <span className="text-xs text-muted-foreground">
          Click any point inside the ring to grade it. Targets A and B stay exactly as they are.
        </span>
      </div>

      <div className="border-t border-border bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700">
        Target C is your last target in this ring. Whichever parcel you set here is the one the SCIP button
        below builds — and that SCIP is the final one for this search ring.
      </div>

      <div className="border-t border-border">
        <ScoutRingMap
          center={{ lat: center.lat, lon: center.lon, label: "Search Ring Center" }}
          targets={[]}
          probe={probe}
          onProbe={handleProbe}
          onSave={handleProbe}
          onSelect={() => {}}
          canPick={!solving}
        />
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {solving && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Grading that coordinate with TalonFit-AI-1.0…
          </div>
        )}
        {!solving && probe && !candidate && (
          <p className="text-xs text-muted-foreground">
            No parcel record returned at {probe.lat.toFixed(6)}, {probe.lon.toFixed(6)} — pick another point.
          </p>
        )}
        {candidate && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="text-sm font-semibold text-foreground">
              {candidate.parcel_address || `${candidate.latitude.toFixed(6)}, ${candidate.longitude.toFixed(6)}`}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)}
              {candidate.apn ? ` · APN ${candidate.apn}` : ""}
              {candidate.owner_name ? ` · ${candidate.owner_name}` : ""}
              {candidate.acreage != null ? ` · ${candidate.acreage} ac` : ""}
              {candidate.zoning_classification ? ` · ${candidate.zoning_classification}` : ""}
            </div>
            {candidate.max_height_ft != null && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                TalonFit max buildable height: {candidate.max_height_ft} ft
                {candidate.talonfit_decision ? ` · ${candidate.talonfit_decision}` : ""}
              </div>
            )}
            <button
              type="button"
              onClick={apply}
              disabled={applied}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {applied ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {applied ? "Set as Target C — maps rerun below" : "Use this as Target C"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}