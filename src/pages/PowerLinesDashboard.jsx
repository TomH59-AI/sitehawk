/**
 * PowerLinesDashboard — Live interactive map of HIFLD US transmission lines.
 *
 * - Mapbox GL viewport-driven query (server-side filtering by bbox + OWNER).
 * - Search box filters segments by power company (OWNER, case-insensitive).
 * - Click any line to see SUB_1 → SUB_2 + voltage + owner in the side panel.
 * - Ready to overlay on the active search ring (Target A) in the future.
 *
 * No CSV import needed — data is queried live from the HIFLD FeatureServer.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Zap, Search, Radio } from "lucide-react";
import PowerLinesMap from "../components/powerlines/PowerLinesMap";
import PowerLineDetailsPanel from "../components/powerlines/PowerLineDetailsPanel";

export default function PowerLinesDashboard() {
  const [ownerInput, setOwnerInput] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [count, setCount] = useState(0);
  const [showCellTowers, setShowCellTowers] = useState(false);
  const [towerCount, setTowerCount] = useState(0);

  function handleSearch(e) {
    e.preventDefault();
    setOwnerFilter(ownerInput.trim());
    setSelected(null);
  }

  function handleClear() {
    setOwnerInput("");
    setOwnerFilter("");
    setSelected(null);
  }

  function handleSelect(properties, lngLat) {
    setSelected({ properties, lngLat });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-amber-500/15 via-transparent to-transparent border border-amber-500/30 px-5 py-4 flex items-center gap-4">
        <Zap className="w-10 h-10 text-amber-500" />
        <div className="flex-1">
          <div className="text-[10px] font-mono text-amber-700 tracking-[0.3em]">POWER GRID · HIFLD LIVE</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">
            Transmission Line Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live US electric transmission lines from HIFLD. Pan/zoom the map to load segments. Search by owner and click any line to see its substation endpoints.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
        <Search className="w-4 h-4 text-muted-foreground ml-1" />
        <Input
          value={ownerInput}
          onChange={(e) => setOwnerInput(e.target.value)}
          placeholder="Search by OWNER (e.g. DUKE, FLORIDA POWER, TVA, AEP)…"
          className="flex-1 min-w-[240px]"
        />
        <Button type="submit">Search</Button>
        {ownerFilter && (
          <Button type="button" variant="outline" onClick={handleClear}>Clear</Button>
        )}
        <button
          type="button"
          onClick={() => setShowCellTowers((v) => !v)}
          className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded border transition ${
            showCellTowers
              ? "bg-purple-500/15 border-purple-500/50 text-purple-700"
              : "bg-transparent border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          Cell Towers {showCellTowers && `· ${towerCount}`}
        </button>
        <div className="text-xs text-muted-foreground font-mono ml-auto">
          {ownerFilter && <span className="text-amber-600 mr-3">OWNER ~ {ownerFilter.toUpperCase()}</span>}
          {count} segments in view
        </div>
      </form>

      {/* Map + details */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <PowerLinesMap
          ownerFilter={ownerFilter}
          onSelect={handleSelect}
          onCountChange={setCount}
          showCellTowers={showCellTowers}
          onTowerCountChange={setTowerCount}
        />
        <PowerLineDetailsPanel
          selected={selected}
          onClose={() => setSelected(null)}
        />
      </div>

      <div className="text-[10px] font-mono text-muted-foreground tracking-wider text-center pt-2">
        SOURCE · HIFLD US ELECTRIC POWER TRANSMISSION LINES FEATURESERVER · ZOOM ≥ 5 TO LOAD
      </div>
    </div>
  );
}