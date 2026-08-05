import { Link } from "react-router-dom";
import Section4MapSuite from "@/components/search/Section4MapSuite";
import PipelinePageHeader, { NeedsSarf } from "@/components/pipeline/PipelinePageHeader";
import { usePipeline } from "@/lib/PipelineContext";

const SLOT = { A: 0, B: 1, C: 2 };
const STEP = { A: "6", B: "7", C: "8" };

/**
 * TargetMapsPage — standalone map-suite page for ONE target (A, B or C).
 * Each letter gets its own route and its own isolated map run, driven by the
 * target stored in the shared pipeline session.
 */
export default function TargetMapsPage({ letter = "A" }) {
  const { session, patchSession } = usePipeline();
  const center = session.center;
  const target = session.targets?.[SLOT[letter]] || null;
  const params = session.params;
  const ringReady = center && Number.isFinite(center.lat) && Number.isFinite(center.lon);
  const ringName = params.ring_name?.trim() || params.agent_name?.trim() || "Search Ring";
  const hasTarget = !!(target && Number.isFinite(target.latitude) && Number.isFinite(target.longitude));

  return (
    <div className="space-y-5">
      <PipelinePageHeader
        step={STEP[letter]}
        title={`Target ${letter} Maps`}
        subtitle={`The full map & data suite for Target ${letter} — aerial, topography, FEMA, zoning, FLUM, wetlands, airport, cell tower, parcel, wind, fiber, power, viewshed and compliance.`}
        context={hasTarget ? `${target.parcel_address || target.owner_name || `Target ${letter}`} · ${Number(target.latitude).toFixed(6)}, ${Number(target.longitude).toFixed(6)}` : null}
      />

      {!ringReady ? (
        <NeedsSarf what={`the Target ${letter} maps`} />
      ) : !hasTarget ? (
        <div className="rounded-xl border border-border bg-muted/40 px-5 py-8 text-center space-y-3">
          <div className="text-3xl">🎯</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Target {letter} hasn't been selected yet. Pick your A·B·C candidates first, then come back to run this map suite.
          </p>
          <Link
            to="/targets"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to Targets A·B·C
          </Link>
        </div>
      ) : (
        <Section4MapSuite
          key={`maps-${letter}-${target.apn || `${target.latitude},${target.longitude}`}`}
          unlocked
          active
          targetA={target}
          srcLat={Number(center.lat)}
          srcLon={Number(center.lon)}
          radiusMiles={params.radius_miles}
          ringName={`${ringName} — Target ${letter}`}
          towerHeightFt={params.tower_height_ft || 150}
          sectionData={session.sectionData || {}}
          onRun={() => {}}
          onComplete={() => {}}
          onData={(data) => patchSession((prev) => ({ sectionData: { ...prev.sectionData, ...data } }))}
        />
      )}
    </div>
  );
}