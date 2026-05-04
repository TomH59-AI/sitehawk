import { useState, useRef } from "react";
import TowerSpecsForm from "./TowerSpecsForm";
import SitePlanSVG from "./SitePlanSVG";
import PlacementResults from "./PlacementResults";
import TowerPlacementPDFButton from "./TowerPlacementPDFButton";
import { computeTowerPlacement } from "@/lib/towerPlacement";

export default function TowerPlacementPanel({ parcel }) {
  const [analysis, setAnalysis] = useState(null);
  const svgWrapperRef = useRef(null);

  const handleSubmit = (specs) => {
    const result = computeTowerPlacement(parcel, specs);
    setAnalysis(result);
  };

  if (!parcel?.parcel_geometry) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
        <p className="text-sm text-foreground font-semibold">Parcel geometry unavailable</p>
        <p className="text-xs text-muted-foreground mt-1">
          Tower placement requires a parcel boundary polygon. This parcel was retrieved from a source that didn't include geometry.
          Re-run the search or pick a parcel from a state with full cadastral coverage (FL, NC, MA, MD).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-heading font-semibold text-base text-foreground mb-1">Tower Specifications</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Enter the proposed tower specs. Setback math will use these values against the parcel's geometry to find the optimal placement.
        </p>
        <TowerSpecsForm onSubmit={handleSubmit} />
      </div>

      {analysis && (
        <>
          <PlacementResults analysis={analysis} />
          {analysis.ok && (
            <div ref={svgWrapperRef}>
              <SitePlanSVG analysis={analysis} parcel={parcel} />
            </div>
          )}
          {analysis.ok && (
            <div className="flex justify-end">
              <TowerPlacementPDFButton
                analysis={analysis}
                parcel={parcel}
                svgRef={{ current: svgWrapperRef.current?.querySelector("svg") }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}