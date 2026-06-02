import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { parcelFullLookup } from "@/functions/parcelFullLookup";
import { ensureMapboxLoaded } from "@/lib/section6Proximity";
import { loadPublicConfig } from "@/lib/publicConfig";
import { getTargetGeometry, extendBoundsWithGeometry } from "@/lib/parcelGeometry";
import { Loader2, Crosshair, MapPin, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";

// Target A primary (thick), B/C secondary (thinner / dashed), nearby neutral thin.
const COLORS = ["#16A34A", "#2563EB", "#9333EA"]; // A / B / C

/**
 * HawkParcelBoundaryMap — interactive parcel-boundary map for the SCIP generator.
 *
 * Source of truth: record.parcel_targets[record.active_target_index] = Target A.
 * Reads geometry stored on the target; if Target A has none, fetches it via
 * parcelFullLookup (lat/lng) and writes boundary_geojson back onto the target so
 * the SCIP generator can reuse it.
 *
 * Toggles: Target A (on), All Candidate Boundaries (off), Nearby (off + disabled
 * unless nearby geometry is already present — we never auto-fetch to keep it fast).
 */
export default function HawkParcelBoundaryMap({ record, onUpdate }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMovedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [fetching, setFetching] = useState(false);

  const targets = record.parcel_targets || [];
  const idx = record.active_target_index || 0;
  const targetA = targets[idx] || null;

  const [showA, setShowA] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const aGeom = getTargetGeometry(targetA);
  const towerLat = targetA ? Number(targetA.latitude ?? record.latitude) : null;
  const towerLon = targetA ? Number(targetA.longitude ?? record.longitude) : null;

  // ── Fetch Target A boundary if missing, store it back on the target ──
  const fetchBoundary = useCallback(async () => {
    if (!targetA || aGeom) return;
    if (towerLat == null || towerLon == null || isNaN(towerLat) || isNaN(towerLon)) return;
    setFetching(true);
    try {
      const res = await parcelFullLookup({ lat: towerLat, lng: towerLon, enrich_depth: "light" });
      const geo = res.data?.parcel?.boundary_geojson || null;
      if (!geo) { toast.error("Parcel boundary not available for Target A."); return; }
      const nextTargets = targets.map((t, i) => (i === idx ? { ...t, boundary_geojson: geo } : t));
      const updated = await base44.entities.ScipRecord.update(record.id, { parcel_targets: nextTargets });
      onUpdate(updated);
      toast.success("Target A boundary fetched.");
    } catch {
      toast.error("Could not fetch parcel boundary.");
    } finally {
      setFetching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetA, aGeom, towerLat, towerLon, idx, record.id, targets]);

  useEffect(() => { if (targetA && !aGeom) fetchBoundary(); }, [targetA, aGeom, fetchBoundary]);

  // ── Init map ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current || towerLat == null || towerLon == null || isNaN(towerLat) || isNaN(towerLon)) return;
      const cfg = await loadPublicConfig();
      await ensureMapboxLoaded();
      if (cancelled || !containerRef.current) return;
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [towerLon, towerLat],
        zoom: 16,
        preserveDrawingBuffer: true,
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");
      map.on("dragstart", () => { userMovedRef.current = true; });
      map.on("zoomstart", (e) => { if (e.originalEvent) userMovedRef.current = true; });
      map.on("load", () => {
        if (cancelled) return;
        // Proposed tower / site marker at Target A center — polished cell-tower badge.
        const el = document.createElement("div");
        el.title = "Target A";
        el.style.cssText = "width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid #16A34A;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 10px rgba(22,163,74,0.7);color:#16A34A;";
        // Lucide RadioTower icon
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/><path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/><circle cx="12" cy="9" r="2"/><path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/><path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/><path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/></svg>';
        new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([towerLon, towerLat]).addTo(map);
        mapRef.current = map; setReady(true);
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerLat, towerLon]);

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = new window.mapboxgl.LngLatBounds([towerLon, towerLat], [towerLon, towerLat]);
    if (showA) extendBoundsWithGeometry(b, aGeom);
    if (showAll) targets.forEach((t) => extendBoundsWithGeometry(b, getTargetGeometry(t)));
    map.fitBounds(b, { padding: 80, duration: 600, maxZoom: 18 });
  }, [showA, showAll, aGeom, targets, towerLat, towerLon]);

  // ── Render layers when ready / toggles change ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Clear previous boundary layers/sources.
    ["A", "0", "1", "2"].forEach((k) => {
      ["fill", "line"].forEach((suf) => {
        const id = `parcel-${k}-${suf}`;
        if (map.getLayer(id)) map.removeLayer(id);
      });
      const sid = `parcel-${k}`;
      if (map.getSource(sid)) map.removeSource(sid);
    });

    const drawTarget = (t, i, isActive) => {
      const geom = getTargetGeometry(t);
      if (!geom) return;
      const color = COLORS[i] || "#64748B";
      const sid = `parcel-${i}`;
      map.addSource(sid, {
        type: "geojson",
        data: { type: "Feature", geometry: geom, properties: { label: t.label || `Target ${"ABC"[i]}` } },
      });
      map.addLayer({ id: `parcel-${i}-fill`, type: "fill", source: sid, paint: { "fill-color": color, "fill-opacity": isActive ? 0.12 : 0.05 } });
      map.addLayer({
        id: `parcel-${i}-line`, type: "line", source: sid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": isActive ? 4 : 2, ...(isActive ? {} : { "line-dasharray": [2, 1.5] }) },
      });
    };

    if (showAll) {
      targets.forEach((t, i) => drawTarget(t, i, i === idx));
    } else if (showA) {
      drawTarget(targetA, idx, true);
    }

    if (!userMovedRef.current) recenter();
  }, [ready, showA, showAll, targets, targetA, idx, recenter]);

  if (!targetA) {
    return (
      <div className="flex items-center gap-2 text-sm rounded-lg p-3" style={{ background: "#FEF3C7", color: "#92400E" }}>
        <AlertTriangle className="w-4 h-4 shrink-0" />
        Target A must be selected before the parcel map can be shown. Run Step 3 (Find 3 Best Parcels) first.
      </div>
    );
  }

  return (
    <div>
      {/* Toggles */}
      <div className="flex items-center gap-4 flex-wrap mb-3 text-sm">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showA} onChange={(e) => setShowA(e.target.checked)} disabled={showAll} />
          <span className="inline-flex items-center gap-1.5" style={{ color: SKYWAVE.navy }}>
            <span className="w-3 h-3 rounded-sm" style={{ background: COLORS[0] }} /> Target A Boundary
          </span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span style={{ color: SKYWAVE.navy }}>All Candidate Boundaries (A/B/C)</span>
        </label>
        <label className="inline-flex items-center gap-2 opacity-50 cursor-not-allowed" title="Nearby parcel geometry is not loaded for this site.">
          <input type="checkbox" checked={false} disabled readOnly />
          <span style={{ color: SKYWAVE.muted }}>Nearby Parcel Boundaries</span>
        </label>
        <button
          onClick={recenter}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ml-auto"
          style={{ border: `1.5px solid ${SKYWAVE.blue}`, color: SKYWAVE.blue }}
        >
          <Crosshair className="w-3.5 h-3.5" /> Recenter
        </button>
      </div>

      <div className="relative w-full rounded-lg overflow-hidden border" style={{ borderColor: SKYWAVE.line, height: 460, background: "#0C1B2E" }}>
        <div ref={containerRef} className="absolute inset-0" />
        {/* Target A info pill */}
        <div className="absolute top-3 left-3 z-[400] rounded-lg shadow-lg bg-white/95 backdrop-blur px-3 py-2 max-w-[60%]">
          <div className="text-[10px] font-mono tracking-[0.2em]" style={{ color: COLORS[0] }}>TARGET A</div>
          <div className="text-xs font-bold leading-tight" style={{ color: SKYWAVE.navy }}>
            {targetA.owner_name || "—"}
          </div>
          <div className="text-[11px]" style={{ color: SKYWAVE.muted }}>
            {targetA.apn ? `APN ${targetA.apn}` : ""}
            {targetA.acreage != null ? `${targetA.apn ? " · " : ""}${Number(targetA.acreage).toFixed(2)} ac` : ""}
          </div>
        </div>
        {/* Loading boundary fetch */}
        {fetching && (
          <div className="absolute inset-0 z-[450] flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-2 text-sm" style={{ color: SKYWAVE.navy }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Fetching Target A boundary…
            </div>
          </div>
        )}
        {/* Empty state — no boundary available and not fetching */}
        {ready && !fetching && !aGeom && (
          <div className="absolute bottom-3 left-3 right-3 z-[450] rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: "#FEF3C7", color: "#92400E" }}>
            <MapPin className="w-4 h-4 shrink-0" /> Parcel boundary not available for Target A. The proposed tower location is marked at the center.
          </div>
        )}
      </div>
    </div>
  );
}