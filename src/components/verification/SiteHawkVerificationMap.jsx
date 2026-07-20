import { useEffect, useRef, useState, useCallback } from "react";
import * as turf from "@turf/turf";
import { Loader2, ShieldCheck } from "lucide-react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { rfiTowersInBBox } from "@/functions/rfiTowersInBBox";
import VerificationSidebar from "./VerificationSidebar";
import { THEME, BASEMAPS, RASTER_OVERLAYS, VECTOR_OVERLAYS, scoreColor } from "./verificationConfig";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// SiteHawkVerificationMap — interactive dark-theme verification map.
// Split view: Mapbox map (65%) + layer control / candidate sidebar (35%).
export default function SiteHawkVerificationMap({
  targetLat, targetLon, targetLabel = "Target", searchRadiusMiles = 0.5,
  parcelGeometry = null, candidateSites = [],
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const layersRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [layers, setLayers] = useState({
    wetlands: false, hydro: false, nlcd: false,
    substations: false, transmission: false, towers: false,
  });
  const [opacity, setOpacity] = useState(80);
  const [basemap, setBasemap] = useState("satellite");
  layersRef.current = layers;

  // ── Fetch vector overlays (ArcGIS FeatureServer + towers) for the viewport ──
  const fetchVectors = useCallback(async () => {
    const map = mapRef.current;
    if (!map || map.getZoom() < 8) return;
    const b = map.getBounds();
    const envelope = JSON.stringify({
      xmin: b.getWest(), ymin: b.getSouth(), xmax: b.getEast(), ymax: b.getNorth(),
      spatialReference: { wkid: 4326 },
    });
    const arcgis = (url) => {
      const p = new URLSearchParams({
        f: "geojson", where: "1=1", outFields: "*",
        geometry: envelope, geometryType: "esriGeometryEnvelope",
        inSR: "4326", spatialRel: "esriSpatialRelIntersects", resultRecordCount: "500",
      });
      return fetch(`${url}?${p}`).then((r) => r.json());
    };

    const on = layersRef.current;
    if (on.substations && map.getSource("verif-substations")) {
      arcgis(VECTOR_OVERLAYS.substations.url)
        .then((fc) => map.getSource("verif-substations")?.setData(fc?.features ? fc : EMPTY_FC))
        .catch(() => {});
    }
    if (on.transmission && map.getSource("verif-transmission")) {
      arcgis(VECTOR_OVERLAYS.transmission.url)
        .then((fc) => map.getSource("verif-transmission")?.setData(fc?.features ? fc : EMPTY_FC))
        .catch(() => {});
    }
    if (on.towers && map.getSource("verif-towers")) {
      rfiTowersInBBox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), limit: 500 })
        .then(({ data }) => {
          const feats = (data?.towers || []).map((t) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [t.lon, t.lat] },
            properties: { carrier: t.carrier || "", source: t.source || "" },
          }));
          map.getSource("verif-towers")?.setData({ type: "FeatureCollection", features: feats });
        })
        .catch(() => {});
    }
  }, []);

  // ── Init map (once) ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await loadPublicConfig();
        const token = cfg.mapboxAccessToken;
        if (!token) throw new Error("Mapbox token unavailable.");
        await ensureMapboxLoaded();
        if (cancelled || !containerRef.current) return;

        window.mapboxgl.accessToken = token;
        const map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [targetLon, targetLat],
          zoom: 13,
          projection: "mercator",
          preserveDrawingBuffer: true,
        });
        mapRef.current = map;
        map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-left");

        map.on("load", () => {
          // USGS basemap raster drawn over the Mapbox base (hidden by default).
          map.addSource("verif-usgs-base", {
            type: "raster", tiles: [BASEMAPS[1].tiles], tileSize: 256,
          });
          map.addLayer({ id: "verif-usgs-base", type: "raster", source: "verif-usgs-base", layout: { visibility: "none" } });

          // Raster / WMS overlays — hidden until toggled.
          for (const o of RASTER_OVERLAYS) {
            map.addSource(`verif-${o.id}`, { type: "raster", tiles: [o.tiles], tileSize: o.tileSize });
            map.addLayer({
              id: `verif-${o.id}`, type: "raster", source: `verif-${o.id}`,
              layout: { visibility: "none" }, paint: { "raster-opacity": 0.8 },
            });
          }

          // Parcel boundary — white outline, subtle translucent fill.
          if (parcelGeometry) {
            map.addSource("verif-parcel", { type: "geojson", data: { type: "Feature", geometry: parcelGeometry, properties: {} } });
            map.addLayer({ id: "verif-parcel-fill", type: "fill", source: "verif-parcel", paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 } });
            map.addLayer({ id: "verif-parcel-line", type: "line", source: "verif-parcel", paint: { "line-color": "#ffffff", "line-width": 2 } });
          }

          // SARF search-radius ring — cyan dashed circle (Turf).
          const ring = turf.circle([targetLon, targetLat], searchRadiusMiles, { units: "miles", steps: 64 });
          map.addSource("verif-ring", { type: "geojson", data: ring });
          map.addLayer({
            id: "verif-ring", type: "line", source: "verif-ring",
            paint: { "line-color": THEME.accent, "line-width": 2, "line-dasharray": [2, 2] },
          });

          // Vector overlay sources/layers — hidden until toggled.
          map.addSource("verif-substations", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "verif-substations", type: "circle", source: "verif-substations",
            layout: { visibility: "none" },
            paint: { "circle-radius": 5, "circle-color": VECTOR_OVERLAYS.substations.color, "circle-stroke-width": 1, "circle-stroke-color": "#ffffff" },
          });
          map.addSource("verif-transmission", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "verif-transmission", type: "line", source: "verif-transmission",
            layout: { visibility: "none" },
            paint: { "line-color": VECTOR_OVERLAYS.transmission.color, "line-width": 2 },
          });
          map.addSource("verif-towers", { type: "geojson", data: EMPTY_FC });
          map.addLayer({
            id: "verif-towers", type: "circle", source: "verif-towers",
            layout: { visibility: "none" },
            paint: { "circle-radius": 4.5, "circle-color": THEME.accent, "circle-stroke-width": 1, "circle-stroke-color": "#0a0e17" },
          });

          // SARF center marker — red.
          new window.mapboxgl.Marker({ color: "#ef4444" })
            .setLngLat([targetLon, targetLat])
            .setPopup(new window.mapboxgl.Popup({ offset: 24 }).setHTML(
              `<div style="font-family:sans-serif;font-size:12px;color:#111"><b>${targetLabel}</b><br/>${searchRadiusMiles} mi search ring</div>`
            ))
            .addTo(map);

          // Candidate site pins — numbered, score color-coded, with popups.
          markersRef.current = candidateSites
            .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
            .map((c, i) => {
              const el = document.createElement("div");
              el.textContent = String(i + 1);
              el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${scoreColor(c.score)};color:#0a0e17;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:pointer;`;
              const popup = new window.mapboxgl.Popup({ offset: 18 }).setHTML(
                `<div style="font-family:sans-serif;font-size:12px;line-height:1.5;color:#111">
                  <b>${c.site_name || `Candidate ${i + 1}`}</b><br/>
                  Score: <b>${c.score != null ? Math.round(c.score) : "—"}</b><br/>
                  Owner: ${c.owner || "—"}<br/>
                  Zoning: ${c.zoning || "—"}<br/>
                  APN: <span style="font-family:monospace">${c.parcel_id || "—"}</span>
                </div>`
              );
              return new window.mapboxgl.Marker({ element: el })
                .setLngLat([c.lon, c.lat]).setPopup(popup).addTo(map);
            });

          setReady(true);
          map.resize();
          window.setTimeout(() => { try { map.resize(); } catch { /* unmounted */ } }, 300);
        });

        map.on("moveend", fetchVectors);
        map.on("error", (ev) => console.error("[VerificationMap]", ev?.error?.message || ev));
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load verification map.");
      }
    })();
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLat, targetLon]);

  // ── Layer visibility toggles ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("verif-wetlands", layers.wetlands);
    vis("verif-hydro", layers.hydro);
    vis("verif-nlcd", layers.nlcd);
    vis("verif-substations", layers.substations);
    vis("verif-transmission", layers.transmission);
    vis("verif-towers", layers.towers);
    if (layers.substations || layers.transmission || layers.towers) fetchVectors();
  }, [layers, ready, fetchVectors]);

  // ── Raster overlay opacity ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const o of RASTER_OVERLAYS) {
      if (map.getLayer(`verif-${o.id}`)) map.setPaintProperty(`verif-${o.id}`, "raster-opacity", opacity / 100);
    }
  }, [opacity, ready]);

  // ── Basemap switch ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("verif-usgs-base")) return;
    const cfg = BASEMAPS.find((b) => b.id === basemap);
    if (!cfg || !cfg.tiles) {
      map.setLayoutProperty("verif-usgs-base", "visibility", "none");
    } else {
      map.getSource("verif-usgs-base").setTiles([cfg.tiles]);
      map.setLayoutProperty("verif-usgs-base", "visibility", "visible");
    }
  }, [basemap, ready]);

  // ── Click-to-fly from a sidebar candidate card ──────────────────────────────
  const flyToCandidate = useCallback((i) => {
    const map = mapRef.current;
    const c = candidateSites[i];
    const m = markersRef.current[i];
    if (!map || !c) return;
    map.flyTo({ center: [c.lon, c.lat], zoom: 16, essential: true });
    if (m && !m.getPopup()?.isOpen()) m.togglePopup();
  }, [candidateSites]);

  if (!Number.isFinite(targetLat) || !Number.isFinite(targetLon)) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: THEME.bg, border: `1px solid ${THEME.border}` }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: `1px solid ${THEME.border}` }}>
        <ShieldCheck className="w-4 h-4" style={{ color: THEME.accent }} />
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em]" style={{ color: THEME.accent }}>SITEHAWK · VERIFICATION MAP</div>
          <h3 className="font-heading font-bold text-sm text-slate-100">{targetLabel} — Layer Verification</h3>
        </div>
      </div>
      <div className="flex flex-col md:flex-row">
        <div className="relative w-full md:w-[65%] h-[420px] md:h-[560px]">
          <div ref={containerRef} className="absolute inset-0" />
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading verification map…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm p-6 text-center">{error}</div>
          )}
        </div>
        <VerificationSidebar
          layers={layers} setLayers={setLayers}
          opacity={opacity} setOpacity={setOpacity}
          basemap={basemap} setBasemap={setBasemap}
          candidateSites={candidateSites} onFlyTo={flyToCandidate}
        />
      </div>
    </div>
  );
}