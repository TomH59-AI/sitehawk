import { Fragment, useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
import { createRoot } from "react-dom/client";
import { base44 } from "@/api/base44Client";
import { MousePointer2, Loader2, RotateCcw, Circle as CircleIcon } from "lucide-react";
import TalonFitPopup from "./TalonFitPopup";

const FT_TO_M = 0.3048;

function markerColor(decision) {
  if (decision === "APPROVED") return "#16a34a";
  if (decision === "REJECTED") return "#dc2626";
  return "#f59e0b";
}

function createMarkerEl(decision, label) {
  const color = markerColor(decision);
  const glyph = label || (decision === "APPROVED" ? "✓" : decision === "REJECTED" ? "✗" : "?");
  const el = document.createElement("div");
  el.style.cssText = `display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);color:#fff;font:700 13px sans-serif;cursor:pointer;`;
  el.textContent = glyph;
  return el;
}

function createSrcMarkerEl() {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#0891b2;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);color:#fff;font:700 9px sans-serif;";
  el.textContent = "SRC";
  return el;
}

function createTowerMarkerEl() {
  const el = document.createElement("div");
  el.className = "tower-marker";
  el.style.cssText = "width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;cursor:pointer;";
  return el;
}

function createGeoJSONCircle(lon, lat, radiusKm, steps = 64) {
  return turf.circle([lon, lat], radiusKm, { steps, units: "kilometers" });
}

function makeRingFeature(anchor, radiusMiles) {
  try {
    return turf.circle([anchor.lon, anchor.lat], radiusMiles, { units: "miles", steps: 64 });
  } catch {
    return null;
  }
}

/**
 * TalonFitMap — full-page Mapbox GL JS map with satellite-streets basemap,
 * 2-mile search ring, tower marker, fall-zone circle, 2D/3D toggle, smart
 * cursor, probe popup, auto-selected targets, and saved sites.
 */
export default function TalonFitMap({
  anchor,
  radiusMiles,
  probe,
  saved,
  autoTargets,
  onProbe,
  onSave,
  canSave,
  saving,
  nextLetter,
  heightFt,
  onReset,
  solveResult,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [is3D, setIs3D] = useState(false);
  const [smartCursor, setSmartCursor] = useState(false);
  const [hover, setHover] = useState(null);
  const [showFallZone, setShowFallZone] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);

  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const popupRootRef = useRef(null);
  const hoverMarkerRef = useRef(null);
  const hoverPopupRef = useRef(null);
  const hoverPopupRootRef = useRef(null);
  const lastClickRef = useRef(0);
  const smartCursorReqRef = useRef(0);
  const smartCursorDebounceRef = useRef(null);

  const openPopup = useCallback((map, probeOrTarget, saveProps, hideSave) => {
    if (popupRootRef.current) {
      popupRootRef.current.unmount();
      popupRootRef.current = null;
    }
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    const popupNode = document.createElement("div");
    const root = createRoot(popupNode);
    popupRootRef.current = root;

    let content;
    if (probeOrTarget.solving) {
      content = (
        <div className="flex items-center gap-2 py-1 text-xs text-slate-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Grading with TalonFit-AI-1.0…
        </div>
      );
    } else if (probeOrTarget.error || !probeOrTarget.solve) {
      content = <div className="py-1 text-xs text-red-600">{probeOrTarget.error || "Solver returned no result."}</div>;
    } else {
      content = (
        <TalonFitPopup
          probe={probeOrTarget}
          hideSave={hideSave}
          onSave={saveProps?.onSave}
          canSave={saveProps?.canSave}
          saving={saveProps?.saving}
          nextLetter={saveProps?.nextLetter}
        />
      );
    }

    root.render(content);

    const popup = new mapboxgl.Popup({ maxWidth: "340px", minWidth: "280px", offset: 20 })
      .setDOMContent(popupNode)
      .setLngLat([probeOrTarget.lon, probeOrTarget.lat])
      .addTo(map);

    popup.on("close", () => {
      if (popupRootRef.current) {
        popupRootRef.current.unmount();
        popupRootRef.current = null;
      }
    });

    popupRef.current = popup;
  }, []);

  // Initialize map
  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [anchor.lon, anchor.lat],
      zoom: 16,
      pitch: 0,
      bearing: 0,
      scrollZoom: true,
      dragPan: true,
      touchZoomRotate: true,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-left");
    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);

      const multiplier = solveResult?.calculated_result?.effective_fall_zone_multiplier ?? 1;
      const radiusM = (heightFt || 199) * FT_TO_M * multiplier;
      const fallZone = createGeoJSONCircle(anchor.lon, anchor.lat, radiusM / 1000);

      map.addSource("fall-zone", { type: "geojson", data: fallZone });
      map.addLayer({
        id: "fall-zone-fill",
        type: "fill",
        source: "fall-zone",
        paint: { "fill-color": "#06b6d4", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "fall-zone-line",
        type: "line",
        source: "fall-zone",
        paint: { "line-color": "#06b6d4", "line-width": 2, "line-dasharray": [4, 3] },
      });

      const ring = makeRingFeature(anchor, radiusMiles);
      if (ring) {
        map.addSource("search-ring", { type: "geojson", data: ring });
        map.addLayer({
          id: "search-ring-line",
          type: "line",
          source: "search-ring",
          paint: { "line-color": "#06b6d4", "line-width": 2 },
        });
        map.addLayer({
          id: "search-ring-fill",
          type: "fill",
          source: "search-ring",
          paint: { "fill-color": "#06b6d4", "fill-opacity": 0.04 },
        });
      }
    });

    return () => {
      if (popupRootRef.current) {
        popupRootRef.current.unmount();
        popupRootRef.current = null;
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      if (hoverPopupRootRef.current) {
        hoverPopupRootRef.current.unmount();
        hoverPopupRootRef.current = null;
      }
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.remove();
        hoverMarkerRef.current = null;
      }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (smartCursorDebounceRef.current) clearTimeout(smartCursorDebounceRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fly to anchor changes and refresh dynamic sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [anchor.lon, anchor.lat], zoom: 16, duration: 1200 });

    const multiplier = solveResult?.calculated_result?.effective_fall_zone_multiplier ?? 1;
    const radiusM = (heightFt || 199) * FT_TO_M * multiplier;
    const fallZoneSource = map.getSource("fall-zone");
    if (fallZoneSource) {
      fallZoneSource.setData(createGeoJSONCircle(anchor.lon, anchor.lat, radiusM / 1000));
    }

    const ringSource = map.getSource("search-ring");
    if (ringSource) {
      const ring = makeRingFeature(anchor, radiusMiles);
      if (ring) ringSource.setData(ring);
    }
  }, [anchor.lat, anchor.lon, heightFt, solveResult, radiusMiles]);

  // Tower marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isTower) { m.remove(); return false; }
      return true;
    });
    const el = createTowerMarkerEl();
    const marker = new mapboxgl.Marker(el).setLngLat([anchor.lon, anchor.lat]).addTo(map);
    marker._isTower = true;
    markersRef.current.push(marker);
  }, [anchor, mapLoaded]);

  // Search ring center (SRC) marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isSrc) { m.remove(); return false; }
      return true;
    });
    const el = createSrcMarkerEl();
    const marker = new mapboxgl.Marker(el).setLngLat([anchor.lon, anchor.lat]).addTo(map);
    marker._isSrc = true;
    markersRef.current.push(marker);
  }, [anchor, mapLoaded]);

  // Auto-selected target markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isAuto) { m.remove(); return false; }
      return true;
    });
    autoTargets.forEach((t, i) => {
      const el = createMarkerEl(t.decision, ["A", "B", "C"][i]);
      const marker = new mapboxgl.Marker(el).setLngLat([t.lon, t.lat]).addTo(map);
      marker._isAuto = true;
      marker.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        openPopup(map, t, null, true);
      });
      markersRef.current.push(marker);
    });
  }, [autoTargets, mapLoaded, openPopup]);

  // Saved site markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isSaved) { m.remove(); return false; }
      return true;
    });
    saved.forEach((s, i) => {
      const el = createMarkerEl(s.decision, ["D", "E", "F"][i]);
      const marker = new mapboxgl.Marker(el).setLngLat([s.longitude, s.latitude]).addTo(map);
      marker._isSaved = true;
      markersRef.current.push(marker);
    });
  }, [saved, mapLoaded]);

  // Probe marker + popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current = markersRef.current.filter((m) => {
      if (m._isProbe) { m.remove(); return false; }
      return true;
    });

    if (!probe) {
      if (popupRootRef.current) {
        popupRootRef.current.unmount();
        popupRootRef.current = null;
      }
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    const el = createMarkerEl(probe.solve?.calculated_result?.decision, "?");
    const marker = new mapboxgl.Marker(el).setLngLat([probe.lon, probe.lat]).addTo(map);
    marker._isProbe = true;
    markersRef.current.push(marker);

    openPopup(map, probe, { onSave, canSave, saving, nextLetter }, false);
  }, [probe, canSave, saving, nextLetter, onSave, mapLoaded, openPopup]);

  // Fall zone visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("fall-zone-fill")) {
      map.setLayoutProperty("fall-zone-fill", "visibility", showFallZone ? "visible" : "none");
    }
    if (map.getLayer("fall-zone-line")) {
      map.setLayoutProperty("fall-zone-line", "visibility", showFallZone ? "visible" : "none");
    }
  }, [showFallZone]);

  // Click handling: single-click probes, double-click saves
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleClick = (e) => {
      const now = Date.now();
      if (now - lastClickRef.current < 400) {
        if (canSave) onSave(e.lngLat.lat, e.lngLat.lng);
      } else {
        const ring = makeRingFeature(anchor, radiusMiles);
        if (ring) {
          try {
            if (!turf.booleanPointInPolygon([e.lngLat.lng, e.lngLat.lat], ring)) return;
          } catch {
            // fall through to probe
          }
        }
        onProbe({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      }
      lastClickRef.current = now;
    };
    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [onProbe, onSave, canSave, anchor, radiusMiles]);

  // Smart cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMove = (e) => {
      if (!smartCursor) return;
      const pt = e.point;
      const { lat, lng } = e.lngLat;
      if (smartCursorDebounceRef.current) clearTimeout(smartCursorDebounceRef.current);
      smartCursorDebounceRef.current = setTimeout(() => doSolve(lat, lng, pt), 700);
    };

    const handleMouseOut = () => {
      if (smartCursorDebounceRef.current) clearTimeout(smartCursorDebounceRef.current);
    };

    map.on("mousemove", handleMove);
    map.on("mouseout", handleMouseOut);

    return () => {
      map.off("mousemove", handleMove);
      map.off("mouseout", handleMouseOut);
      if (smartCursorDebounceRef.current) clearTimeout(smartCursorDebounceRef.current);
    };
  }, [smartCursor, heightFt, anchor, saved.length]);

  const doSolve = useCallback(async (lat, lon, pt) => {
    const reqId = ++smartCursorReqRef.current;
    setHover({ px: pt, solving: true, point: { lat, lon }, result: null });
    try {
      const { data } = await base44.functions.invoke("talonfitAiSolve", {
        lat,
        lon,
        center_lat: anchor.lat,
        center_lon: anchor.lon,
        requested_height_ft: Number(heightFt) || 199,
        compound_width_ft: 100,
        compound_depth_ft: 100,
        saved_count: saved.length,
      });
      if (reqId !== smartCursorReqRef.current) return;
      setHover({ px: pt, solving: false, point: { lat, lon }, result: data });
    } catch (e) {
      if (reqId !== smartCursorReqRef.current) return;
      setHover({ px: pt, solving: false, point: { lat, lon }, result: null, error: e?.message || "Solver failed" });
    }
  }, [anchor, heightFt, saved.length]);

  // Smart cursor hover marker + popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!smartCursor || !hover?.result) {
      if (hoverPopupRootRef.current) {
        hoverPopupRootRef.current.unmount();
        hoverPopupRootRef.current = null;
      }
      if (hoverPopupRef.current) {
        hoverPopupRef.current.remove();
        hoverPopupRef.current = null;
      }
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.remove();
        hoverMarkerRef.current = null;
      }
      return;
    }

    const r = hover.result.calculated_result || {};
    const cp = hover.result.candidate_point;
    if (!cp) return;

    if (hoverMarkerRef.current) hoverMarkerRef.current.remove();
    const el = createMarkerEl(r.decision, r.decision === "APPROVED" ? "✓" : r.decision === "REJECTED" ? "✗" : "?");
    hoverMarkerRef.current = new mapboxgl.Marker(el).setLngLat([cp.longitude, cp.latitude]).addTo(map);

    if (hoverPopupRootRef.current) {
      hoverPopupRootRef.current.unmount();
      hoverPopupRootRef.current = null;
    }
    if (hoverPopupRef.current) {
      hoverPopupRef.current.remove();
      hoverPopupRef.current = null;
    }

    const popupNode = document.createElement("div");
    const root = createRoot(popupNode);
    hoverPopupRootRef.current = root;
    const colorClass = r.decision === "APPROVED" ? "text-green-400" : r.decision === "REJECTED" ? "text-red-400" : "text-amber-400";
    root.render(
      <div className="space-y-0.5 text-[11px]">
        <div className={`font-bold ${colorClass}`}>
          {r.decision || "VERIFY"}
          {Number.isFinite(r.maximum_buildable_height_ft) ? ` · ${r.maximum_buildable_height_ft} ft` : ""}
        </div>
        <div className="text-slate-300">{r.binding_constraint || ""}</div>
      </div>
    );
    const popup = new mapboxgl.Popup({ closeButton: false, offset: 20, maxWidth: "220px" })
      .setDOMContent(popupNode)
      .setLngLat([cp.longitude, cp.latitude])
      .addTo(map);
    popup.on("close", () => {
      if (hoverPopupRootRef.current) {
        hoverPopupRootRef.current.unmount();
        hoverPopupRootRef.current = null;
      }
    });
    hoverPopupRef.current = popup;
  }, [hover, smartCursor, mapLoaded]);

  const handleReset = useCallback(() => {
    onReset?.();
    setHover(null);
    setSmartCursor(false);
    const map = mapRef.current;
    if (map) map.flyTo({ center: [anchor.lon, anchor.lat], zoom: 16, duration: 800 });
  }, [onReset, anchor]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* 2D / 3D toggle */}
      <button
        onClick={() => {
          const next = !is3D;
          setIs3D(next);
          mapRef.current?.easeTo({
            pitch: next ? 60 : 0,
            bearing: next ? -20 : 0,
            duration: 800,
          });
        }}
        className="absolute top-3 right-3 z-10 px-3 py-1.5 text-xs font-bold bg-slate-900/90 text-cyan-400 border border-cyan-500/40 rounded hover:bg-slate-800 transition-colors"
      >
        {is3D ? "2D" : "3D"}
      </button>

      {/* Map control buttons */}
      <div className="absolute right-3 top-14 z-[1000] flex flex-col items-end gap-1.5">
        <button
          onClick={() => { setSmartCursor((s) => !s); if (smartCursor) setHover(null); }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-lg transition-all ${
            smartCursor ? "border-cyan-400 bg-cyan-500 text-slate-900" : "border-white/15 bg-slate-900/85 text-white/80 hover:text-white"
          }`}
          title="Smart Cursor — hover any parcel for an instant TalonFit verdict"
        >
          <MousePointer2 className="h-3.5 w-3.5" /> Smart Cursor
        </button>
        <button
          onClick={() => setShowFallZone((s) => !s)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-lg transition-all ${
            showFallZone ? "border-cyan-400 bg-cyan-500 text-slate-900" : "border-white/15 bg-slate-900/85 text-white/80 hover:text-white"
          }`}
          title="Toggle fall zone circle visibility"
        >
          <CircleIcon className="h-3.5 w-3.5" /> Fall Zone
        </button>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-slate-900/85 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 shadow-lg transition-all hover:text-white"
          title="Clear probes and re-center — saved sites are kept"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset Map
        </button>
      </div>

      {/* Smart cursor tooltip */}
      {smartCursor && hover?.result && (
        <div
          className="pointer-events-none absolute z-[999] max-w-[220px] rounded-lg border border-white/15 bg-slate-900/95 px-2.5 py-1.5 text-[11px] text-white shadow-xl"
          style={{ left: (hover.px?.x ?? 0) + 14, top: (hover.px?.y ?? 0) + 14 }}
        >
          {hover.solving ? (
            <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Solving…</span>
          ) : (
            <>
              <div className={`font-bold ${hover.result.calculated_result?.decision === "APPROVED" ? "text-green-400" : hover.result.calculated_result?.decision === "REJECTED" ? "text-red-400" : "text-amber-400"}`}>
                {hover.result.calculated_result?.decision || "VERIFY"}
                {Number.isFinite(hover.result.calculated_result?.maximum_buildable_height_ft) ? ` · ${hover.result.calculated_result.maximum_buildable_height_ft} ft` : ""}
              </div>
              <div className="text-white/60">{hover.result.calculated_result?.binding_constraint || ""}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
