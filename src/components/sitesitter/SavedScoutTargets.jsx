import { MapPin, Trash2, FileText } from "lucide-react";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const verdictBg = (decision) => {
  if (decision === "APPROVED") return "bg-green-100 text-green-800";
  if (decision === "REJECTED") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
};

/**
 * SavedScoutTargets — shows all TalonFit-graded targets (A–F) saved on the
 * active ScipRecord, with their full data "filled in waiting" (verdict, max
 * height, ordinance citation, parcel, owner). Each target has a SCIP button
 * that sets active_target_index and navigates to the SCIP document.
 */
export default function SavedScoutTargets({ targets, onRemove, onScip }) {
  return (
    <div className="flex h-full flex-col p-3">
      <div className="pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        TalonFit™ Targets
      </div>
      {targets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No targets yet. Click a point on the map — Target A is your first pick. Data stays here
          when you come back for SCIP B, C, or D.
        </p>
      ) : (
        <div className="space-y-2">
          {targets.map((t, i) => {
            const tf = t.talonfit_data || {};
            return (
              <div key={i} className="rounded-lg border border-border bg-muted/40 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> Target {LETTERS[i]}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Remove target"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {tf.decision && (
                  <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${verdictBg(tf.decision)}`}>
                    {tf.decision}
                    {Number.isFinite(tf.max_height_ft) ? ` · max ${tf.max_height_ft} ft` : ""}
                  </div>
                )}

                <div className="mt-1 text-xs text-foreground">
                  {t.parcel_address || "No address on record"}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  {Number(t.latitude).toFixed(6)}, {Number(t.longitude).toFixed(6)}
                  {t.apn ? ` · APN ${t.apn}` : ""}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {t.zoning_classification ? `${t.zoning_classification} · ` : ""}
                  {t.owner_name ? `Owner: ${t.owner_name}` : "Owner: No data available"}
                </div>

                {tf.binding_constraint && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Binding: {tf.binding_constraint}
                  </div>
                )}
                {tf.ordinance_section && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Cite: {tf.ordinance_section}
                    {tf.ordinance_verified ? " (verified)" : " (unverified)"}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onScip(i)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <FileText className="h-3 w-3" /> SCIP Target {LETTERS[i]}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}