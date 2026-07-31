import { useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon } from "lucide-react";
import TigerBoundaryLayer from "./TigerBoundaryLayer";

// Census TIGERweb layer ids — [boundary, labels]
const LAYERS = [
  { key: "counties", label: "Counties", ids: ["82", "83"] },
  { key: "cities", label: "Cities / places", ids: ["28", "29", "30", "31"] },
  { key: "townships", label: "Townships", ids: ["22", "23"] },
  { key: "zips", label: "ZIP codes", ids: ["2", "3"] },
  { key: "states", label: "States", ids: ["80", "81"] },
];

const BASEMAPS = {
  Aerial:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  Streets:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
  Topo:
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
};

// In-page boundary map: Esri basemap + Census TIGERweb boundary overlays
// (counties, cities, townships, ZIPs) with labels — replaces the old external link.
export default function HawkBoltBoundaryMap() {
  const [on, setOn] = useState({ counties: true, cities: true, townships: true, zips: false, states: false });
  const [labels, setLabels] = useState(true);
  const [basemap, setBasemap] = useState("Streets");

  const activeIds = LAYERS.filter((l) => on[l.key]).flatMap((l) => (labels ? l.ids : [l.ids[0]]));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MapIcon className="h-4 w-4 text-primary" />
          Boundary Map
        </div>
        {LAYERS.map((l) => (
          <label key={l.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={!!on[l.key]}
              onChange={() => setOn((p) => ({ ...p, [l.key]: !p[l.key] }))}
              className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
            />
            {l.label}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={labels}
            onChange={() => setLabels((v) => !v)}
            className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
          />
          Labels
        </label>
        <div className="ml-auto flex gap-1">
          {Object.keys(BASEMAPS).map((b) => (
            <button
              key={b}
              onClick={() => setBasemap(b)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                basemap === b
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className="h-[520px] w-full border-t border-border">
        <MapContainer center={[42.33143, -83.04575]} zoom={8} className="h-full w-full" scrollWheelZoom>
          <TileLayer key={basemap} url={BASEMAPS[basemap]} attribution="Esri" maxZoom={19} zIndex={1} />
          <TigerBoundaryLayer layerIds={activeIds} />
        </MapContainer>
      </div>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Boundaries: U.S. Census TIGERweb. Basemap: Esri.
      </p>
    </div>
  );
}