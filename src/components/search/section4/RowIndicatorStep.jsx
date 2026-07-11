/**
 * RowIndicatorStep — Regrid Premium Parcel Data panel for Target A.
 *
 * Runs AFTER the Parcel Map (step 9). Piggybacks on the same regridParcelRing
 * call (already fired for the map) — the parent passes the enrichment object
 * directly via `enrichment`. No new API call needed.
 *
 * Displays: ROW indicators, stacked parcels, building footprint, zoning
 * type/subtype, vacancy, elevation, env hazard, crop data, transmission
 * line distance, census/QOZ, ll_uuid.
 */

import { useMemo } from "react";
import { Lock, Sparkles, RefreshCw, AlertTriangle, Building2, TreePine, Zap, Map, BarChart2, Layers, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";
import RowMap from "./RowMap";
import PublicSafetyContacts from "./PublicSafetyContacts";
import ConnectionPointsCard from "./ConnectionPointsCard";
import { inferRowCorridor } from "@/lib/rowCorridor";

const BRAND_GREEN = "#628C83";

function Badge({ label, value, color = "default" }) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  };
  return (
    <div className={`rounded-lg p-3 flex flex-col gap-0.5 ${colors[color]}`}>
      <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold leading-snug">{value || "—"}</div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />{title}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {children}
      </div>
    </div>
  );
}

function fmtAcres(v) { return v != null ? `${Number(v).toFixed(3)} ac` : null; }
function fmtSqFt(v) { return v != null ? `${Number(v).toLocaleString()} sq ft` : null; }
function fmtDist(m) {
  if (m == null) return null;
  const mi = Number(m) / 1609.34;
  return mi < 1 ? `${Math.round(Number(m))} m` : `${mi.toFixed(2)} mi`;
}

export default function RowIndicatorStep({
  index, unlocked, loading, done, enrichment, ringStats, parcels = [], targetA, error, onRun,
}) {
  // Parcel-gap ROW inference — computed from geometry already fetched, zero new API calls.
  const corridor = useMemo(
    () => (done && parcels.length ? inferRowCorridor(parcels, targetA) : null),
    [done, parcels, targetA]
  );
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">MAP {index} · LOCKED</div>
            <h3 className="font-heading font-bold text-base leading-tight">Regrid Premium Parcel Data</h3>
          </div>
        </div>
        <div className="px-4 py-4 text-sm text-muted-foreground">
          Complete the Parcel Map to unlock ROW & Premium data.
        </div>
      </div>
    );
  }

  const e = enrichment || {};

  // ROW color — ll_row_parcel is the Regrid premium-schema ROW field
  const isRow = !!e.ll_row_parcel || e.row_flag === true || e.row_flag === "true" || !!e.row_type;
  const rowColor = isRow ? "red" : "green";
  const rowVal = isRow ? `Yes${e.row_type ? ` — ${e.row_type}` : ""}` : "Not flagged";

  // Vacancy
  const vacancyVal = e.usps_vacancy === "V" ? "Vacant" : e.usps_vacancy === "N" ? "Active delivery" : e.usps_vacancy || "—";
  const vacancyColor = e.usps_vacancy === "V" ? "amber" : e.usps_vacancy === "N" ? "green" : "default";

  // Stacked
  const stackedColor = e.stacked ? "amber" : "green";
  const stackedVal = e.stacked ? `Yes (UUID: ${String(e.ll_stack_uuid || "").slice(0, 8)}…)` : "Not stacked";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">STEP {index} · TARGET A · REGRID PREMIUM</div>
            <h3 className="font-heading font-bold text-base leading-tight">ROW &amp; Premium Parcel Indicators</h3>
          </div>
        </div>
        {!done ? (
          <Button onClick={onRun} disabled={loading} className="bg-white hover:bg-emerald-50 font-semibold shadow" style={{ color: BRAND_GREEN }}>
            <Sparkles className="w-4 h-4 mr-2" /> Run Premium Data
          </Button>
        ) : (
          <Button onClick={onRun} disabled={loading} variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 font-semibold">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        )}
      </div>

      {loading && <HawkFlightSpinner label="Loading Regrid Premium parcel indicators…" />}

      {!loading && !done && !error && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Pulls ROW flag, stacked parcel, building footprint, zoning type/subtype, vacancy,
          elevation, environmental hazard ratings, crop data, transmission line distance,
          census indicators, and the Regrid UUID for Target A.
        </div>
      )}

      {error && !loading && (
        <div className="px-4 py-4 bg-destructive/5 border-y border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">Premium data failed: {error}</div>
            <Button onClick={onRun} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {done && !loading && (
        <div className="p-4 space-y-5">
          {/* Ring summary bar */}
          {ringStats && (
            <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/40 border border-border text-sm">
              <span className="font-mono font-semibold text-foreground">{ringStats.total} parcels in ring</span>
              <span className="text-muted-foreground">·</span>
              <span className={ringStats.row_count > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}>
                {ringStats.row_count} ROW parcel{ringStats.row_count !== 1 ? "s" : ""}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={ringStats.stacked_count > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                {ringStats.stacked_count} stacked
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={ringStats.vacant_count > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>
                {ringStats.vacant_count} vacant
              </span>
            </div>
          )}

          {/* Inferred ROW corridor banner — parcel-gap analysis */}
          {corridor?.found && (
            <div className="px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300/50 text-sm text-amber-800 dark:text-amber-200">
              <span className="font-semibold">Inferred ROW corridor at Target A frontage:</span>{" "}
              <span className="font-mono font-bold">~{corridor.estimated_row_width_ft} ft wide</span>
              {" "}· <span className="font-mono">{corridor.frontage_ft} ft</span> of road frontage detected
              {" "}· <span className="font-mono">{corridor.shared_pct}%</span> of boundary is shared lot lines
              <div className="text-[11px] opacity-80 mt-0.5">{corridor.note}</div>
            </div>
          )}
          {corridor && !corridor.found && (
            <div className="px-4 py-2.5 rounded-lg bg-muted/40 border border-border text-sm text-muted-foreground">
              No road-width parcel gap detected on Target A's boundary — the parcel may be landlocked
              or fully surrounded by adjoining lots. Check the deed of record (Step 16) for access easements.
            </div>
          )}

          {/* ROW map — right-of-way polygons drawn from the same ring pull */}
          <RowMap parcels={parcels} targetA={targetA} corridor={corridor} />

          {/* ROW & Stacked */}
          <Section icon={AlertCircle} title="ROW & Stacked Parcel Indicators">
            <Badge label="ROW Flag (ll_row_parcel)" value={rowVal} color={rowColor} />
            {e.road_type && <Badge label="Roadway ROW Road Class" value={e.road_type} color="blue" />}
            {e.mtfcc_name && <Badge label="Roadway Feature (MTFCC)" value={e.mtfcc_name} color="blue" />}
            {corridor?.found && (
              <Badge label="Inferred ROW Width" value={`~${corridor.estimated_row_width_ft} ft`} color="amber" />
            )}
            <Badge label="Stacked Parcel" value={stackedVal} color={stackedColor} />
            {e.ll_uuid && <Badge label="Regrid UUID (ll_uuid)" value={String(e.ll_uuid).slice(0, 14) + "…"} color="blue" />}
            {e.path && <Badge label="Regrid Path" value={e.path} color="default" />}
          </Section>

          {/* Zoning */}
          <Section icon={Map} title="Zoning Type & Sub-type">
            <Badge label="Zoning Code" value={e.zoning} />
            <Badge label="Zoning Type" value={e.zoning_type} color={e.zoning_type ? "blue" : "default"} />
            <Badge label="Zoning Sub-type" value={e.zoning_subtype} color={e.zoning_subtype ? "blue" : "default"} />
            <Badge label="Land Use Desc." value={e.land_use} />
          </Section>

          {/* Buildings */}
          <Section icon={Building2} title="Building Footprint & Structures">
            <Badge label="Building Count" value={e.ll_bldg_count != null ? String(e.ll_bldg_count) : null} />
            <Badge label="Building Sq Ft" value={fmtSqFt(e.ll_bldg_sq_ft)} color={e.ll_bldg_sq_ft ? "blue" : "default"} />
            <Badge label="Year Built" value={e.year_built != null ? String(e.year_built) : null} />
            <Badge label="Num Stories" value={e.num_stories != null ? String(e.num_stories) : null} />
          </Section>

          {/* Residential & vacancy */}
          <Section icon={Layers} title="Residential & Vacancy Indicators">
            <Badge label="USPS Vacancy" value={vacancyVal} color={vacancyColor} />
            <Badge label="RDI (Delivery)" value={e.rdi} color={e.rdi === "Y" ? "green" : "default"} />
            <Badge label="Address Count" value={e.ll_address_count != null ? String(e.ll_address_count) : null} />
            <Badge label="Parcel Area (ac)" value={fmtAcres(e.ll_gisacre)} />
          </Section>

          {/* Elevation & env hazard */}
          <Section icon={AlertCircle} title="Elevation & Environmental Hazard Ratings">
            <Badge label="Elevation (ft)" value={e.parcel_elevation_ft != null ? `${Number(e.parcel_elevation_ft).toFixed(1)} ft` : null} color={e.parcel_elevation_ft ? "blue" : "default"} />
            <Badge label="FEMA Flood Zone" value={e.fema_flood_zone || e.fema_flood_zone_raw} color={e.fema_flood_zone && !["X", "X500"].includes(e.fema_flood_zone) ? "red" : "green"} />
            <Badge label="Risk Rating Score" value={e.risk_rating_score != null ? String(e.risk_rating_score) : null} color={e.risk_rating_score > 5 ? "red" : e.risk_rating_score > 0 ? "amber" : "default"} />
            <Badge label="Transmission Dist." value={fmtDist(e.transmission_line_dist_m)} color={e.transmission_line_dist_m != null && e.transmission_line_dist_m < 500 ? "green" : "default"} />
          </Section>

          {/* Crop data */}
          <Section icon={TreePine} title="Cropland Data Indicators">
            <Badge label="CDL Category" value={e.cdl_majority_category} color={e.cdl_majority_category ? "green" : "default"} />
            <Badge label="CDL Coverage %" value={e.cdl_majority_percent != null ? `${e.cdl_majority_percent}%` : null} />
          </Section>

          {/* Census & QOZ */}
          <Section icon={BarChart2} title="Census & Market Indicators">
            <Badge label="Census Tract" value={e.census_tract} />
            <Badge label="Block Group" value={e.census_blockgroup} />
            <Badge label="Opp. Zone (QOZ)" value={e.qoz === "Y" ? "✓ Qualified Opp. Zone" : e.qoz || "Not a QOZ"} color={e.qoz === "Y" ? "violet" : "default"} />
            <Badge label="GeoID" value={e.geoid} />
          </Section>

          {/* Public Safety — nearest Police + Fire non-emergency contacts */}
          <PublicSafetyContacts lat={targetA?.latitude} lon={targetA?.longitude} />

          {/* Likely fiber / power / access-road connection points */}
          <ConnectionPointsCard lat={targetA?.latitude} lon={targetA?.longitude} />
        </div>
      )}
    </div>
  );
}