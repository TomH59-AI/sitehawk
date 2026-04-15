import { useState } from "react";
import { SlidersHorizontal, ArrowUpDown, X, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

const OWNER_TYPES = ["LLC", "Church", "Government", "Trust", "Individual"];

const FEMA_OPTIONS = [
  { value: "any", label: "Any Risk" },
  { value: "low", label: "Low Only" },
  { value: "hide_high", label: "Hide High" },
];

const SORT_OPTIONS = [
  { value: "match_score_desc", label: "Match Score ↓" },
  { value: "match_score_asc", label: "Match Score ↑" },
  { value: "parcel_size_desc", label: "Acreage ↓" },
  { value: "parcel_size_asc", label: "Acreage ↑" },
  { value: "airport_dist_asc", label: "Airport Proximity ↑" },
  { value: "airport_dist_desc", label: "Airport Distance ↓" },
];

function detectOwnerType(name) {
  if (!name) return "Individual";
  const u = name.toUpperCase();
  if (u.includes("LLC") || u.includes("L.L.C") || u.includes("INC") || u.includes("CORP") || u.includes("LTD")) return "LLC";
  if (u.includes("CHURCH") || u.includes("MINISTRY") || u.includes("PARISH") || u.includes("DIOCESE")) return "Church";
  if (u.includes("COUNTY") || u.includes("CITY OF") || u.includes("STATE OF") || u.includes("DEPT") || u.includes("AUTHORITY") || u.includes("MUNICIPAL")) return "Government";
  if (u.includes("TRUST") || u.includes("ESTATE")) return "Trust";
  return "Individual";
}

const DEFAULT_FILTERS = {
  minScore: 0,
  maxScore: 100,
  minAcres: 0,
  maxAcres: 200,
  maxAirportDist: 999,
  zoningTypes: [],
  ownerTypes: [],
  femaFilter: "any",
};

export function applyFiltersAndSort(results, filters, sortKey) {
  let out = results.filter(r => {
    if ((r.match_score || 0) < filters.minScore) return false;
    if ((r.match_score || 0) > filters.maxScore) return false;
    if (filters.minAcres > 0 && (r.parcel_size_acres || 0) < filters.minAcres) return false;
    if (filters.maxAcres < 200 && (r.parcel_size_acres || 0) > filters.maxAcres) return false;
    if (filters.maxAirportDist < 999 && r.airport_distance_miles != null && r.airport_distance_miles > filters.maxAirportDist) return false;
    if (filters.zoningTypes.length > 0 && !filters.zoningTypes.includes(r.zoning_classification)) return false;
    if (filters.ownerTypes.length > 0 && !filters.ownerTypes.includes(detectOwnerType(r.owner_name))) return false;
    if (filters.femaFilter === "hide_high" && r.fema_risk_factor?.toLowerCase().includes("high")) return false;
    if (filters.femaFilter === "low" && r.fema_risk_factor && !r.fema_risk_factor.toLowerCase().includes("low")) return false;
    return true;
  });

  out = [...out].sort((a, b) => {
    switch (sortKey) {
      case "match_score_asc": return (a.match_score || 0) - (b.match_score || 0);
      case "match_score_desc": return (b.match_score || 0) - (a.match_score || 0);
      case "parcel_size_asc": return (a.parcel_size_acres || 0) - (b.parcel_size_acres || 0);
      case "parcel_size_desc": return (b.parcel_size_acres || 0) - (a.parcel_size_acres || 0);
      case "airport_dist_asc": return (a.airport_distance_miles ?? 999) - (b.airport_distance_miles ?? 999);
      case "airport_dist_desc": return (b.airport_distance_miles ?? 0) - (a.airport_distance_miles ?? 0);
      default: return (b.match_score || 0) - (a.match_score || 0);
    }
  });

  return out;
}

export default function ResultsFilterSort({ results, onFiltered, currentSort, onSortChange }) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const zoningOptions = [...new Set(results.map(r => r.zoning_classification).filter(Boolean))];

  const apply = (newFilters) => {
    setFilters(newFilters);
    const filtered = applyFiltersAndSort(results, newFilters, currentSort);
    onFiltered(filtered);
  };

  const update = (key, value) => apply({ ...filters, [key]: value });

  const toggleArray = (key, val) => {
    const arr = filters[key];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    update(key, next);
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    onFiltered(applyFiltersAndSort(results, DEFAULT_FILTERS, currentSort));
  };

  const hasActive = filters.minScore > 0 || filters.maxScore < 100 ||
    filters.minAcres > 0 || filters.maxAcres < 200 || filters.maxAirportDist < 999 ||
    filters.zoningTypes.length > 0 || filters.ownerTypes.length > 0 || filters.femaFilter !== "any";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ fontFamily: "'Rajdhani', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center border-b border-border">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/50 transition-colors"
        >
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <span>Filter & Sort</span>
          {hasActive && <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">Active</span>}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />}
        </button>

        {/* Sort selector always visible */}
        <div className="flex items-center gap-1 px-3 border-l border-border">
          <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={currentSort}
            onChange={e => {
              onSortChange(e.target.value);
              onFiltered(applyFiltersAndSort(results, filters, e.target.value));
            }}
            className="text-xs bg-transparent text-foreground border-none outline-none cursor-pointer py-3 pr-1"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-4 space-y-5">
          {/* Match Score Range */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Match Score</label>
              <span className="text-xs text-primary font-bold">{filters.minScore}% – {filters.maxScore}%</span>
            </div>
            <div className="flex gap-3">
              <input type="range" min="0" max="100" step="5" value={filters.minScore}
                onChange={e => update("minScore", Math.min(parseInt(e.target.value), filters.maxScore - 5))}
                className="w-full accent-primary" />
              <input type="range" min="0" max="100" step="5" value={filters.maxScore}
                onChange={e => update("maxScore", Math.max(parseInt(e.target.value), filters.minScore + 5))}
                className="w-full accent-primary" />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>Min</span><span>Max</span></div>
          </div>

          {/* Parcel Size Range */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Parcel Size (acres)</label>
              <span className="text-xs text-primary font-bold">
                {filters.minAcres === 0 ? "Any" : `≥${filters.minAcres}ac`}
                {filters.maxAcres < 200 ? ` – ≤${filters.maxAcres}ac` : ""}
              </span>
            </div>
            <div className="flex gap-3">
              <input type="range" min="0" max="100" step="0.5" value={filters.minAcres}
                onChange={e => update("minAcres", Math.min(parseFloat(e.target.value), filters.maxAcres - 0.5))}
                className="w-full accent-primary" />
              <input type="range" min="1" max="200" step="1" value={filters.maxAcres}
                onChange={e => update("maxAcres", Math.max(parseFloat(e.target.value), filters.minAcres + 0.5))}
                className="w-full accent-primary" />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>Min</span><span>Max</span></div>
          </div>

          {/* Airport Proximity */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Max Airport Distance</label>
              <span className="text-xs text-primary font-bold">{filters.maxAirportDist >= 999 ? "Any" : `≤ ${filters.maxAirportDist} mi`}</span>
            </div>
            <input type="range" min="5" max="999" step="5" value={filters.maxAirportDist}
              onChange={e => update("maxAirportDist", parseInt(e.target.value))}
              className="w-full accent-primary" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>5 mi</span><span>Any</span></div>
          </div>

          {/* Zoning */}
          {zoningOptions.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-foreground block mb-2">Zoning Classification</label>
              <div className="flex flex-wrap gap-2">
                {zoningOptions.map(z => (
                  <button key={z} onClick={() => toggleArray("zoningTypes", z)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${filters.zoningTypes.includes(z) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-foreground border-border hover:border-primary/50"}`}>
                    {z}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Owner Type */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Owner Type</label>
            <div className="flex flex-wrap gap-2">
              {OWNER_TYPES.map(t => (
                <button key={t} onClick={() => toggleArray("ownerTypes", t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${filters.ownerTypes.includes(t) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-foreground border-border hover:border-primary/50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* FEMA Risk */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">FEMA Risk Factor</label>
            <div className="flex gap-2 flex-wrap">
              {FEMA_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => update("femaFilter", opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filters.femaFilter === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-foreground border-border hover:border-primary/50"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {hasActive && (
            <button onClick={reset} className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 font-semibold transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Reset All Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}