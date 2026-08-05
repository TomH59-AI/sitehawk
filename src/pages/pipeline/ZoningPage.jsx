import { Link } from "react-router-dom";
import Section2Zoning from "@/components/search/Section2Zoning";
import PipelinePageHeader, { NeedsSarf } from "@/components/pipeline/PipelinePageHeader";
import { usePipeline } from "@/lib/PipelineContext";

/**
 * Zoning — standalone step 4 page. Runs the jurisdiction / ordinance zoning
 * lookup for the active SARF ring and stores the result in the shared session.
 */
export default function ZoningPage() {
  const { session, patchSession } = usePipeline();
  const center = session.center;
  const ready = center && Number.isFinite(center.lat) && Number.isFinite(center.lon);

  return (
    <div className="space-y-5">
      <PipelinePageHeader
        step="4"
        title="Zoning"
        subtitle="Ordinance intelligence for the search ring — jurisdiction, district, height, setbacks, fall zone and approval path."
        context={ready ? `${Number(center.lat).toFixed(6)}, ${Number(center.lon).toFixed(6)}` : null}
      />

      {!ready ? (
        <NeedsSarf what="the zoning lookup" />
      ) : (
        <>
          <Section2Zoning
            unlocked
            active
            lat={Number(center.lat)}
            lon={Number(center.lon)}
            candidate={{ latitude: Number(center.lat), longitude: Number(center.lon) }}
            onRun={() => {}}
            onComplete={() => {}}
            onData={(data) => {
              patchSession((prev) => ({
                sectionData: { ...prev.sectionData, ...data },
                zoningResult: data?.zoning ? data : prev.zoningResult,
              }));
            }}
          />
          <Link
            to="/targets"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Next — Targets A·B·C →
          </Link>
        </>
      )}
    </div>
  );
}