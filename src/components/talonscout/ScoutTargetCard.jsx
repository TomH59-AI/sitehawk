import { Loader2, Save, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const STYLES = {
  fit: "border-green-600/40 bg-green-600/5",
  ejected: "border-destructive/40 bg-destructive/5",
  verify: "border-amber-500/40 bg-amber-500/5",
  pending: "border-border bg-card",
};

const BADGE = {
  fit: "bg-green-600 text-white",
  ejected: "bg-transparent text-red-600 border border-red-600",
  verify: "bg-amber-500 text-white",
  pending: "bg-secondary text-secondary-foreground",
};

// One graded candidate point: letter, coordinates, allowed height or EJECTED reason.
export default function ScoutTargetCard({ target, active, onSelect, onSave, onRemove }) {
  const v = target.verdict;
  const label = v === "fit" ? `${target.max_height_ft} FT ALLOWED` : v === "ejected" ? "EJECTED" : v === "verify" ? "VERIFY" : "SCREENING…";

  return (
    <div
      onClick={() => onSelect(target.id)}
      className={`cursor-pointer rounded-xl border p-3 transition-shadow ${STYLES[v] || STYLES.pending} ${active ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold text-foreground">
          {target.letter}
        </span>
        <span className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${BADGE[v] || BADGE.pending}`}>
          {v === "pending" ? <Loader2 className="inline h-3 w-3 animate-spin" /> : label}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {target.lat.toFixed(5)}, {target.lon.toFixed(5)}
        </span>
      </div>

      {target.reason && <p className="mt-1.5 text-xs leading-snug text-foreground">{target.reason}</p>}
      {target.binding_constraint && (
        <p className="mt-1 text-[11px] text-muted-foreground">Binding constraint: {target.binding_constraint}</p>
      )}

      {target.parcel && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {target.parcel.address && <div className="col-span-2 truncate">{target.parcel.address}</div>}
          {target.parcel.apn && <div>APN {target.parcel.apn}</div>}
          {target.parcel.acreage != null && <div>{target.parcel.acreage} ac</div>}
          <div>Zoning: {target.parcel.zoning || "unverified"}</div>
          {target.edge_distance_ft != null && <div>{target.edge_distance_ft} ft to line</div>}
          {target.ordinance?.jurisdiction && <div className="col-span-2">{target.ordinance.jurisdiction}</div>}
        </dl>
      )}

      {target.unverified_fields?.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-600">Unverified: {target.unverified_fields.join(", ")}</p>
      )}

      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant={target.saved ? "secondary" : "default"}
          disabled={target.verdict === "pending" || target.saving || target.saved}
          onClick={(e) => { e.stopPropagation(); onSave(target.id); }}
          className="gap-1.5"
        >
          {target.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : target.saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {target.saved ? "Saved" : "Save target"}
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onRemove(target.id); }} className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>
    </div>
  );
}