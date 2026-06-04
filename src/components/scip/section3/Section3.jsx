/**
 * Section3 - Infrastructure.
 *
 * Current hierarchy:
 *   3.1 Infrastructure Map - one interactive Mapbox map with center + Target A,
 *       power/fiber overlays, zoom, and utility contact sidebar.
 *   3.2 Hawk Proximity & Environment Vision - Target A overlays for wetlands,
 *       parcels, wind, airport, and topo context.
 *
 * Applies to Target A (the best Hawk Vision selection).
 */

import Section1Shell from "../section1/Section1Shell";
import InfrastructureMap from "./InfrastructureMap";
import InfrastructureSidebar from "./InfrastructureSidebar";
import SCIPOverlayMap from "./SCIPOverlayMap";
import { Network, Layers } from "lucide-react";

export default function Section3({ centerLat, centerLon, targetOne }) {
  const targetLat = targetOne?.latitude;
  const targetLon = targetOne?.longitude;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent border border-emerald-500/30">
        <div className="text-[10px] font-mono text-emerald-700 tracking-[0.3em] mb-0.5">SCIP - SECTION THREE</div>
        <div className="font-heading font-bold text-lg text-foreground">
          Infrastructure - Premises, Access, Power / Fiber, Proximity & Environment
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Infrastructure assets stay intact; Target A proximity and environmental overlays run in the next map.
        </div>
      </div>

      <Section1Shell step={9} title="Infrastructure Map" subtitle="Mapbox - Power + Fiber toggles - zoom - Target A tower icon" icon={Network}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px]">
          <InfrastructureMap
            centerLat={centerLat}
            centerLon={centerLon}
            targetLat={targetLat}
            targetLon={targetLon}
          />
          <InfrastructureSidebar targetLat={targetLat} targetLon={targetLon} />
        </div>
      </Section1Shell>

      <Section1Shell
        step={10}
        title="Hawk Proximity & Environment Vision - Target A"
        subtitle="Toggle wetlands, parcels, wind, airport, and topo layers for Target A"
        icon={Layers}
      >
        <SCIPOverlayMap
          centerLat={centerLat}
          centerLon={centerLon}
          targetLat={targetLat}
          targetLon={targetLon}
        />
      </Section1Shell>
    </div>
  );
}
