import { useState } from "react";
import { SlidersHorizontal, X, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

const OWNER_TYPES = ["LLC", "Church", "Government", "Trust", "Individual"];

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
  minAcres: 0,
  maxAcres: 100,
  minScore: 0,
  zoningTypes: [],
  ownerTypes: [],
  hideHighFema: false,
};

export default function FilterPanel({ results, extraResults, onFilterChange }) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const allResults = [...results, ...extraResults];

  // Derive unique zoning types from results
  const zoningOptions = [...new Set(allResults.map(r => r.zoning_classification).filter(Boolean))];

  const applyFilters = (newFilters) => {
    setFilters(newFilters);
    const filtered = allResults.filter(r => {
      if (newFilters.minAcres > 0 && (r.parcel_size_acres || 0) < newFilters.minAcres) return false;
      if ((r.match_score || 0) < newFilters.minScore) return false;
      if (newFilters.zoningTypes.length > 0 && !newFilters.zoningTypes.includes(r.zoning_classification)) return false;
      if (newFilters.ownerTypes.length > 0 && !newFilters.ownerTypes.includes(detectOwnerType(r.owner_name))) return false;
      if (newFilters.hideHighFema && r.fema_risk_factor && r.fema_risk_factor.toLowerCase().includes("high")) return false;
      return true;
    });
    onFilterChange(new Set(filtered.map(r => r.id)));
  };

  const update = (key, value) => {
    const next = { ...filters, [key]: value };
    applyFilters(next);
  };

  const toggleArray = (key, val) => {
    const arr = filters[key];
    const next = arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
    update(key, next);
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    onFilterChange(null); // null = show all
  };

  const hasActiveFilters = filters.minAcres > 0 || filters.minScore > 0 ||
    filters.zoningTypes.length > 0 || filters.ownerTypes.length > 0 ||
    filters.structureFilter !== "any" || filters.hideHighFema;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-primary" />
          <span>Filter Results</span>
          {hasActiveFilters && (
            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">Active</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border space-y-5 pt-4">
          {/* Min Acreage */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Min Acreage</label>
              <span className="text-xs text-primary font-bold">{filters.minAcres === 0 ? "Any" : `≥ ${filters.minAcres} ac`}</span>
            </div>
            <input
              type="range" min="0" max="50" step="0.25"
              value={filters.minAcres}
              onChange={e => update("minAcres", parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>Any</span><span>50 ac</span>
            </div>
          </div>

          {/* Min Match Score */}
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground">Min Match Score</label>
              <span className="text-xs text-primary font-bold">{filters.minScore === 0 ? "Any" : `≥ ${filters.minScore}%`}</span>
            </div>
            <input
              type="range" min="0" max="100" step="5"
              value={filters.minScore}
              onChange={e => update("minScore", parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
              <span>0%</span><span>100%</span>
            </div>
          </div>

          {/* Zoning Types */}
          {zoningOptions.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-foreground block mb-2">Zoning Type</label>
              <div className="flex flex-wrap gap-2">
                {zoningOptions.map(z => (
                  <button
                    key={z}
                    onClick={() => toggleArray("zoningTypes", z)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                      filters.zoningTypes.includes(z)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary text-foreground border-border hover:border-primary/50"
                    }`}
                  >
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
                <button
                  key={t}
                  onClick={() => toggleArray("ownerTypes", t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                    filters.ownerTypes.includes(t)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Structure Filter */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Structures</label>
            <div className="flex gap-2">
              {[
                { val: "any", label: "Any" },
                { val: "none", label: "No Structures" },
                { val: "one", label: "Allow 1" },
              ].map(opt => (
                <button
                  key={opt.val}
                  onClick={() => update("structureFilter", opt.val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    filters.structureFilter === opt.val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* FEMA Risk Toggle */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-red-500/20 bg-red-500/5">
            <div>
              <p className="text-xs font-semibold text-foreground">Hide High FEMA Risk Parcels</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Excludes parcels in high flood-risk zones</p>
            </div>
            <button
              onClick={() => update("hideHighFema", !filters.hideHighFema)}
              className={`relative w-10 h-5 rounded-full transition-colors ${filters.hideHighFema ? "bg-primary" : "bg-border"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${filters.hideHighFema ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 font-semibold transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All Filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}