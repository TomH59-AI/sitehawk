import { Link } from "react-router-dom";
import Section3Targets from "@/components/search/Section3Targets";
import PipelinePageHeader, { NeedsSarf } from "@/components/pipeline/PipelinePageHeader";
import { usePipeline } from "@/lib/PipelineContext";
import { round4 } from "@/lib/coords";

/**
 * Targets A·B·C — standalone step 5 page. Scans the ring for candidate parcels
 * and stores the three selected targets in the shared session so each Target
 * Maps page can work independently.
 */
export default function TargetsPage() {
  const { session, patchSession } = usePipeline();
  const center = session.center;
  const params = session.params;
  const ready = center && Number.isFinite(center.lat) && Number.isFinite(center.lon);
  const ringName = params.ring_name?.trim() || params.agent_name?.trim() || "Search Ring";

  const norm = (t) => (t ? { ...t, latitude: round4(t.latitude), longitude: round4(t.longitude) } : null);

  return (
    <div className="space-y-5">
      <PipelinePageHeader
        step="5"
        title="Targets A·B·C"
        subtitle="Select the three lead candidate parcels in the ring. Each target then has its own maps page."
        context={ready ? `${ringName} · ${params.radius_miles}-mile ring` : null}
      />

      {!ready ? (
        <NeedsSarf what="target selection" />
      ) : (
        <>
          <Section3Targets
            unlocked
            active
            lat={Number(center.lat)}
            lon={Number(center.lon)}
            radiusMiles={params.radius_miles}
            towerHeightFt={params.tower_height_ft || 150}
            compoundSideFt={parseInt(String(params.compound_size || "100x100").split("x")[0], 10) || 100}
            ringName={ringName}
            zoningResult={session.zoningResult}
            towerSiting={session.sectionData?.towerSiting}
            generatedLabels={[]}
            searchRingCenter={[Number(center.lon), Number(center.lat)]}
            onRun={() => {}}
            onTargetAReady={(t) => patchSession((prev) => {
              const targets = [...(prev.targets || [null, null, null])];
              targets[0] = norm(t);
              return { targets };
            })}
            onAllTargets={(slots) => patchSession({ targets: (slots || []).map(norm) })}
            onData={(data) => patchSession((prev) => ({ sectionData: { ...prev.sectionData, ...data } }))}
          />
          <div className="flex flex-wrap gap-2">
            {["A", "B", "C"].map((letter, i) => (
              <Link
                key={letter}
                to={`/target-${letter.toLowerCase()}-maps`}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold border ${
                  session.targets?.[i]
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                Target {letter} Maps →
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}