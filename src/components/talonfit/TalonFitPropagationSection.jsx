import { Signal } from "lucide-react";
import Section8Propagation from "@/components/search/Section8Propagation";

/**
 * Propagation map for the TalonFit candidate currently selected. Reuses the
 * existing CloudRF-backed Section8Propagation component so coverage modeling
 * behaves identically to the SCIP pipeline.
 */
export default function TalonFitPropagationSection({ target }) {
  const ready = target && Number.isFinite(target.lat) && Number.isFinite(target.lon);

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Signal className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-sm font-bold text-foreground">Propagation Map</h2>
        <span className="text-[11px] text-muted-foreground">
          Modeled coverage for the selected TalonFit candidate
        </span>
      </div>
      {ready ? (
        <div className="p-3">
          <Section8Propagation
            key={`talonfit-prop-${target.lat},${target.lon}`}
            unlocked
            targetA={{
              latitude: target.lat,
              longitude: target.lon,
              label: `Target ${target.letter}`,
              parcel_address: target.parcel?.address || null,
            }}
            towerHeightFt={target.max_height_ft || 150}
            onData={() => {}}
            onClear={() => {}}
          />
        </div>
      ) : (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Save and select a TalonFit candidate above to model its coverage here.
        </p>
      )}
    </section>
  );
}