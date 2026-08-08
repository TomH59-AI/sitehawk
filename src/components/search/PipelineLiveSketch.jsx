import { useMemo } from "react";
import ScipLiveSketch from "@/components/scip/livesketch/ScipLiveSketch";
import PipelineSketchData from "@/components/search/PipelineSketchData";
import { buildSketchUtilityLines } from "@/components/scip/livesketch/sketchUtilityLines";

export default function PipelineLiveSketch({ targetA, searchCenter, searchParams, zoningResult, sectionData = {} }) {
  const record = useMemo(() => {
    const zoning = zoningResult?.zoning || {};
    // The sketch must sit on the SELECTED target (A, B or C) — never the search
    // ring centroid. Ring center is only a last-resort fallback so the sketch
    // still renders if a target somehow has no coordinates.
    const tLat = Number(targetA?.latitude);
    const tLon = Number(targetA?.longitude);
    return {
      site_name: searchParams.ring_name?.trim() || searchParams.agent_name?.trim() || "Search Ring",
      latitude: Number.isFinite(tLat) ? tLat : Number(searchCenter.lat),
      longitude: Number.isFinite(tLon) ? tLon : Number(searchCenter.lon),
      search_radius: String(searchParams.radius_miles),
      sarf_height: Number(searchParams.tower_height_ft),
      compound_size: searchParams.compound_size,
      active_target_index: 0,
      parcel_targets: [{
        ...targetA,
        label: targetA.label || "Target A",
        geometry: targetA.geometry || targetA.parcel_geometry || null,
      }],
      zoning_report: {
        zoning_overview: { zoning_jurisdiction: { value: zoning.jurisdiction || "" } },
        tower_specifics: {
          fall_zone_requirements: { value: zoning.fall_zone || "" },
          pe_letter: { value: zoning.pe_letter || zoning.pe_self_certification || "" },
          maximum_tower_height: { value: zoning.max_height || "" },
        },
      },
    };
  }, [targetA, searchCenter, searchParams, zoningResult]);

  const utilities = useMemo(() => buildSketchUtilityLines(sectionData), [sectionData]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <ScipLiveSketch record={record} pipelineMode zoningData={zoningResult?.zoning || {}} utilities={utilities} />
      <PipelineSketchData zoning={zoningResult?.zoning || {}} />
    </div>
  );
}