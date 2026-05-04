import { CheckCircle2, XCircle, AlertTriangle, MapPin } from "lucide-react";

function fmtFt(v) { return v != null ? `${Math.round(v)} ft` : "—"; }
function fmtAc(v) { return v != null ? `${v.toFixed(2)} ac` : "—"; }

export default function PlacementResults({ analysis }) {
  if (!analysis) return null;
  if (!analysis.ok) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <h4 className="font-heading font-semibold text-destructive">Tower placement not feasible</h4>
            <p className="text-sm text-muted-foreground mt-1">{analysis.message}</p>
            {analysis.parcelDims && (
              <p className="text-xs text-muted-foreground mt-2">
                Parcel: {Math.round(analysis.parcelDims.widthFt)} ft (E-W) × {Math.round(analysis.parcelDims.depthFt)} ft (N-S) · Required setback: {analysis.setbackFt} ft on every side.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">Try reducing tower height or selecting a larger parcel.</p>
          </div>
        </div>
      </div>
    );
  }

  const { setbackFt, towerHeightFt, towerType, compoundSizeFt, placement, distances, compliance, compoundEdges, accessEasement, areas, warnings, validZone } = analysis;
  const towerLabel = { self_support: "Self-Support Tower (SST)", monopole: "Monopole", guyed: "Guyed Tower" }[towerType] || towerType;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${analysis.compliant ? "bg-emerald-500/5 border-emerald-500/30" : "bg-amber-500/5 border-amber-500/30"}`}>
        <div className="flex items-start gap-3">
          {analysis.compliant ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
          <div>
            <h4 className="font-heading font-semibold text-foreground">
              {analysis.compliant ? "Placement is COMPLIANT" : "Placement requires review"}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              {towerLabel} · {towerHeightFt} ft · {compoundSizeFt}×{compoundSizeFt} compound · Required fall-zone setback: {setbackFt} ft on every property line
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h4 className="font-heading font-semibold text-sm text-foreground">Recommended Tower Base Coordinates</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Latitude</p>
            <p className="font-mono font-bold text-foreground">{placement.lat.toFixed(6)}° N</p>
          </div>
          <div>
            <p className="text-muted-foreground">Longitude</p>
            <p className="font-mono font-bold text-foreground">{Math.abs(placement.lon).toFixed(6)}° W</p>
          </div>
          <div className="col-span-2">
            <p className="text-muted-foreground">Quadrant · Datum</p>
            <p className="text-foreground"><span className="font-semibold">{placement.cornerLabel}</span> · WGS84 / NAD83 (±5 m — field survey required)</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="font-heading font-semibold text-sm text-foreground mb-3">Setback & Fall Zone Distances</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <SetbackTile dir="North" distFt={distances.north_ft} requiredFt={setbackFt} ok={compliance.north} />
          <SetbackTile dir="South" distFt={distances.south_ft} requiredFt={setbackFt} ok={compliance.south} />
          <SetbackTile dir="East"  distFt={distances.east_ft}  requiredFt={setbackFt} ok={compliance.east} />
          <SetbackTile dir="West"  distFt={distances.west_ft}  requiredFt={setbackFt} ok={compliance.west} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Valid Placement Zone</h4>
          <p className="text-xs text-foreground">After applying {setbackFt}-ft setbacks on all sides:</p>
          <p className="font-mono text-sm text-foreground mt-1">
            {fmtFt(validZone.zone.widthFt)} (E-W) × {fmtFt(validZone.zone.depthFt)} (N-S)
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="font-heading font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">Compound Edge Clearances</h4>
          <ul className="text-xs text-foreground space-y-1">
            <li>N edge → property line: <span className="font-mono">{fmtFt(compoundEdges.north_ft)}</span></li>
            <li>S edge → property line: <span className="font-mono">{fmtFt(compoundEdges.south_ft)}</span></li>
            <li>E edge → property line: <span className="font-mono">{fmtFt(compoundEdges.east_ft)}</span></li>
            <li>W edge → property line: <span className="font-mono">{fmtFt(compoundEdges.west_ft)}</span></li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="font-heading font-semibold text-sm text-foreground mb-3">Encumbrance Summary</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <AreaTile label="Total Parcel" value={fmtAc(areas.totalAcres)} />
          <AreaTile label="Compound Lease" value={fmtAc(areas.compoundAcres)} />
          <AreaTile label="Access Easement" value={`${Math.round((accessEasement.areaSf || 0))} sf`} />
          <AreaTile label="Owner Retained" value={`${fmtAc(areas.ownerRetainedAcres)} (${areas.ownerRetainedPct.toFixed(1)}%)`} highlight />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <h4 className="font-heading font-semibold text-sm text-foreground">Engineering & Permitting Notes</h4>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function SetbackTile({ dir, distFt, requiredFt, ok }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5"}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{dir}</p>
      <p className={`font-mono text-sm font-bold ${ok ? "text-emerald-500" : "text-destructive"}`}>
        {fmtFt(distFt)} {ok ? "✓" : "✗"}
      </p>
      <p className="text-[10px] text-muted-foreground">Req: {requiredFt} ft</p>
    </div>
  );
}

function AreaTile({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-primary/30 bg-primary/5" : "border-border"}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`font-mono text-sm font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}