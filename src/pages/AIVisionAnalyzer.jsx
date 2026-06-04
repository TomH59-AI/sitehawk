import { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle,
  Database,
  Eye,
  Info,
  Loader2,
  Map as MapIcon,
  MapPin,
  Plane,
  RadioTower,
  RefreshCw,
  Target,
  Upload,
  Wind,
} from "lucide-react";
import HawkIcon from "@/components/HawkIcon";
import { aiVisionAnalyze } from "@/functions/aiVisionAnalyze";
import { findBestParcelForTower } from "@/functions/findBestParcelForTower";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { runRFAnalysis } from "@/functions/runRFAnalysis";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import SARFMapInline from "@/components/ai-vision/SARFMapInline";
import RFProximityMaps from "@/components/ai-vision/RFProximityMaps";
import WindMapInline from "@/components/ai-vision/WindMapInline";

const RADIUS_OPTIONS = [
  { value: 0.25, label: "0.25 mi" },
  { value: 0.5, label: "0.50 mi" },
  { value: 1.0, label: "1.0 mi" },
];

const ANALYSIS_TYPES = [
  {
    id: "aerial",
    label: "Aerial / Satellite",
    icon: MapIcon,
    desc: "Analyze aerial or satellite imagery for tower placement zones and obstructions",
  },
  {
    id: "blueprint",
    label: "Blueprint / Floor Plan",
    icon: Info,
    desc: "Analyze structural blueprints for DAS or small cell antenna mounting points",
  },
  {
    id: "obstruction",
    label: "Obstruction Analysis",
    icon: AlertTriangle,
    desc: "Identify RF obstructions and calculate required tower height to clear them",
  },
];

const MAP_SECTIONS = [
  {
    id: "airport",
    type: "rf",
    label: "Airport Map",
    description: "Target A with nearest airport overlay",
    icon: Plane,
    radiusLabel: (radius) => `${radius} mi`,
    radiusMiles: (radius) => radius,
    requiresHeight: true,
  },
  {
    id: "cell_tower",
    type: "rf",
    label: "Cell Tower Map",
    description: "Target A with nearest cell tower overlay",
    icon: RadioTower,
    radiusLabel: () => "2 mi",
    radiusMiles: () => 2,
    requiresHeight: true,
  },
  {
    id: "wind",
    type: "wind",
    label: "Wind Map",
    description: "Target A with ASCE design wind result",
    icon: Wind,
    radiusLabel: (radius) => `${radius} mi`,
    radiusMiles: (radius) => radius,
    requiresHeight: false,
  },
];

const SEVERITY_CONFIG = {
  positive: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  neutral: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Info },
  warning: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
  critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: AlertTriangle },
};

const RESIDENTIAL_TERMS = [
  "residential",
  "single family",
  "single-family",
  "sfr",
  "duplex",
  "townhouse",
  "townhome",
  "condo",
  "condominium",
  "apartment",
  "multi-family",
  "multifamily",
  "mobile home",
  "manufactured home",
  "r-1",
  "r-2",
  "r-3",
  "r-4",
  "r-5",
  "rsf",
  "rmf",
  "rural res",
];

const LIKELY_TOWER_ZONING_TERMS = [
  "agricultural",
  "agriculture",
  "commercial",
  "industrial",
  "institutional",
  "utility",
  "utilities",
  "public",
  "government",
  "municipal",
  "vacant",
  "unimproved",
  "timber",
  "forest",
  "rural",
  "church",
  "religious",
  "school",
  "warehouse",
  "office",
  "retail",
  "mixed use",
  "mixed-use",
];

function freshMapState() {
  return MAP_SECTIONS.reduce((acc, section) => {
    acc[section.id] = { loading: false, error: null, result: null };
    return acc;
  }, {});
}

function ScoreGauge({ score }) {
  const color = score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626";
  const label = score >= 70 ? "Excellent" : score >= 40 ? "Good" : "Poor";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-28 w-28">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${(score / 100) * 263.9} 263.9`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-bold text-white">{score}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">/ 100</span>
        </div>
      </div>
      <span style={{ color }} className="text-sm font-bold">
        {label}
      </span>
    </div>
  );
}

function unwrapFunctionResponse(response) {
  const payload = response?.data || response || {};
  return payload.data || payload.analysis || payload;
}

function normalized(value) {
  return typeof value === "string" ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";
}

function parcelZoning(parcel) {
  return parcel?.zoning_classification || parcel?.zoning || parcel?.land_use || parcel?.use_code || "";
}

function parcelAcreage(parcel) {
  const value = Number(parcel?.parcel_size_acres ?? parcel?.acreage);
  return Number.isFinite(value) ? value : null;
}

function parcelScreening(parcel) {
  const zoningText = normalized(parcelZoning(parcel));
  const useCode = Number.parseInt(parcel?.use_code, 10);
  const acres = parcelAcreage(parcel);
  const isResidential =
    (Number.isFinite(useCode) && useCode >= 1000 && useCode <= 1999) ||
    RESIDENTIAL_TERMS.some((term) => zoningText.includes(term));

  if (isResidential) {
    return {
      status: "excluded",
      label: "Exclude",
      reason: "Residential zoning",
      className: "border-red-500/30 bg-red-500/10 text-red-300",
      sort: 3,
    };
  }

  if (!zoningText) {
    return {
      status: "review",
      label: "Review",
      reason: "Missing zoning",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      sort: 2,
    };
  }

  if (acres != null && acres < 0.5) {
    return {
      status: "review",
      label: "Review",
      reason: "Small parcel",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      sort: 2,
    };
  }

  if (LIKELY_TOWER_ZONING_TERMS.some((term) => zoningText.includes(term))) {
    return {
      status: "candidate",
      label: "Likely",
      reason: "Non-residential",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      sort: 0,
    };
  }

  return {
    status: "review",
    label: "Review",
    reason: "Confirm ordinance",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    sort: 1,
  };
}

function summarizeParcelScreen(parcels) {
  return parcels.reduce(
    (acc, parcel) => {
      const screening = parcelScreening(parcel);
      acc[screening.status] += 1;
      return acc;
    },
    { candidate: 0, review: 0, excluded: 0 },
  );
}

function mapSectionResult(payload, sectionId) {
  const airportMap = payload.airport_map || payload.map_overlays?.target_a_airport || null;
  const cellTowerMap = payload.cell_tower_map || payload.map_overlays?.target_a_cell_tower || null;
  const emptyOverlays = {
    target_a_airport: null,
    target_a_cell_tower: null,
    target_a_fiber: null,
    target_a_power: null,
  };

  if (sectionId === "airport") {
    return {
      ...payload,
      tower: null,
      cell_tower_map: null,
      fiber: null,
      fiber_map: null,
      power: null,
      power_map: null,
      airport_map: airportMap,
      map_overlays: { ...emptyOverlays, target_a_airport: airportMap },
    };
  }

  return {
    ...payload,
    airport: null,
    airport_map: null,
    fiber: null,
    fiber_map: null,
    power: null,
    power_map: null,
    cell_tower_map: cellTowerMap,
    map_overlays: { ...emptyOverlays, target_a_cell_tower: cellTowerMap },
  };
}

function siteChanged(current, next) {
  if (!current) return true;
  return current.lat !== next.lat || current.lon !== next.lon || current.radius !== next.radius;
}

function EmptyMapState({ icon: Icon, label }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-8 text-center">
      <Icon className="mb-3 h-10 w-10 text-muted-foreground/35" aria-hidden="true" />
      <p className="font-heading text-sm font-semibold text-muted-foreground">{label} is ready to generate</p>
    </div>
  );
}

function ParcelZoningScreen({ site, parcels, loading, error, onRefresh }) {
  const summary = summarizeParcelScreen(parcels || []);
  const sortedParcels = [...(parcels || [])].sort((a, b) => {
    const left = parcelScreening(a);
    const right = parcelScreening(b);
    return (
      left.sort - right.sort ||
      (b.parcel_size_acres ?? b.acreage ?? 0) - (a.parcel_size_acres ?? a.acreage ?? 0) ||
      (a.distance_miles ?? 999) - (b.distance_miles ?? 999)
    );
  });

  return (
    <div className="border-t border-border bg-card">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h4 className="font-heading text-sm font-bold text-foreground">Realie Parcel Zoning Screen</h4>
            <p className="text-xs text-muted-foreground">
              {site?.radius} mile SARF radius
              {parcels?.length ? ` | ${parcels.length} parcels` : ""}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-2" disabled={loading} onClick={onRefresh}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh Parcels
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 border-t border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching parcels from Realie
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-3 border-t border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm font-semibold text-destructive">Realie parcel screen failed: {error}</div>
        </div>
      )}

      {!loading && !error && parcels && parcels.length === 0 && (
        <div className="border-t border-border p-6 text-center text-sm text-muted-foreground">
          No parcels were returned by Realie for this SARF radius.
        </div>
      )}

      {!loading && !error && sortedParcels.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-2 border-t border-border px-4 py-3">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">Likely</div>
              <div className="font-mono text-xl font-bold text-foreground">{summary.candidate}</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Review</div>
              <div className="font-mono text-xl font-bold text-foreground">{summary.review}</div>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-300">Exclude</div>
              <div className="font-mono text-xl font-bold text-foreground">{summary.excluded}</div>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto border-t border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fit</th>
                  <th className="px-3 py-2 font-semibold">APN</th>
                  <th className="px-3 py-2 font-semibold">Owner</th>
                  <th className="px-3 py-2 font-semibold">Acres</th>
                  <th className="px-3 py-2 font-semibold">Zoning / Use</th>
                  <th className="px-3 py-2 font-semibold">Distance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedParcels.map((parcel, index) => {
                  const screening = parcelScreening(parcel);
                  const acres = parcelAcreage(parcel);
                  return (
                    <tr key={`${parcel.apn || parcel.parcel_id || index}-${index}`} className="hover:bg-secondary/30">
                      <td className="px-3 py-2 align-top">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${screening.className}`}>
                          {screening.label}
                        </span>
                        <div className="mt-1 text-[10px] text-muted-foreground">{screening.reason}</div>
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-foreground">{parcel.apn || parcel.parcel_id || "-"}</td>
                      <td className="px-3 py-2 align-top text-foreground">
                        <div className="font-medium">{parcel.owner_name || "-"}</div>
                        {parcel.parcel_address && <div className="mt-1 max-w-56 truncate text-[10px] text-muted-foreground">{parcel.parcel_address}</div>}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-foreground">{acres != null ? acres.toFixed(2) : "-"}</td>
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        <div className="max-w-56 truncate text-foreground">{parcelZoning(parcel) || "-"}</div>
                        {parcel.land_use && parcel.land_use !== parcelZoning(parcel) && (
                          <div className="mt-1 max-w-56 truncate text-[10px]">{parcel.land_use}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top font-mono text-muted-foreground">
                        {parcel.distance_miles != null ? `${Number(parcel.distance_miles).toFixed(2)} mi` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function targetCupLabel(target) {
  if (!target?.requires_cup) return "Not required";
  if (target.cup_path_available) return "Required / path found";
  if (target.cup_assumed) return "Assumed - verify";
  return "Required - verify";
}

function TargetSelectionScreen({ site, targets, reasoning, loading, error, onRefresh }) {
  return (
    <div className="border-t border-border bg-card">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h4 className="font-heading text-sm font-bold text-foreground">Target A/B/C Selection</h4>
            <p className="text-xs text-muted-foreground">
              {site?.radius} mile SARF radius
              {reasoning?.zoning_source ? ` | ${reasoning.zoning_source}` : " | zoning criteria pending"}
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-2" disabled={loading} onClick={onRefresh}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh Targets
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 border-t border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Ranking Target A/B/C from zoning, CUP, PE letter, Realie parcels, acreage, and proximity
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-3 border-t border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm font-semibold text-destructive">Target selection failed: {error}</div>
        </div>
      )}

      {!loading && !error && reasoning && (
        <div className="grid gap-2 border-t border-border px-4 py-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">CUP</div>
            <div className="mt-1 font-semibold text-foreground">
              {reasoning.requires_cup
                ? reasoning.cup_path_available ? "Required / path found" : "Assumed - verify"
                : "Not required"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">PE Letter</div>
            <div className="mt-1 font-semibold text-foreground">{reasoning.pe_letter_accepted ? "Accepted" : "Not verified"}</div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Candidate Pool</div>
            <div className="mt-1 font-semibold text-foreground">
              {reasoning.non_residential_candidates ?? 0}/{reasoning.total_parcels_in_ring ?? 0} parcels
            </div>
          </div>
        </div>
      )}

      {!loading && !error && (!targets || targets.length === 0) && (
        <div className="border-t border-border p-6 text-center text-sm text-muted-foreground">
          No ranked targets have been returned for this SARF radius.
        </div>
      )}

      {!loading && !error && targets && targets.length > 0 && (
        <div className="overflow-auto border-t border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Target</th>
                <th className="px-3 py-2 font-semibold">Parcel</th>
                <th className="px-3 py-2 font-semibold">Acres</th>
                <th className="px-3 py-2 font-semibold">Zoning Fit</th>
                <th className="px-3 py-2 font-semibold">CUP / PE</th>
                <th className="px-3 py-2 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {targets.slice(0, 3).map((target, index) => (
                <tr key={`${target.parcel_id || index}-${index}`} className="hover:bg-secondary/30">
                  <td className="px-3 py-2 align-top font-mono font-bold text-primary">Target {target.label || ["A", "B", "C"][index]}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-foreground">{target.parcel_id || "-"}</div>
                    <div className="mt-1 max-w-64 truncate text-[10px] text-muted-foreground">{target.parcel_address || "-"}</div>
                    <div className="mt-1 max-w-64 truncate text-[10px] text-muted-foreground">{target.owner_name || "-"}</div>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-foreground">
                    {target.acreage != null ? Number(target.acreage).toFixed(2) : "-"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-semibold text-foreground">{target.zoning_fit || "-"}</div>
                    <div className="mt-1 max-w-80 text-[10px] text-muted-foreground">{target.zoning_fit_reason || target.zoning || "-"}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    <div>CUP: <span className="font-semibold text-foreground">{targetCupLabel(target)}</span></div>
                    <div className="mt-1">PE: <span className="font-semibold text-foreground">{target.pe_letter_accepted ? "Accepted" : "Not verified"}</span></div>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-foreground">{target.score ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GeneratedMapSection({ section, state, site, disabled, onGenerate }) {
  const Icon = section.icon;
  const sectionRadius = section.radiusMiles(site?.radius ?? 0.5);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h4 className="font-heading text-sm font-bold text-foreground">{section.label}</h4>
            <p className="text-xs text-muted-foreground">
              {section.description} ({section.radiusLabel(site?.radius ?? 0.5)})
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2 font-heading font-semibold"
          disabled={disabled || state.loading}
          onClick={() => onGenerate(section.id)}
        >
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Generate
        </Button>
      </div>

      <div className="p-4">
        {state.loading && (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-border bg-card p-10 text-center">
            <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <p className="font-heading text-sm font-semibold text-foreground">Generating {section.label.toLowerCase()}</p>
          </div>
        )}

        {!state.loading && state.error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-destructive">{state.error}</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => onGenerate(section.id)}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {!state.loading && !state.error && !state.result && <EmptyMapState icon={Icon} label={section.label} />}

        {!state.loading && !state.error && state.result && section.type === "wind" && (
          <WindMapInline site={site} wind={state.result} />
        )}

        {!state.loading && !state.error && state.result && section.type === "rf" && (
          <RFProximityMaps
            site={{ ...site, radius: sectionRadius }}
            result={state.result}
            rfRadiusMiles={sectionRadius}
          />
        )}
      </div>
    </section>
  );
}

export default function AIVisionAnalyzer() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [towerHeight, setTowerHeight] = useState("199");
  const [radius, setRadius] = useState(0.5);
  const [sarfCoords, setSarfCoords] = useState(null);
  const [mapSections, setMapSections] = useState(() => freshMapState());
  const [parcelScreen, setParcelScreen] = useState({
    loading: false,
    error: null,
    parcels: [],
    radius: null,
  });
  const [targetScreen, setTargetScreen] = useState({
    loading: false,
    error: null,
    targets: [],
    reasoning: null,
    radius: null,
  });

  const [analysisType, setAnalysisType] = useState("aerial");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const parseSiteInputs = (requireTowerHeight = false) => {
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      toast({ title: "Invalid latitude", description: "Enter a valid latitude between -90 and 90.", variant: "destructive" });
      return null;
    }
    if (!Number.isFinite(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      toast({ title: "Invalid longitude", description: "Enter a valid longitude between -180 and 180.", variant: "destructive" });
      return null;
    }

    const parsedHeight = parseFloat(towerHeight);
    if (requireTowerHeight && (!Number.isFinite(parsedHeight) || parsedHeight <= 0 || parsedHeight > 2000)) {
      toast({ title: "Invalid tower height", description: "Enter a tower height in feet between 1 and 2000.", variant: "destructive" });
      return null;
    }

    return { lat: parsedLat, lon: parsedLon, towerHeight: parsedHeight, radius };
  };

  const setMapSectionState = (sectionId, patch, resetOthers = false) => {
    setMapSections((current) => {
      const base = resetOthers ? freshMapState() : current;
      return {
        ...base,
        [sectionId]: { ...base[sectionId], ...patch },
      };
    });
  };

  const fetchSarfParcels = async (site) => {
    if (!site) return;
    setParcelScreen({ loading: true, error: null, parcels: [], radius: site.radius });

    try {
      const response = await realieParcelsInRing({
        lat: site.lat,
        lon: site.lon,
        radius_miles: site.radius,
      });
      const payload = unwrapFunctionResponse(response);
      if (payload.error) throw new Error(payload.error);

      setParcelScreen({
        loading: false,
        error: null,
        parcels: payload.parcels || [],
        radius: payload.radius_miles ?? site.radius,
      });
    } catch (error) {
      setParcelScreen({
        loading: false,
        error: error.message || "Realie parcel lookup failed.",
        parcels: [],
        radius: site.radius,
      });
    }
  };

  const fetchSarfTargets = async (site) => {
    if (!site) return;
    setTargetScreen({ loading: true, error: null, targets: [], reasoning: null, radius: site.radius });

    try {
      const response = await findBestParcelForTower({
        lat: site.lat,
        lon: site.lon,
        radius_miles: site.radius,
        tower_height_ft: site.towerHeight || parseFloat(towerHeight) || 199,
      });
      const payload = unwrapFunctionResponse(response);
      if (payload.error) throw new Error(payload.error);

      setTargetScreen({
        loading: false,
        error: null,
        targets: payload.targets || [],
        reasoning: payload.reasoning || null,
        radius: payload.reasoning?.radius_miles ?? site.radius,
      });
    } catch (error) {
      setTargetScreen({
        loading: false,
        error: error.message || "Target selection failed.",
        targets: [],
        reasoning: null,
        radius: site.radius,
      });
    }
  };

  const handleGenerateSarfMap = () => {
    const site = parseSiteInputs(false);
    if (!site) return;

    const nextCoords = { lat: site.lat, lon: site.lon, radius: site.radius, towerHeight: site.towerHeight };
    setSarfCoords(nextCoords);
    setMapSections(freshMapState());
    setResult(null);
    fetchSarfParcels(nextCoords);
    fetchSarfTargets(nextCoords);
  };

  const handleGenerateMapSection = async (sectionId) => {
    const section = MAP_SECTIONS.find((item) => item.id === sectionId);
    if (!section) return;

    const site = parseSiteInputs(section.requiresHeight);
    if (!site) return;

    const nextCoords = { lat: site.lat, lon: site.lon, radius: site.radius, towerHeight: site.towerHeight };
    const shouldReset = siteChanged(sarfCoords, nextCoords);
    setSarfCoords(nextCoords);
    setResult(null);
    setMapSectionState(sectionId, { loading: true, error: null, result: null }, shouldReset);
    if (shouldReset || parcelScreen.radius !== site.radius || parcelScreen.parcels.length === 0) {
      fetchSarfParcels(nextCoords);
    }
    if (shouldReset || targetScreen.radius !== site.radius || targetScreen.targets.length === 0) {
      fetchSarfTargets(nextCoords);
    }

    try {
      if (section.type === "wind") {
        const response = await windSpeedLookup({ lat: site.lat, lon: site.lon });
        const payload = unwrapFunctionResponse(response);
        if (payload.error) throw new Error(payload.error);
        setMapSectionState(sectionId, { loading: false, error: null, result: payload });
        return;
      }

      const response = await runRFAnalysis({
        lat: site.lat,
        lon: site.lon,
        radius_miles: section.radiusMiles(site.radius),
        heights_ft: [site.towerHeight],
        force_refresh: true,
        utility_radius_miles: site.radius,
      });
      const payload = unwrapFunctionResponse(response);
      if (payload.error && !payload.airport && !payload.tower && !payload.rf) throw new Error(payload.error);
      setMapSectionState(sectionId, {
        loading: false,
        error: null,
        result: mapSectionResult(payload, sectionId),
      });
    } catch (error) {
      setMapSectionState(sectionId, {
        loading: false,
        error: error.message || `${section.label} generation failed.`,
        result: null,
      });
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (readerEvent) => setImagePreview(readerEvent.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) handleFileChange({ target: { files: [file] } });
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      toast({ title: "No image", description: "Please upload an image first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: imageFile });
      setUploading(false);

      const response = await aiVisionAnalyze({
        image_url: file_url,
        analysis_type: analysisType,
        lat: sarfCoords?.lat,
        lon: sarfCoords?.lon,
      });

      if (response.data?.error) throw new Error(response.data.error);
      setResult(response.data.analysis);
    } catch (error) {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
          <Eye className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">AI Vision Analyzer</h1>
          <p className="text-sm text-muted-foreground">
            Generate Target A maps independently, then upload imagery for AI analysis
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            1
          </span>
          <h3 className="font-heading font-semibold text-foreground">Site Location & Map Generation</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="ai-vision-latitude" className="mb-1.5 block text-xs font-medium text-muted-foreground">Latitude</label>
            <input
              id="ai-vision-latitude"
              type="number"
              step="any"
              placeholder="e.g. 35.2271"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="ai-vision-longitude" className="mb-1.5 block text-xs font-medium text-muted-foreground">Longitude</label>
            <input
              id="ai-vision-longitude"
              type="number"
              step="any"
              placeholder="e.g. -80.8431"
              value={lon}
              onChange={(event) => setLon(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="ai-vision-tower-height" className="mb-1.5 block text-xs font-medium text-muted-foreground">Tower Height (ft AGL)</label>
            <input
              id="ai-vision-tower-height"
              type="number"
              step="1"
              placeholder="e.g. 199"
              value={towerHeight}
              onChange={(event) => setTowerHeight(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Search Radius</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-border">
            {RADIUS_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setRadius(option.value)}
                className={`px-5 py-2 text-sm font-semibold transition-all ${
                  radius === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Airport and wind maps use this radius. Cell tower map uses a fixed 2 mile radius.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="gap-2 font-heading font-semibold"
            disabled={!lat || !lon}
            onClick={handleGenerateSarfMap}
          >
            <MapPin className="h-4 w-4" />
            Generate SARF Map
          </Button>
          {MAP_SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <Button
                type="button"
                key={section.id}
                variant="outline"
                className="gap-2 font-heading font-semibold"
                disabled={!lat || !lon || mapSections[section.id].loading}
                onClick={() => handleGenerateMapSection(section.id)}
              >
                {mapSections[section.id].loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                {section.label}
              </Button>
            );
          })}
        </div>
      </div>

      {sarfCoords && (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-card px-4 py-3">
            <div className="mb-0.5 font-mono text-[10px] tracking-[0.3em] text-cyan-600">SARF MAP</div>
            <div className="font-heading font-bold text-foreground">
              {sarfCoords.lat.toFixed(6)}, {sarfCoords.lon.toFixed(6)} - {sarfCoords.radius} mile radius
            </div>
          </div>
          <SARFMapInline lat={sarfCoords.lat} lon={sarfCoords.lon} radius={sarfCoords.radius} />
          <ParcelZoningScreen
            site={{ ...sarfCoords, radius: parcelScreen.radius ?? sarfCoords.radius }}
            parcels={parcelScreen.parcels}
            loading={parcelScreen.loading}
            error={parcelScreen.error}
            onRefresh={() => fetchSarfParcels(sarfCoords)}
          />
          <TargetSelectionScreen
            site={{ ...sarfCoords, radius: targetScreen.radius ?? sarfCoords.radius }}
            targets={targetScreen.targets}
            reasoning={targetScreen.reasoning}
            loading={targetScreen.loading}
            error={targetScreen.error}
            onRefresh={() => fetchSarfTargets(sarfCoords)}
          />
        </div>
      )}

      {sarfCoords && (
        <div className="space-y-4">
          {MAP_SECTIONS.map((section) => (
            <GeneratedMapSection
              key={section.id}
              section={section}
              state={mapSections[section.id]}
              site={sarfCoords}
              disabled={!lat || !lon}
              onGenerate={handleGenerateMapSection}
            />
          ))}
        </div>
      )}

      {sarfCoords && (
        <div className="space-y-5 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              2
            </span>
            <h3 className="font-heading font-semibold text-foreground">
              AI Vision Analysis <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analysis Type</h4>
                {ANALYSIS_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setAnalysisType(type.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        analysisType === type.id ? "border-primary bg-primary/5" : "border-border bg-card/50 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">{type.label}</div>
                          <div className="text-xs text-muted-foreground">{type.desc}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={(event) => event.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer space-y-3 rounded-xl border-2 border-dashed border-border bg-card/50 p-6 text-center transition-all hover:border-primary/50"
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                {imagePreview ? (
                  <div className="space-y-2">
                    <img src={imagePreview} alt="Preview" className="mx-auto max-h-48 rounded-lg border border-border object-contain" />
                    <p className="text-xs text-muted-foreground">{imageFile?.name} - click to change</p>
                  </div>
                ) : (
                  <>
                    <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Drop image here or click to upload</p>
                      <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, GIF, WebP supported</p>
                    </div>
                  </>
                )}
              </div>

              <Button onClick={handleAnalyze} disabled={loading || !imageFile} className="w-full gap-2 font-heading font-semibold">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploading ? "Uploading image..." : "Analyzing with AI..."}
                  </>
                ) : (
                  <>
                    <HawkIcon size={18} />
                    Analyze Image
                  </>
                )}
              </Button>
            </div>

            <div>
              {!result && !loading && (
                <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/30 p-12 text-center">
                  <Eye className="mb-3 h-12 w-12 text-muted-foreground/30" />
                  <p className="font-heading font-semibold text-muted-foreground">Analysis results will appear here</p>
                  <p className="mt-1 text-xs text-muted-foreground/60">Upload an image and click Analyze</p>
                </div>
              )}

              {loading && (
                <div className="flex h-full min-h-80 flex-col items-center justify-center space-y-3 rounded-xl border border-border bg-card p-12 text-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
                  <p className="font-heading font-semibold text-foreground">
                    {uploading ? "Uploading image..." : "AI analyzing imagery..."}
                  </p>
                  <p className="text-xs text-muted-foreground">This may take 15-30 seconds</p>
                </div>
              )}

              {result && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-start gap-5">
                      <ScoreGauge score={result.overall_score || 0} />
                      <div className="flex-1">
                        <div className="mb-3 flex flex-wrap gap-2">
                          {result.access_feasibility && (
                            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                              Access: {result.access_feasibility}
                            </span>
                          )}
                          {result.estimated_tower_height_ft && (
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              {result.estimated_tower_height_ft}ft rec.
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{result.summary}</p>
                      </div>
                    </div>
                  </div>

                  {result.findings?.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                      <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">Findings</h4>
                      {result.findings.map((finding, index) => {
                        const config = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.neutral;
                        const Icon = config.icon;
                        return (
                          <div key={`${finding.category}-${index}`} className={`flex items-start gap-2 rounded-lg border p-2.5 ${config.bg}`}>
                            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${config.color}`} />
                            <div>
                              <span className={`text-xs font-bold ${config.color}`}>{finding.category}</span>
                              <p className="mt-0.5 text-xs text-muted-foreground">{finding.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {result.recommendations?.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                      <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommendations</h4>
                      {result.recommendations.map((recommendation, index) => (
                        <div key={`${recommendation}-${index}`} className="flex items-start gap-2">
                          <span className="mt-0.5 text-xs font-bold text-primary">{index + 1}.</span>
                          <p className="text-xs text-muted-foreground">{recommendation}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
