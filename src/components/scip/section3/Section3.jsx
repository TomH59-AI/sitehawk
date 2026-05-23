/**
 * Section3 — Infrastructure.
 *
 * Hierarchy (matches Section3.xlsx 1:1):
 *   3.1 Infrastructure Map  — one interactive Mapbox map with center + Target A
 *                              + Power toggle + Fiber toggle + zoom + utility
 *                              contact sidebar (name / address / phone).
 *   3.2 Viewsheds N/E/S/W   — four high-res conical satellite crops, each with
 *                              its own transparent color so RF engineers can spot
 *                              tree-line obstructions. Downloadable PNGs.
 *
 * Applies to TARGET ONE (the best Hawk Vision selection).
 */

import Section1Shell from "../section1/Section1Shell";
import InfrastructureMap from "./InfrastructureMap";
import InfrastructureSidebar from "./InfrastructureSidebar";
import ViewshedQuadGrid from "./ViewshedQuadGrid";
import SCIPOverlayMap from "./SCIPOverlayMap";
import { Network, Compass, Layers } from "lucide-react";

export default function Section3({ centerLat, centerLon, targetOne }) {
  const targetLat = targetOne?.latitude;
  const targetLon = targetOne?.longitude;

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Banner */}
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent border border-emerald-500/30">
        <div className="text-[10px] font-mono text-emerald-700 tracking-[0.3em] mb-0.5">SCIP · SECTION THREE</div>
        <div className="font-heading font-bold text-lg text-foreground">
          Infrastructure — Premises, Access, Power / Fiber / Viewshed
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          One map · two toggles · utility contacts sidebar · four conical viewsheds for tree-line analysis.
        </div>
      </div>

      {/* 3.1 Map + sidebar */}
      <Section1Shell step={9} title="Infrastructure Map" subtitle="Mapbox · Power + Fiber toggles · zoom · Target A tower icon" icon={Network}>
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

      {/* 3.2 Conical viewsheds */}
      <Section1Shell step={10} title="Tree-Line Viewsheds — N / E / S / W" subtitle="Mapbox satellite · transparent conical RF beams · downloadable PNGs" icon={Compass}>
        <ViewshedQuadGrid targetLat={targetLat} targetLon={targetLon} />
      </Section1Shell>

      {/* 3.3 Multi-overlay toggle map — Wetlands · Parcels · Wind · Airport */}
      <Section1Shell
        step={11}
        title="Overlay Map — Wetlands · Parcels · Wind · Airport"
        subtitle="Toggle any layer · USFWS water overlay · APN labels · directional wind arrow · plane icon with crow-flies distance"
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