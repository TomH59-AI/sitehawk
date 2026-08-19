import { useEffect, useRef, useState, useCallback } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import * as turf from "@turf/turf";
import { createRoot } from "react-dom/client";
import { base44 } from "@/api/base44Client";
import { MousePointer2, Loader2, RotateCcw, Circle as CircleIcon, Radio } from "lucide-react";

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

// Saved target pin: green filled circle, white D/E/F letter, 28px
function createSavedPinEl(letter) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);color:#fff;font:700 13px sans-serif;";
  el.textContent = letter;
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

const PROPAGATION_LAYER_IDS = [
  "talonfit-prop-towers",
  "talonfit-prop-opportunities-outline",
  "talonfit-prop-opportunities",
  "talonfit-prop-coverage-outline",
  "talonfit-prop-coverage",
  "talonfit-prop-coverage-raster",
];

const PROPAGATION_SOURCE_IDS = [
  "talonfit-prop-towers",
  "talonfit-prop-opportunities",
  "talonfit-prop-coverage",
  "talonfit-prop-coverage-raster",
];

function normalizePropagationBounds(bounds) {
  let north;
  let east;
  let south;
  let west;
  if (Array.isArray(bounds)) {
    [north, east, south, west] = bounds.map(Number);
  } else if (bounds) {
    north = Number(bounds.north);
    east = Number(bounds.east);
    south = Number(bounds.south);
    west = Number(bounds.west);
  }
  return [north, east, south, west].every(Number.isFinite)
    ? { north, east, south, west }
    : null;
}

function propagationTowerCollection(towers = []) {
  return {
    type: "FeatureCollection",
    features: towers
      .map((tower) => {
        const lat = Number(tower?.lat ?? tower?.latitude);
        const lng = Number(tower?.lng ?? tower?.lon ?? tower?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          type: "Feature",
          properties: {
            structure_type: tower.structure_type || "Registered structure",
            distance_miles: tower.distance_miles ?? null,
            source: tower.source || "FCC ASR",
          },
          geometry: { type: "Point", coordinates: [lng, lat] },
        };
      })
      .filter(Boolean),
  };
}

function clearPropagationLayers(map) {
  PROPAGATION_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  PROPAGATION_SOURCE_IDS.forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });
}

function addPropagationLayer(map, layer, beforeId) {
  if (beforeId) map.addLayer(layer, beforeId);
  else map.addLayer(layer);
}

function addPropagationLayers(map, propagation) {
  clearPropagationLayers(map);
  if (!propagation) return;

  const beforeId = map.getLayer("search-ring-fill") ? "search-ring-fill" : undefined;
  const coverage = propagation.coverage || {};
  const rasterBounds = normalizePropagationBounds(coverage?.raster?.bounds);
  const rasterUrl = coverage?.raster?.url;

  if (rasterBounds && rasterUrl) {
    map.addSource("talonfit-prop-coverage-raster", {
      type: "image",
      url: rasterUrl,
      coordinates: [
        [rasterBounds.west, rasterBounds.north],
        [rasterBounds.east, rasterBounds.north],
        [rasterBounds.east, rasterBounds.south],
        [rasterBounds.west, rasterBounds.south],
      ],
    });
    addPropagationLayer(map, {
      id: "talonfit-prop-coverage-raster",
      type: "raster",
      source: "talonfit-prop-coverage-raster",
      paint: { "raster-opacity": 0.55, "raster-fade-duration": 0 },
    }, beforeId);
  }

  if (coverage?.geometry) {
    map.addSource("talonfit-prop-coverage", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: coverage.properties || {},
        geometry: coverage.geometry,
      },
    });
    addPropagationLayer(map, {
      id: "talonfit-prop-coverage",
      type: "fill",
      source: "talonfit-prop-coverage",
      paint: {
        "fill-color": "#22c55e",
        "fill-opacity": rasterUrl ? 0.08 : 0.25,
      },
    }, beforeId);
    addPropagationLayer(map, {
      id: "talonfit-prop-coverage-outline",
      type: "line",
      source: "talonfit-prop-coverage",
      paint: { "line-color": "#86efac", "line-width": 1.5, "line-opacity": 0.95 },
    }, beforeId);
  }

  const opportunityZones =
    propagation.opportunityZones ||
    propagation.opportunity_zones ||
    { type: "FeatureCollection", features: [] };
  if (opportunityZones?.features?.length) {
    map.addSource("talonfit-prop-opportunities", {
      type: "geojson",
      data: opportunityZones,
    });
    addPropagationLayer(map, {
      id: "talonfit-prop-opportunities",
      type: "fill",
      source: "talonfit-prop-opportunities",
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["to-number", ["get", "score"]], 60],
          60,
          "#fbbf24",
          100,
          "#f97316",
        ],
        "fill-opacity": 0.5,
      },
    }, beforeId);
    addPropagationLayer(map, {
      id: "talonfit-prop-opportunities-outline",
      type: "line",
      source: "talonfit-prop-opportunities",
      paint: { "line-color": "#fed7aa", "line-width": 0.9 },
    }, beforeId);
  }

  const towers = propagationTowerCollection(propagation.towers || []);
  if (towers.features.length) {
    map.addSource("talonfit-prop-towers", { type: "geojson", data: towers });
    addPropagationLayer(map, {
      id: "talonfit-prop-towers",
      type: "circle",
      source: "talonfit-prop-towers",
      paint: {
        "circle-radius": 6,
        "circle-color": "#a855f7",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    }, beforeId);
  }
}

// Lazily add the 2-mile search ring source/layers (style must be loaded first)
function ensureRingLayers(map) {
  if (map.getSource("search-ring")) return;
  map.addSource("search-ring", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "search-ring-fill",
    type: "fill",
    source: "search-ring",
    paint: { "fill-color": "#06b6d4", "fill-opacity": 0.05 },
  });
  map.addLayer({
    id: "search-ring-line",
    type: "line",
    source: "search-ring",
    paint: { "line-color": "#06b6d4", "line-width": 2, "line-dasharray": [4, 3] },
  });
  map.addLayer({
    id: "search-ring-label",
    type: "symbol",
    source: "search-ring",
    layout: {
      "symbol-placement": "line",
      "text-field": "2 mi search ring",
      "text-size": 11,
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-offset": [0, 0.8],
    },
    paint: { "text-color": "#22d3ee", "text-halo-color": "#0f172a", "text-halo-width": 1.2 },
  });
}

function ensureFallZoneLayers(map) {
  if (map.getSource("fall-zone")) return;
  map.addSource("fall-zone", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
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
}

function updateAnchorLayers(map, anchor, heightFt, solveResult, radiusMiles) {
  if (!anchor) return;
  ensureFallZoneLayers(map);
  ensureRingLayers(map);
  const multiplier = solveResult?.calculated_result?.effective_fall_zone_multiplier ?? 1;
  const radiusM = (heightFt || 199) * FT_TO_M * multiplier;
  map.getSource("fall-zone").setData(createGeoJSONCircle(anchor.lon, anchor.lat, radiusM / 1000));
  const ring = makeRingFeature(anchor, radiusMiles);
  if (ring) map.getSource("search-ring").setData(ring);
}

// Ordinance rules can arrive as strings or structured objects — render either
function fmtRule(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const dist = v.fixed_distance_ft != null ? `${v.fixed_distance_ft} ft` : null;
    const rule = typeof v.rule === "string" ? v.rule : typeof v.description === "string" ? v.description : null;
    if (dist && rule) return `${dist} · ${rule}`;
    return dist || rule;
  }
  return String(v);
}

const PopupRow = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-0.5 text-xs text-slate-300">
    <span className="shrink-0">{label}</span>
    <span className="truncate pl-2 text-right font-medium">{value}</span>
  </div>
);

/**
 * ProbePopupContent — dark 280px verdict card rendered inside a mapboxgl.Popup.
 * Colored banner (GREEN approved / RED rejected / AMBER review) on top,
 * parcel + constraint rows in the middle, save footer at the bottom.
 */
function ProbePopupContent({ probe, hideSave, towerHeightFt, savedCount, onSave, saving, nextLetter }) {
  if (probe.solving) {
    return (
      <div className="w-[280px] rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Solving…
        </div>
      </div>
    );
  }
  if (probe.error || !probe.solve) {
    return (
      <div className="w-[280px] rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
        <div className="text-xs text-red-400">{probe.error || "Solver returned no result."}</div>
      </div>
    );
  }

  const result = probe.solve;
  const calc = result.calculated_result || {};
  const parcel = result.parcel || {};
  const details = result.parcel_details || {};
  const ordinance = result.ordinance || result.ordinance_rules || {};

  const verdict = String(result.verdict ?? calc.verdict ?? calc.decision ?? result.decision ?? "").toLowerCase();
  const isApproved = verdict === "approved";
  const isRejected = verdict === "rejected";

  const ht = towerHeightFt || 199;
  const maxBuildable = calc.max_buildable_height_ft ?? calc.maximum_buildable_height_ft ?? null;
  const acreage = parcel.acreage ?? details.acreage ?? null;
  const distToLine = calc.distance_to_property_line_ft ?? null;

  return (
    <div className="w-[280px] rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-xl">
      {/* ── Verdict banner ── */}
      {isApproved && (
        <div className="rounded-t-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white">
          ✅ BUILDABLE — {maxBuildable ?? ht} ft
          <div className="text-xs font-normal text-emerald-100">Tower fits on this parcel</div>
        </div>
      )}
      {isRejected && (
        <div className="rounded-t-md bg-red-700 px-3 py-2 text-sm font-bold text-white">
          ❌ REJECTED
          <div className="text-xs font-normal text-red-100">
            {calc.rejection_reasons?.[0] || ordinance.rejection_reason || calc.reasons?.[0] || "Zoning does not permit towers"}
          </div>
        </div>
      )}
      {!isApproved && !isRejected && (
        <div className="rounded-t-md bg-amber-600 px-3 py-2 text-sm font-bold text-white">
          ⚠️ REVIEW REQUIRED
          <div className="text-xs font-normal text-amber-100">
            {calc.conditions?.[0] || calc.reasons?.[0] || calc.binding_constraint || "—"}
          </div>
        </div>
      )}

      {/* ── Body rows ── */}
      <div className="mt-2">
        <PopupRow label="Owner" value={parcel.owner_name || details.owner || "Pending"} />
        <PopupRow label="APN" value={parcel.apn || parcel.parcel_id || "—"} />
        <PopupRow label="Acreage" value={acreage ? `${acreage} ac` : "—"} />
        <PopupRow label="Zoning" value={parcel.zoning || ordinance.zoning_district || parcel.zoning_classification || "—"} />
        <PopupRow label="Max Height" value={maxBuildable ? `${maxBuildable} ft` : `${ht} ft (unverified)`} />
        <PopupRow label="Setback rule" value={fmtRule(ordinance.property_line_rule ?? ordinance.setback_rule) || "—"} />
        <PopupRow label="Permit path" value={fmtRule(ordinance.approval_path ?? ordinance.permit_type) || "—"} />
        <PopupRow label="Dist to line" value={distToLine ? `${distToLine} ft` : "—"} />
        <PopupRow
          label="PE letter"
          value={calc.pe_letter_required === true ? "Yes" : calc.pe_letter_required === false ? "No" : "—"}
        />
      </div>

      {/* ── Footer ── */}
      {!hideSave && isRejected && (
        <p className="mt-2 text-center text-xs text-red-400">
          This site cannot be saved — tower is not permitted here.
        </p>
      )}
      {!hideSave && !isRejected && savedCount >= 3 && (
        <p className="mt-2 text-center text-xs text-slate-500">
          3 targets saved — remove one to add another.
        </p>
      )}
      {!hideSave && !isRejected && savedCount < 3 && (
        <button
          className="mt-2 w-full rounded bg-emerald-700 py-1.5 text-xs font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : `💾 Save as Target ${nextLetter}`}
        </button>
      )}
    </div>
  );
}

/**
 * TalonFitMap — full-page Mapbox GL JS map with satellite-streets basemap.
 * Renders immediately at world view ([0, 20], zoom 2); when a search ring
 * is set the map flies to it at zoom 15. Includes the 2-mile search ring,
 * tower marker, fall-zone circle, 2D/3D toggle, smart cursor, verdict
 * popup, auto-selected targets, and saved-site pins.
 */
export default function TalonFitMap({
  anchor,
  radiusMiles,
  probe,
  saved,
  autoTargets,
  onProbe,
  onSave,
  saving,
  nextLetter,
  heightFt,
  onReset,
  solveResult,
  sarfPacket,
  zoningDecision,
  propagationContext,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [is3D, setIs3D] = useState(false);
  const [smartCursor, setSmartCursor] = useState(false);
  const [hover, setHover] = useState(null);
  const [showFallZone, setShowFallZone] = useState(true);
  const [showPropagation, setShowPropagation] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);

  const markersRef = useRef([]);
  const popupRef = useRef(null);
  const popupRootRef = useRef(null);
  const hoverMarkerRef = useRef(null);
  const hoverPopupRef = useRef(null);
  const hoverPopupRootRef = useRef(null);
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

    root.render(
      <ProbePopupContent
        probe={probeOrTarget}
        hideSave={hideSave}
        towerHeightFt={saveProps?.towerHeightFt}
        savedCount={saveProps?.savedCount ?? 0}
        onSave={saveProps?.onSave}
        saving={saveProps?.saving}
        nextLetter={saveProps?.nextLetter}
      />
    );

    const popup = new window.mapboxgl.Popup({ maxWidth: "280px", minWidth: "280px", offset: 20 })
      .setDOMContent(popupNode)
      .setLngLat([probeOrTarget.lon, probeOrTarget.lat])
      .addTo(map);

    popup.on("close", () => {
      if (popupRootRef.current) {
        popupRootRef.current.unmount();
        popupRootRef.current = null;
      }
    });

    // Dark card look: neutralize mapbox's default white popup chrome
    const popupEl = popup.getElement();
    const contentEl = popupEl?.querySelector(".mapboxgl-popup-content");
    if (contentEl) {
      contentEl.style.background = "transparent";
      contentEl.style.padding = "0";
      contentEl.style.boxShadow = "none";
      contentEl.style.borderRadius = "0.5rem";
    }
    const tipEl = popupEl?.querySelector(".mapboxgl-popup-tip");
    if (tipEl) {
      tipEl.style.borderTopColor = "#0f172a";
      tipEl.style.borderBottomColor = "#0f172a";
      tipEl.style.borderLeftColor = "#0f172a";
      tipEl.style.borderRightColor = "#0f172a";
    }

    popupRef.current = popup;
  }, []);

  // Initialize map — immediately, at world view; no anchor required
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureMapboxLoaded();
      if (cancelled) return;
      const mapboxgl = window.mapboxgl;
      const cfg = await loadPublicConfig();
      if (cancelled) return;
      mapboxgl.accessToken = cfg?.mapboxAccessToken || "";
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: anchor ? [anchor.lon, anchor.lat] : [0, 20],
        zoom: anchor ? 15 : 2,
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
        if (anchor) updateAnchorLayers(map, anchor, heightFt, solveResult, radiusMiles);
      });
    })();

    return () => {
      cancelled = true;
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
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Fly to anchor changes (Set Ring → zoom 15) and refresh dynamic sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !anchor) return;
    map.flyTo({ center: [anchor.lon, anchor.lat], zoom: 15, duration: 1200 });
    updateAnchorLayers(map, anchor, heightFt, solveResult, radiusMiles);
  }, [anchor?.lat, anchor?.lon, heightFt, solveResult, radiusMiles, mapLoaded]);

  // Tower marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !anchor) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isTower) { m.remove(); return false; }
      return true;
    });
    const el = createTowerMarkerEl();
    const marker = new window.mapboxgl.Marker(el).setLngLat([anchor.lon, anchor.lat]).addTo(map);
    marker._isTower = true;
    markersRef.current.push(marker);
  }, [anchor, mapLoaded]);

  // Search ring center (SRC) marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !anchor) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isSrc) { m.remove(); return false; }
      return true;
    });
    const el = createSrcMarkerEl();
    const marker = new window.mapboxgl.Marker(el).setLngLat([anchor.lon, anchor.lat]).addTo(map);
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
      const marker = new window.mapboxgl.Marker(el).setLngLat([t.lon, t.lat]).addTo(map);
      marker._isAuto = true;
      marker.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        openPopup(map, t, null, true);
      });
      markersRef.current.push(marker);
    });
  }, [autoTargets, mapLoaded, openPopup]);

  // Saved site pins — green D/E/F circles, persist until the site is removed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    markersRef.current = markersRef.current.filter((m) => {
      if (m._isSaved) { m.remove(); return false; }
      return true;
    });
    saved.forEach((s, i) => {
      const el = createSavedPinEl(["D", "E", "F"][i]);
      const marker = new window.mapboxgl.Marker(el).setLngLat([s.longitude, s.latitude]).addTo(map);
      marker._isSaved = true;
      markersRef.current.push(marker);
    });
  }, [saved, mapLoaded]);

  // Probe marker + verdict popup
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
    const marker = new window.mapboxgl.Marker(el).setLngLat([probe.lon, probe.lat]).addTo(map);
    marker._isProbe = true;
    markersRef.current.push(marker);

    openPopup(map, probe, { onSave, saving, nextLetter, towerHeightFt: heightFt, savedCount: saved.length }, false);
  }, [probe, saving, nextLetter, onSave, heightFt, saved.length, mapLoaded, openPopup]);

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

  // A new Propagation Explorer run should be visible as soon as it enters TalonFit.
  useEffect(() => {
    if (propagationContext) setShowPropagation(true);
  }, [propagationContext]);

  // Draw the completed CloudRF/FCC result beneath TalonFit's own ring and tools.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return undefined;
    try {
      if (showPropagation && propagationContext) addPropagationLayers(map, propagationContext);
      else clearPropagationLayers(map);
    } catch (err) {
      console.warn("TalonFit propagation overlay draw failed:", err);
    }
    return () => {
      try {
        if (mapRef.current === map) clearPropagationLayers(map);
      } catch {
        // The map may already be destroyed during page teardown.
      }
    };
  }, [mapLoaded, propagationContext, showPropagation]);

  // Parcel click → solve → verdict popup, gated to points inside the 2-mile ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handleClick = (e) => {
      if (!anchor) return;
      const { lng, lat } = e.lngLat;
      const ring = makeRingFeature(anchor, radiusMiles);
      if (ring) {
        try {
          const pt = turf.point([lng, lat]);
          if (!turf.booleanPointInPolygon(pt, ring)) return;
        } catch {
          // fall through to probe
        }
      }
      onProbe({ lat, lon: lng });
    };
    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [onProbe, anchor, radiusMiles]);

  // Smart cursor
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMove = (e) => {
      if (!smartCursor || !anchor) return;
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
    const zoning = zoningDecision || solveResult?.ordinance_rules || null;
    if (!anchor || !zoning) return;
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
        sarf_packet: sarfPacket,
        zoning_decision: zoningDecision,
      });
      if (reqId !== smartCursorReqRef.current) return;
      setHover({ px: pt, solving: false, point: { lat, lon }, result: data });
    } catch (e) {
      if (reqId !== smartCursorReqRef.current) return;
      setHover({ px: pt, solving: false, point: { lat, lon }, result: null, error: e?.message || "Solver failed" });
    }
  }, [anchor, heightFt, saved.length, sarfPacket, zoningDecision, solveResult]);

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
    hoverMarkerRef.current = new window.mapboxgl.Marker(el).setLngLat([cp.longitude, cp.latitude]).addTo(map);

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
    const popup = new window.mapboxgl.Popup({ closeButton: false, offset: 20, maxWidth: "220px" })
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
    if (map && anchor) map.flyTo({ center: [anchor.lon, anchor.lat], zoom: 15, duration: 800 });
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
          title="Smart Cursor — hover any parcel for an instant verdict"
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
        {propagationContext && (
          <button
            onClick={() => setShowPropagation((shown) => !shown)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-lg transition-all ${
              showPropagation ? "border-violet-400 bg-violet-500 text-white" : "border-white/15 bg-slate-900/85 text-white/80 hover:text-white"
            }`}
            title="Toggle CloudRF coverage, FCC towers, and RF opportunity zones"
          >
            <Radio className="h-3.5 w-3.5" /> RF Overlay
          </button>
        )}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-slate-900/85 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 shadow-lg transition-all hover:text-white"
          title="Clear probes and re-center — saved sites are kept"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset Map
        </button>
      </div>

      {propagationContext && (
        <div className="absolute left-14 top-3 z-[1000] rounded-lg border border-violet-400/40 bg-slate-950/90 px-3 py-2 text-[11px] text-slate-200 shadow-xl backdrop-blur">
          <div className="flex items-center gap-1.5 font-bold text-violet-300">
            <Radio className="h-3.5 w-3.5" /> Propagation linked to TalonFit
          </div>
          <div className="mt-0.5 text-slate-400">
            {String(propagationContext.carrier || "Carrier").toUpperCase()} · {Number(propagationContext.radius_miles || 1).toFixed(1)} mi · {propagationContext.towers?.length || 0} FCC towers · {(propagationContext.opportunityZones?.features || propagationContext.opportunity_zones?.features || []).length} opportunity zones
          </div>
          <div className="mt-1 flex gap-3 text-[10px] text-slate-300">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />Coverage</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-400" />Opportunity</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />FCC tower</span>
          </div>
        </div>
      )}

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