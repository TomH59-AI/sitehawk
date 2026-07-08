import { useEffect, useRef, useState } from "react";
import * as turf from "@turf/turf";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { setbackBandGeometry } from "@/lib/towerSitingRules";
import ParcelLinesToggle from "@/components/maps/ParcelLinesToggle";

const EMPTY = { type: "FeatureCollection", features: [] };
const fc = (items) => ({
  type: "FeatureCollection",
  features: (items || []).filter(Boolean).map((g) => (g.type === "Feature" ? g : { type: "Feature", properties: {}, geometry: g.geometry ?? g })),
});

// Live Exhibit B view — Mapbox satellite-streets-v12.
//   Parcel white 2.5px · buildable envelope EMERALD dash + 15% fill (GREEN = yes)
//   Setback band RED 14% fill w/ per-edge distance labels (RED = no build)
//   Fall zone cyan (flips red when it is the failing check) · compound amber
//   Tower = canvas-drawn monopole icon, color-coded live green/yellow/red by
//   liveSiting.tier as you drag · live dimension line tower → nearest property
//   line with real-time clearance in feet · verdict badge + legend overlays.
// Drag (mouse + touch) re-sites the tower — clamping + recompute happen in the
// parent. RULE-DRIVEN ONLY: every number rendered comes from the engine result.
const TIER_COLORS = { go: "#10b981", caution: "#f59e0b", no: "#ef4444" };
const TIER_TEXT = { go: "#6ee7b7", caution: "#fcd34d", no: "#fca5a5" };
const TIER_BG = { go: "rgba(6,78,59,0.92)", caution: "rgba(120,53,15,0.92)", no: "rgba(127,29,29,0.92)" };
const TIER_GLYPH = { go: "✔", caution: "⚠", no: "✖" };

// ── Canvas-drawn monopole tower icon (white halo + tier color) ──────────────
function towerIconImage(color) {
  const s = 96;
  const cv = document.createElement("canvas");
  cv.width = s; cv.height = s;
  const ctx = cv.getContext("2d");
  const draw = (col, lw) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(48, 88); ctx.lineTo(48, 18); // mast
    ctx.moveTo(30, 24); ctx.lineTo(66, 24); // antenna platform bar
    ctx.moveTo(33, 12); ctx.lineTo(33, 32); // left antenna panel
    ctx.moveTo(48, 8); ctx.lineTo(48, 30);  // center antenna panel
    ctx.moveTo(63, 12); ctx.lineTo(63, 32); // right antenna panel
    ctx.moveTo(36, 88); ctx.lineTo(60, 88); // base
    ctx.stroke();
  };
  draw("#ffffff", 13); // halo pass — readable on any satellite imagery
  draw(color, 6);
  return ctx.getImageData(0, 0, s, s);
}

// ── Setback distance labels — midpoints of the major parcel edges, pulled
//    inward so they sit inside the red no-build band ─────────────────────────
function setbackLabelFC(parcelFeat, envelopeFeat, setbackFt) {
  try {
    if (!parcelFeat || !envelopeFeat || !Number.isFinite(setbackFt) || setbackFt <= 0) return EMPTY;
    const g = parcelFeat.geometry ?? parcelFeat;
    const ring = g.type === "MultiPolygon" ? g.coordinates[0][0] : g.coordinates[0];
    if (!ring?.length) return EMPTY;
    const envLine = turf.polygonToLine(envelopeFeat);
    const envLines = envLine.type === "FeatureCollection" ? envLine.features : [envLine];
    const edges = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      const lenFt = turf.distance(turf.point(a), turf.point(b), { units: "feet" });
      edges.push({ mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], lenFt });
    }
    edges.sort((x, y) => y.lenFt - x.lenFt);
    const feats = [];
    for (const e of edges.slice(0, 6)) {
      if (e.lenFt < Math.max(setbackFt * 0.8, 40)) continue; // skip clutter on short edges
      let inner = e.mid, best = Infinity;
      for (const l of envLines) {
        const np = turf.nearestPointOnLine(l, turf.point(e.mid), { units: "feet" });
        if (np.properties.dist < best) { best = np.properties.dist; inner = np.geometry.coordinates; }
      }
      feats.push({
        type: "Feature",
        properties: { label: `${Math.round(setbackFt)}′ SETBACK` },
        geometry: { type: "Point", coordinates: [(e.mid[0] + inner[0]) / 2, (e.mid[1] + inner[1]) / 2] },
      });
    }
    return { type: "FeatureCollection", features: feats };
  } catch { return EMPTY; }
}

// ── Live dimension: tower → nearest point on the property line ──────────────
function clearanceDim(parcelFeat, towerLonLat) {
  try {
    const line = turf.polygonToLine(parcelFeat);
    const lines = line.type === "FeatureCollection" ? line.features : [line];
    let best = null, bestD = Infinity;
    for (const l of lines) {
      const np = turf.nearestPointOnLine(l, turf.point(towerLonLat), { units: "feet" });
      if (np.properties.dist < bestD) { bestD = np.properties.dist; best = np.geometry.coordinates; }
    }
    if (!best || !Number.isFinite(bestD)) return { line: EMPTY, label: EMPTY };
    return {
      line: fc([{ type: "LineString", coordinates: [towerLonLat, best] }]),
      label: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: { label: `${Math.round(bestD)}′ to line` },
          geometry: { type: "Point", coordinates: [(towerLonLat[0] + best[0]) / 2, (towerLonLat[1] + best[1]) / 2] },
        }],
      },
    };
  } catch { return { line: EMPTY, label: EMPTY }; }
}

export default function SiterMap({ parcelGeoJSON, result, liveSiting, buildingsFC, leaseLonLat, residCircle, towerData, draftPoints, onTowerDrag, onMapClick, clickMode, rowData }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  // Tap-to-place mode — subscriber taps anywhere and the tower moves there.
  const [moveMode, setMoveMode] = useState(false);
  const cbRef = useRef({ onTowerDrag, onMapClick, clickMode, moveMode });
  cbRef.current = { onTowerDrag, onMapClick, clickMode, moveMode };

  useEffect(() => {
    let cancelled = false;
    let loadTimeout = null;
    setMapError(null);
    const fail = (msg) => {
      if (cancelled) return;
      if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
      console.warn("[SITER MAP] FAIL:", msg);
      setMapError(msg);
    };
    (async () => {
      try {
        await ensureMapboxLoaded();
      } catch (e) {
        return fail(e?.message || "Failed to load Mapbox GL JS — check your network.");
      }
      let cfg;
      try {
        cfg = await loadPublicConfig();
      } catch (e) {
        return fail(`Could not load MapBox token — ${e?.message || "config request failed"}.`);
      }
      if (cancelled || !containerRef.current) return;
      const token = cfg?.mapboxAccessToken;
      if (!token) return fail("MapBox token missing — set MAPBOX_API_KEY in Base44 secrets.");
      if (String(token).startsWith("sk.")) return fail("Wrong token type — need a public pk. token, not a secret sk. token.");
      window.mapboxgl.accessToken = token;
      // Guard: if "load" never fires (bad token/network), surface an error instead of a blank panel.
      loadTimeout = setTimeout(() => fail("Map failed to load — check token and network."), 15000);
      let map;
      try {
        map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [-80.8895, 35.7805],
          zoom: 15,
          preserveDrawingBuffer: true,
        });
      } catch (e) {
        return fail(`Map init error — ${e?.message || "could not construct map"}.`);
      }
      mapRef.current = map;
      map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", (e) => {
        const status = e?.error?.status;
        if (status === 401 || status === 403) {
          fail("MapBox token rejected — regenerate a public token at account.mapbox.com.");
        }
      });
      map.on("load", () => {
        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        if (cancelled) return;
        // Tier-colored monopole icons — drawn once, swapped live via icon-image
        map.addImage("tower-go", towerIconImage(TIER_COLORS.go), { pixelRatio: 2 });
        map.addImage("tower-caution", towerIconImage(TIER_COLORS.caution), { pixelRatio: 2 });
        map.addImage("tower-no", towerIconImage(TIER_COLORS.no), { pixelRatio: 2 });

        const add = (id, type, paint, layout = {}) => {
          map.addSource(id, { type: "geojson", data: EMPTY });
          map.addLayer({ id, type, source: id, paint, layout });
        };

        // fills (bottom of stack)
        add("ts-band-fill", "fill", { "fill-color": "#ef4444", "fill-opacity": 0.14 });
        // Regrid building footprints — red when a residential structure edge
        // violates the separation rule, light otherwise
        add("ts-bld-fill", "fill", {
          "fill-color": ["match", ["get", "state"], "violate", "#ef4444", "#e2e8f0"],
          "fill-opacity": ["match", ["get", "state"], "violate", 0.45, 0.25],
        });
        add("ts-bld-line", "line", {
          "line-color": ["match", ["get", "state"], "violate", "#ef4444", "#cbd5e1"],
          "line-width": 1.5,
        });
        add("ts-env-fill", "fill", { "fill-color": "#10b981", "fill-opacity": 0.15 });
        add("ts-fall-fill", "fill", { "fill-color": ["match", ["get", "state"], "fail", "#ef4444", "#22d3ee"], "fill-opacity": 0.18 });
        add("ts-compound-fill", "fill", { "fill-color": "#f59e0b", "fill-opacity": 0.45 });
        // lines
        add("ts-parcel-line", "line", { "line-color": "#ffffff", "line-width": 2.5 });
        add("ts-env-line", "line", { "line-color": "#10b981", "line-width": 2, "line-dasharray": [2, 2] });
        add("ts-fall-line", "line", { "line-color": ["match", ["get", "state"], "fail", "#ef4444", "#22d3ee"], "line-width": 1.5 });
        add("ts-lease-line", "line", { "line-color": "#f59e0b", "line-width": 1.5, "line-dasharray": [3, 2] });
        add("ts-resid-line", "line", { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [2, 2] });
        add("ts-draft-line", "line", { "line-color": "#60a5fa", "line-width": 2, "line-dasharray": [1, 1] });
        add("ts-draft-pts", "circle", { "circle-radius": 4, "circle-color": "#60a5fa", "circle-stroke-color": "#fff", "circle-stroke-width": 1 });
        // Tower separation layers
        add("ts-sep-buf-fill", "fill", { "fill-color": "#ef4444", "fill-opacity": 0.08 });
        add("ts-sep-buf-line", "line", { "line-color": "#ef4444", "line-width": 1.5, "line-dasharray": [3, 2] });
        add("ts-sep-pts", "circle", { "circle-radius": 6, "circle-color": "#ef4444", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 });
        // Access road ROW indicator
        add("ts-row-fill", "fill", { "fill-color": "#f97316", "fill-opacity": 0.15 });
        add("ts-row-line", "line", { "line-color": "#f97316", "line-width": 2.5, "line-dasharray": [4, 2] });
        // Live clearance dimension line (tower → nearest property line)
        add("ts-dim-line", "line", { "line-color": "#10b981", "line-width": 1.5, "line-dasharray": [1, 1.5] });
        // Setback distance labels — sit inside the red no-build band
        add("ts-setback-labels", "symbol",
          { "text-color": "#fecaca", "text-halo-color": "#450a0a", "text-halo-width": 1.4 },
          { "text-field": ["get", "label"], "text-size": 11, "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"], "text-letter-spacing": 0.05, "text-allow-overlap": true });
        // Live clearance readout label
        add("ts-dim-label", "symbol",
          { "text-color": "#6ee7b7", "text-halo-color": "#0b1220", "text-halo-width": 1.5 },
          { "text-field": ["get", "label"], "text-size": 12, "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"], "text-offset": [0, -0.9], "text-allow-overlap": true });
        // Large invisible grab zone around the tower — makes dragging easy on
        // trackpads and touch (the skinny icon alone is a tiny hit target)
        add("ts-tower-hit", "circle", {
          "circle-radius": 34,
          "circle-color": "#ffffff",
          "circle-opacity": 0.01,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": 0.35,
        });
        // Tower icon — topmost; keeps layer id "ts-tower" so drag bindings hold
        add("ts-tower", "symbol", {}, {
          "icon-image": ["coalesce", ["get", "icon"], "tower-go"],
          "icon-size": 1,
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        });

        // tower drag — mouse
        let dragging = false;
        const endDrag = () => {
          if (!dragging) return;
          dragging = false;
          map.dragPan.enable();
          map.getCanvas().style.cursor = "";
        };
        const startDrag = (e) => {
          e.preventDefault();
          dragging = true;
          map.dragPan.disable();
          map.getCanvas().style.cursor = "grabbing";
        };
        map.on("mousedown", "ts-tower", startDrag);
        map.on("mousedown", "ts-tower-hit", startDrag);
        map.on("mousemove", (e) => {
          if (!dragging) return;
          cbRef.current.onTowerDrag?.([e.lngLat.lng, e.lngLat.lat]);
        });
        map.on("mouseup", endDrag);
        map.on("mouseenter", "ts-tower-hit", () => { map.getCanvas().style.cursor = "grab"; });
        map.on("mouseleave", "ts-tower-hit", () => { if (!dragging) map.getCanvas().style.cursor = ""; });

        // tower drag — touch (single finger)
        const startTouchDrag = (e) => {
          if (e.points && e.points.length !== 1) return;
          e.preventDefault();
          dragging = true;
          map.dragPan.disable();
        };
        map.on("touchstart", "ts-tower", startTouchDrag);
        map.on("touchstart", "ts-tower-hit", startTouchDrag);
        map.on("touchmove", (e) => {
          if (!dragging || !e.lngLat) return;
          e.preventDefault();
          cbRef.current.onTowerDrag?.([e.lngLat.lng, e.lngLat.lat]);
        });
        map.on("touchend", endDrag);
        map.on("touchcancel", endDrag);

        map.on("click", (e) => {
          // Tap-to-place: move the tower to wherever the user clicks/taps.
          // Parent clamps to the parcel, so off-parcel taps are simply ignored.
          if (cbRef.current.moveMode) { cbRef.current.onTowerDrag?.([e.lngLat.lng, e.lngLat.lat]); return; }
          if (cbRef.current.clickMode) cbRef.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
        });

        setReady(true);
      });
    })();
    return () => {
      cancelled = true;
      if (loadTimeout) clearTimeout(loadTimeout);
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const setData = (id, data) => mapRef.current?.getSource(id)?.setData(data || EMPTY);

  // Crosshair cursor while tap-to-place is active
  useEffect(() => {
    const c = mapRef.current?.getCanvas();
    if (c) c.style.cursor = moveMode ? "crosshair" : "";
  }, [moveMode]);

  // parcel + fit bounds
  useEffect(() => {
    if (!ready) return;
    setData("ts-parcel-line", parcelGeoJSON ? fc([parcelGeoJSON]) : EMPTY);
    if (parcelGeoJSON && mapRef.current) {
      const g = parcelGeoJSON.geometry ?? parcelGeoJSON;
      const coords = (g.type === "MultiPolygon" ? g.coordinates.flat(2) : g.coordinates.flat(1));
      const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
      mapRef.current.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 70, duration: 600 }
      );
    }
  }, [ready, parcelGeoJSON]);

  // engine result layers — recompute per drag tick; tier drives the live colors
  useEffect(() => {
    if (!ready) return;
    const m = mapRef.current;
    const tier = liveSiting?.tier || "go";

    setData("ts-env-fill", result?.envelope ? fc([result.envelope]) : EMPTY);
    setData("ts-env-line", result?.envelope ? fc([result.envelope]) : EMPTY);

    // Red no-build band = parcel minus buildable envelope (single source of truth)
    const band = result?.parcel && result?.envelope ? setbackBandGeometry(result.parcel, result.envelope) : null;
    setData("ts-band-fill", band ? fc([band]) : EMPTY);

    const fall = result?.checks?.fallZone?.circle;
    const fallState = result?.checks?.fallZone?.status === "fail" ? "fail" : "ok";
    const fallFC = fall
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { state: fallState }, geometry: fall.geometry ?? fall }] }
      : EMPTY;
    setData("ts-fall-fill", fallFC);
    setData("ts-fall-line", fallFC);

    setData("ts-compound-fill", result?.compound?.lonLat ? fc([result.compound.lonLat]) : EMPTY);
    setData("ts-lease-line", leaseLonLat ? fc([leaseLonLat]) : EMPTY);

    const towerFC = result?.towerLonLat
      ? { type: "FeatureCollection", features: [{ type: "Feature", properties: { icon: `tower-${tier}` }, geometry: { type: "Point", coordinates: result.towerLonLat } }] }
      : EMPTY;
    setData("ts-tower", towerFC);
    setData("ts-tower-hit", towerFC);

    setData("ts-setback-labels", setbackLabelFC(result?.parcel, result?.envelope, result?.setback));

    const dim = result?.parcel && result?.towerLonLat ? clearanceDim(result.parcel, result.towerLonLat) : { line: EMPTY, label: EMPTY };
    setData("ts-dim-line", dim.line);
    setData("ts-dim-label", dim.label);
    try {
      m?.setPaintProperty("ts-dim-line", "line-color", TIER_COLORS[tier]);
      m?.setPaintProperty("ts-dim-label", "text-color", TIER_TEXT[tier]);
    } catch { /* paint update is cosmetic — never fail the render */ }
  }, [ready, result, leaseLonLat, liveSiting]);

  // residential separation circle (active after Confirm on HawkVision+)
  useEffect(() => {
    if (!ready) return;
    setData("ts-resid-line", residCircle ? fc([residCircle]) : EMPTY);
  }, [ready, residCircle]);

  // Regrid building footprints — recolored per drag tick via feature `state`
  useEffect(() => {
    if (!ready) return;
    setData("ts-bld-fill", buildingsFC || EMPTY);
    setData("ts-bld-line", buildingsFC || EMPTY);
  }, [ready, buildingsFC]);

  // tower separation buffers + points
  useEffect(() => {
    if (!ready) return;
    setData("ts-sep-buf-fill", towerData?.buffers || EMPTY);
    setData("ts-sep-buf-line", towerData?.buffers || EMPTY);
    setData("ts-sep-pts", towerData?.towerPoints || EMPTY);
  }, [ready, towerData]);

  // Access road ROW indicator — orange dashed outline when access_road data is present
  useEffect(() => {
    if (!ready) return;
    setData("ts-row-fill", rowData?.geometry ? fc([rowData.geometry]) : EMPTY);
    setData("ts-row-line", rowData?.geometry ? fc([rowData.geometry]) : EMPTY);
  }, [ready, rowData]);

  // manual polygon draft
  useEffect(() => {
    if (!ready) return;
    const pts = draftPoints || [];
    setData("ts-draft-pts", fc(pts.map((p) => ({ type: "Point", coordinates: p }))));
    setData("ts-draft-line", pts.length >= 2
      ? fc([{ type: "LineString", coordinates: pts }])
      : EMPTY);
  }, [ready, draftPoints]);

  const tier = liveSiting?.tier || "go";

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-white/10">
      <div ref={containerRef} className="absolute inset-0" style={{ width: "100%", height: "100%", minHeight: "420px" }} />

      {/* Map failure state — no more silent blank panel */}
      {mapError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 p-6 text-center">
          <div className="text-sm font-bold text-red-300">Siting map failed to load</div>
          <p className="text-xs text-red-200/80 max-w-sm">{mapError}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500"
          >
            Retry
          </button>
        </div>
      )}

      {/* Live verdict badge — tier-colored, updates every drag tick */}
      {liveSiting && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-lg flex items-center gap-2 max-w-[92%]"
          style={{ background: TIER_BG[tier], border: `1px solid ${TIER_COLORS[tier]}`, color: TIER_TEXT[tier] }}
        >
          <span className="text-sm leading-none">{TIER_GLYPH[tier]}</span>
          <span>
            {liveSiting.tierLabel}
            {liveSiting.clearanceFt != null && liveSiting.requiredFt != null && (
              <span className="font-semibold opacity-90"> · {liveSiting.clearanceFt}′ clear / {liveSiting.requiredFt}′ req</span>
            )}
            {(liveSiting.reasons?.[0] || liveSiting.conditions?.[0]) && (
              <span className="block font-medium opacity-85 text-[11px]">{liveSiting.reasons?.[0] || liveSiting.conditions?.[0]}</span>
            )}
          </span>
        </div>
      )}

      {/* Legend */}
      {result && !result.collapsed && (
        <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-black/70 border border-white/15 px-2.5 py-2 space-y-1 text-[10px] font-semibold text-white/85 shadow-lg">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "rgba(16,185,129,0.6)" }} /> Buildable area</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "rgba(239,68,68,0.55)" }} /> Setback — no build</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "rgba(34,211,238,0.6)" }} /> Fall zone</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm shrink-0" style={{ background: "rgba(245,158,11,0.7)" }} /> Compound / lease</div>
          <div className="pt-0.5 text-white/50 font-medium">Drag the tower to test placement</div>
        </div>
      )}

      {/* Move Tower — big obvious toggle for subscribers who can't find the drag */}
      {result && !result.collapsed && onTowerDrag && (
        <button
          onClick={() => setMoveMode((m) => !m)}
          className={`absolute top-2 right-12 z-10 px-3 py-1.5 rounded-lg text-[12px] font-bold shadow-lg border transition-colors ${
            moveMode
              ? "bg-blue-600 border-blue-400 text-white"
              : "bg-black/70 border-white/20 text-white/90 hover:bg-black/85"
          }`}
        >
          {moveMode ? "✕ Done Moving" : "📍 Move Tower"}
        </button>
      )}
      {moveMode && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg bg-blue-600/95 text-white text-[11px] font-semibold shadow-lg text-center max-w-[92%]">
          Tap anywhere on the parcel to move the tower there — measurements and the pass/fail verdict update instantly. You can also drag the tower pin directly.
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10">
        <ParcelLinesToggle mapRef={mapRef} />
      </div>
      {clickMode && (
        <div className="absolute top-2 left-2 z-10 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shadow">
          {clickMode === "parcel" ? "Click a parcel to load it" : clickMode === "rectCenter" ? "Click to place the rectangle center" : clickMode === "platAnchor" ? "Click to anchor the reconstructed plat" : "Click to add polygon points"}
        </div>
      )}
    </div>
  );
}