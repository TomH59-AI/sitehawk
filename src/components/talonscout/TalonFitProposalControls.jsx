import { Input } from "@/components/ui/input";

/**
 * Tower proposal inputs the TalonFit-AI-1.0 solver requires: requested height
 * (ft AGL, never below the 100 ft minimum) and the compound footprint in feet.
 * Values stay in feet — no conversion.
 */
export default function TalonFitProposalControls({ proposal, onChange, minHeightFt = 100 }) {
  const set = (key) => (e) => {
    const v = Number(e.target.value);
    onChange({ ...proposal, [key]: Number.isFinite(v) ? v : 0 });
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-muted-foreground">
          Requested height (ft AGL) · min {minHeightFt}
        </span>
        <Input type="number" min={minHeightFt} value={proposal.requested_height_ft} onChange={set("requested_height_ft")} />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-muted-foreground">Compound width (ft)</span>
        <Input type="number" min={1} value={proposal.compound_width_ft} onChange={set("compound_width_ft")} />
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-muted-foreground">Compound depth (ft)</span>
        <Input type="number" min={1} value={proposal.compound_depth_ft} onChange={set("compound_depth_ft")} />
      </label>
    </div>
  );
}