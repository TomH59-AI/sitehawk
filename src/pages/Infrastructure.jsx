/**
 * Infrastructure — dedicated map view for Power + Fiber Optics overlays
 * with a utility-contacts sidebar.
 *
 * Inputs (any of):
 *   • Route state: { lat, lon, label } (preferred — passed from Hawk Vision / SCIP)
 *   • URL query:   ?lat=...&lon=...&label=...
 *   • Manual entry: lat/lon fields in the toolbar
 *
 * Reuses the existing self-contained map + sidebar from SCIP Section 3
 * so behavior, toggles, and APWA color coding stay identical.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Crosshair, Network, Zap, Cable } from "lucide-react";
import InfrastructureMap from "../components/scip/section3/InfrastructureMap";
import InfrastructureSidebar from "../components/scip/section3/InfrastructureSidebar";
import FiberDistanceIndicator from "../components/scip/section3/FiberDistanceIndicator";

// Haversine miles between two {lat, lon} points.
function haversineMiles(a, b) {
  if (!a || !b) return null;
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function findNearestFiber(target, assets) {
  if (!target || !assets?.fiber) return null;
  let best = null;
  const consider = (lat, lon, operator, kind) => {
    const d = haversineMiles(target, { lat, lon });
    if (d == null) return;
    if (!best || d < best.miles) best = { lat, lon, miles: d, operator: operator || null, kind: kind || null };
  };
  for (const p of assets.fiber.points || []) consider(p.lat, p.lon, p.operator, p.kind);
  for (const l of assets.fiber.lines || []) {
    for (const [lon, lat] of l.coords || []) consider(lat, lon, l.operator, l.kind || "line");
  }
  return best;
}

export default function Infrastructure() {
  const { state } = useLocation();

  // Seed coords from route state → URL query → empty
  const initial = useMemo(() => {
    const qp = new URLSearchParams(window.location.search);
    return {
      lat: state?.lat ?? qp.get("lat") ?? "",
      lon: state?.lon ?? qp.get("lon") ?? "",
      label: state?.label ?? qp.get("label") ?? "",
    };
  }, [state]);

  const [latInput, setLatInput] = useState(String(initial.lat || ""));
  const [lonInput, setLonInput] = useState(String(initial.lon || ""));
  const [label, setLabel] = useState(initial.label || "");
  const [coords, setCoords] = useState({
    lat: initial.lat ? parseFloat(initial.lat) : null,
    lon: initial.lon ? parseFloat(initial.lon) : null,
  });
  const [mapKey, setMapKey] = useState(0); // force-remount map on new coords

  const [assets, setAssets] = useState(null);
  const nearestFiber = useMemo(() => {
    if (coords.lat == null || coords.lon == null) return null;
    return findNearestFiber({ lat: coords.lat, lon: coords.lon }, assets);
  }, [assets, coords]);

  // If route state changes (e.g. coming back from another page), update the view
  useEffect(() => {
    if (initial.lat && initial.lon) {
      setLatInput(String(initial.lat));
      setLonInput(String(initial.lon));
      setLabel(initial.label || "");
      setCoords({ lat: parseFloat(initial.lat), lon: parseFloat(initial.lon) });
      setMapKey((k) => k + 1);
    }
  }, [initial.lat, initial.lon, initial.label]);

  const applyCoords = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (!isFinite(lat) || !isFinite(lon)) return;
    setCoords({ lat, lon });
    setAssets(null);
    setMapKey((k) => k + 1);
  };

  const hasCoords = coords.lat != null && coords.lon != null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/10 via-transparent to-transparent border border-cyan-500/30">
        <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em] mb-0.5">SITEHAWK · INFRASTRUCTURE</div>
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-600" />
          <h1 className="font-heading font-bold text-xl text-foreground">
            Infrastructure View — Power & Fiber Optics
          </h1>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Toggle Power (APWA red) and Fiber Optics (APWA orange) overlays · 1-mile radius from waypoint ·
          utility provider contacts on the right.
        </div>
      </div>

      {/* Coordinate toolbar */}
      <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Latitude</label>
          <input
            value={latInput}
            onChange={(e) => setLatInput(e.target.value)}
            placeholder="27.9506"
            className="w-32 px-2 py-1.5 text-sm font-mono border border-border rounded bg-background"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Longitude</label>
          <input
            value={lonInput}
            onChange={(e) => setLonInput(e.target.value)}
            placeholder="-82.4572"
            className="w-32 px-2 py-1.5 text-sm font-mono border border-border rounded bg-background"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Label (optional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Site name or owner"
            className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background"
          />
        </div>
        <button
          onClick={applyCoords}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded font-mono font-bold text-[11px] tracking-[0.15em] bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400"
        >
          <Crosshair className="w-3.5 h-3.5" /> SET WAYPOINT
        </button>

        {/* Quick legend */}
        <div className="flex items-center gap-3 ml-auto text-[10px] font-mono">
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <Zap className="w-3 h-3" /> POWER
          </span>
          <span className="inline-flex items-center gap-1.5 text-orange-700">
            <Cable className="w-3 h-3" /> FIBER
          </span>
        </div>
      </div>

      {/* Active waypoint banner */}
      {hasCoords && (
        <div className="text-xs font-mono text-muted-foreground">
          <span className="text-foreground font-bold">{label || "WAYPOINT"}</span> · {coords.lat.toFixed(6)}, {coords.lon.toFixed(6)}
        </div>
      )}

      {/* Map + sidebar */}
      {hasCoords ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
            <InfrastructureMap
              key={mapKey}
              centerLat={coords.lat}
              centerLon={coords.lon}
              targetLat={coords.lat}
              targetLon={coords.lon}
              onAssetsReady={setAssets}
              nearestFiber={nearestFiber}
            />
            <InfrastructureSidebar
              targetLat={coords.lat}
              targetLon={coords.lon}
              nearestFiber={nearestFiber}
            />
          </div>
          {/* Standalone fiber distance gauge below the map for at-a-glance read */}
          <div className="border-t border-border bg-muted/30">
            <FiberDistanceIndicator
              distanceMiles={nearestFiber?.miles}
              operator={nearestFiber?.operator}
              infraType={nearestFiber?.kind}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
          <Crosshair className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm text-muted-foreground">
            Enter a latitude and longitude above, or open this page from a Hawk Vision target.
          </div>
        </div>
      )}
    </div>
  );
}