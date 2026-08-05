import { useState } from "react";
import { Radar } from "lucide-react";
import RfiMap from "@/components/rfi/RfiMap";
import RfiControlPanel from "@/components/rfi/RfiControlPanel";

/**
 * RF Intelligence Engine, merged into the bottom of TalonFit. Reuses the exact
 * existing RfiMap + RfiControlPanel components — nothing rebuilt, no behavior
 * change; it just lives here now instead of on its own sidebar page.
 */
export default function TalonFitRfSection() {
  const [overlays, setOverlays] = useState({ sites: true, rings: true });

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Radar className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-sm font-bold text-foreground">RF Intelligence Engine</h2>
        <span className="text-[11px] text-muted-foreground">
          Nationwide RF map with your own site pins and search rings
        </span>
      </div>
      <div className="flex h-[560px] flex-col gap-3 p-3 lg:flex-row">
        <RfiControlPanel overlays={overlays} setOverlays={setOverlays} />
        <div className="relative flex-1 overflow-hidden rounded-xl border border-border">
          <RfiMap overlays={overlays} />
        </div>
      </div>
    </section>
  );
}