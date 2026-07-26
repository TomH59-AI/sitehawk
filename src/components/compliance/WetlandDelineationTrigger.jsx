import { Droplets } from "lucide-react";

export default function WetlandDelineationTrigger() {
  return (
    <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <Droplets className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <div className="text-sm font-semibold text-foreground">Wetland Delineation Recommended</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Wetlands are mapped on or adjacent to this otherwise viable candidate. Order a professional field delineation to confirm wetland boundaries, buffers, and permitting needs before final compound placement or construction.
        </p>
      </div>
    </div>
  );
}