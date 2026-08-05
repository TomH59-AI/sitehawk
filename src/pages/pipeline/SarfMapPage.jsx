import { useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import SearchForm from "@/components/search/SearchForm";
import Section1SarfMap from "@/components/search/Section1SarfMap";
import HawkFlightSpinner from "@/components/search/HawkFlightSpinner";
import PipelinePageHeader from "@/components/pipeline/PipelinePageHeader";
import { usePipeline } from "@/lib/PipelineContext";
import { round4 } from "@/lib/coords";

/**
 * SARF Map — standalone step 3 page. Drops the SARF center, renders the search
 * ring map, and stores the ring in the shared pipeline session that Zoning,
 * Targets, and the Target map pages read from.
 */
export default function SarfMapPage() {
  const { session, patchSession, resetSession } = usePipeline();
  const [loading, setLoading] = useState(false);
  const center = session.center;
  const params = session.params;

  const handleSearch = (latitude, longitude, next = {}) => {
    setLoading(true);
    patchSession({
      center: { lat: round4(latitude), lon: round4(longitude) },
      params: { ...params, ...next },
      zoningResult: null,
      targets: [null, null, null],
      sectionData: {},
    });
  };

  const ready = center && Number.isFinite(center.lat) && Number.isFinite(center.lon);
  const ringLabel = params.ring_name?.trim() || params.agent_name?.trim() || "Search Ring";

  return (
    <div className="space-y-5">
      <PipelinePageHeader
        step="3"
        title="SARF Map"
        subtitle="Drop the carrier SARF center and generate the search-ring map. Everything downstream works from this ring."
        context={ready ? `${ringLabel} · ${Number(center.lat).toFixed(6)}, ${Number(center.lon).toFixed(6)} · ${params.radius_miles}-mile ring · ${params.tower_height_ft || 150}′ AGL` : null}
      />

      <SearchForm onSearch={handleSearch} isLoading={loading} />

      {loading && <HawkFlightSpinner label="Generating SARF map…" />}

      {ready && (
        <>
          <Section1SarfMap
            lat={Number(center.lat)}
            lon={Number(center.lon)}
            radiusMiles={params.radius_miles}
            agentName={ringLabel}
            onReady={() => setLoading(false)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/zoning"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Next — Zoning →
            </Link>
            <button
              onClick={() => { resetSession(); setLoading(false); }}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/20"
            >
              <RotateCcw className="w-4 h-4" /> Clear Ring
            </button>
          </div>
        </>
      )}
    </div>
  );
}