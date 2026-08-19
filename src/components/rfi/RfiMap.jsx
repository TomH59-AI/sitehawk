import { useEffect, useRef, useState, useCallback } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { rfiTowersInBBox } from "@/functions/rfiTowersInBBox";
import { cloudRFCoveragePolygon } from "@/functions/cloudRFCoveragePolygon";
import { getSatelliteSnapshot } from "@/functions/getSatelliteSnapshot";
import { oeaaaAirspaceAnalysis } from "@/functions/oeaaaAirspaceAnalysis";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import RfiLegend from "./RfiLegend";
import RfiSearchBox from "./RfiSearchBox";
import RfiCompass from "./RfiCompass";
import RfiBaseLayerSwitcher from "./RfiBaseLayerSwitcher";
import RfiOverlays from "./RfiOverlays";
import { CARRIER_COLORS, DEADZONE_COLOR, CARRIER_PRESET_KEY, BASE_LAYERS, USGS_ATTRIBUTION } from "./rfiConfig";
import { magneticDeclination } from "@/lib/magneticDeclination";
import * as turf from "@turf/turf";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

// Nationwide RF Intelligence Engine map. Standalone — no pipeline coupling.
export default function RfiMap({
  overlays = { sites: true, rings: true },
  filters,
  layers,
  onRegisterDrawCoverage,
  onDrawingChange,
  satelliteMode = "true_color",
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [loadingTowers, setLoadingTowers] = useState(false);
  const [loadingCopernicus, setLoadingCopernicus] = useState(false);
  const [copernicusMeta, setCopernicusMeta] = useState(null);
  const [loadingOEAAA, setLoadingOEAAA] = useState(false);
  const [oeaaaMeta, setOEAAAMeta] = useState(null);
  const [towerCount, setTowerCount] = useState(0);
  const [declination, setDeclination] = useState(magneticDeclination(39.5, -98.5));
  const [baseLayer, setBaseLayer] = useState("usgs_imagery_topo");
  const searchMarker = useRef(null);
  const copernicusTimerRef = useRef(null);
  const copernicusRequestRef = useRef(0);
  const copernicusEnabledRef = useRef(!!layers.copernicus);
  const oeaaaTimerRef = useRef(null);
  const oeaaaRequestRef = useRef(0);
  const oeaaaEnabledRef = useRef(!!layers.oeaaa);
  const satelliteModeRef = useRef(satelliteMode);
  copernicusEnabledRef.current = !!layers.copernicus;
  oeaaaEnabledRef.current = !!layers.oeaaa;
  satelliteModeRef.current = satelliteMode;

  const allTowers = useRef([]);

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await loadPublicConfig();
        const token = cfg.mapboxAccessToken;
        if (!token) throw new Error("Mapbox token unavailable.");
        await ensureMapboxLoaded();
        if (cancelled || !containerRef.current) return;

        window.mapboxgl.accessToken = token;
        // EXACT same init recipe as the app's proven live maps (HawkFit) —
        // satellite-streets base, no extra Map options. The selected USGS
        // National Map raster is drawn ON TOP of it via the base switcher.
        const initialBase = BASE_LAYERS.find((b) => b.id === "usgs_imagery_topo");
        const map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [-98.5, 39.5], // continental US
          zoom: 3.4,
        });
        mapRef.current = map;
        map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-left");

        map.on("load", () => {
          // Optional USGS raster overlay over the Mapbox base, under every RF
          // layer. Hidden by default — the "Mapbox US" base map is the default.
          map.addSource("usgs-base", {
            type: "raster",
            tiles: [initialBase.tiles],
            tileSize: 256,
            attribution: USGS_ATTRIBUTION,
          });
          // Visible by default — the USGS National Map raster is served from
          // basemap.nationalmap.gov (independent of the Mapbox tile host), so a
          // real, bright basemap always shows even when the dark Mapbox style
          // reads as a blank black canvas.
          map.addLayer({
            id: "usgs-base", type: "raster", source: "usgs-base",
            layout: { visibility: "visible" },
          });

          // Sources
          map.addSource("rfi-towers", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-coverage", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-deadzones", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-oeaaa-surfaces", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-oeaaa-hazards", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-oeaaa-airports", { type: "geojson", data: EMPTY_FC });

          map.addLayer({
            id: "rfi-oeaaa-surfaces-fill",
            type: "fill",
            source: "rfi-oeaaa-surfaces",
            layout: { visibility: "none" },
            paint: { "fill-color": "#d946ef", "fill-opacity": 0.16 },
          });
          map.addLayer({
            id: "rfi-oeaaa-surfaces-outline",
            type: "line",
            source: "rfi-oeaaa-surfaces",
            layout: { visibility: "none" },
            paint: { "line-color": "#f0abfc", "line-width": 2 },
          });
          map.addLayer({
            id: "rfi-oeaaa-hazards-fill",
            type: "fill",
            source: "rfi-oeaaa-hazards",
            layout: { visibility: "none" },
            paint: { "fill-color": "#ef4444", "fill-opacity": 0.24 },
          });
          map.addLayer({
            id: "rfi-oeaaa-airports",
            type: "circle",
            source: "rfi-oeaaa-airports",
            layout: { visibility: "none" },
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 8],
              "circle-color": "#fbbf24",
              "circle-stroke-color": "#111827",
              "circle-stroke-width": 2,
            },
          });

          // Coverage fill — signal-strength ramp (spec).
          map.addLayer({
            id: "rfi-coverage",
            type: "fill",
            source: "rfi-coverage",
            paint: {
              "fill-color": [
                "interpolate", ["linear"], ["coalesce", ["get", "signal_strength_dbm"], -95],
                -120, "#000000", -110, "#FF0000", -100, "#FFAA00", -90, "#FFFF00", -80, "#00FF00",
              ],
              "fill-opacity": 0.4,
            },
          });

          // Dead zones — dark inverse polygon.
          map.addLayer({
            id: "rfi-deadzones",
            type: "fill",
            source: "rfi-deadzones",
            paint: { "fill-color": DEADZONE_COLOR, "fill-opacity": 0.5 },
          });

          // Towers — carrier fill + frequency-band stroke (spec).
          map.addLayer({
            id: "rfi-towers",
            type: "circle",
            source: "rfi-towers",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 2.5, 8, 5, 14, 8],
              "circle-color": [
                "match", ["get", "carrier"],
                "ATT", CARRIER_COLORS.ATT,
                "VZW", CARRIER_COLORS.VZW,
                "TMO", CARRIER_COLORS.TMO,
                "DISH", CARRIER_COLORS.DISH,
                CARRIER_COLORS.OTHER,
              ],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": [
                "case",
                ["<", ["get", "frequency_mhz"], 1000], "#0000FF",
                ["<", ["get", "frequency_mhz"], 3000], "#00FF00",
                ["<", ["get", "frequency_mhz"], 6000], "#FFA500",
                "#800080",
              ],
            },
          });

          // Tower popup
          map.on("click", "rfi-towers", (e) => {
            const p = e.features?.[0]?.properties || {};
            new window.mapboxgl.Popup({ offset: 10 })
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-family:sans-serif;font-size:12px;line-height:1.5">
                  <b>${p.carrier || "Carrier"}</b> · ${p.technology || ""}<br/>
                  ${p.frequency_mhz || "?"} MHz · ${p.band || ""}<br/>
                  <span style="opacity:.6">${p.source || ""}</span>
                </div>`
              )
              .addTo(map);
          });
          map.on("mouseenter", "rfi-towers", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "rfi-towers", () => { map.getCanvas().style.cursor = ""; });

          map.on("click", "rfi-oeaaa-airports", (e) => {
            const airport = e.features?.[0]?.properties || {};
            const distance = Number(airport.distanceMiles);
            new window.mapboxgl.Popup({ offset: 10 })
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-family:sans-serif;font-size:12px;line-height:1.5">
                  <b>${escapeHTML(airport.id || "Airport")}</b> · ${escapeHTML(airport.name || "")}<br/>
                  ${Number.isFinite(distance) ? `${distance.toFixed(2)} miles from map center` : ""}
                </div>`
              )
              .addTo(map);
          });
          map.on("mouseenter", "rfi-oeaaa-airports", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "rfi-oeaaa-airports", () => { map.getCanvas().style.cursor = ""; });

          setReady(true);
          loadTowersForView(map);
          // Embedded in the growing pipeline page, the container often has no
          // settled height when Mapbox initializes, so tiles never paint. Force
          // a resize on load (and once more after layout settles) so the map
          // fills its box and the USGS base tiles render.
          map.resize();
          window.setTimeout(() => { try { map.resize(); } catch { /* unmounted */ } }, 300);
        });

        const updateDeclination = () => {
          const c = map.getCenter();
          setDeclination(magneticDeclination(c.lat, c.lng));
        };
        map.on("moveend", () => {
          loadTowersForView(map);
          updateDeclination();
          if (copernicusEnabledRef.current) scheduleCopernicusLoad(map);
          if (oeaaaEnabledRef.current) scheduleOEAAALoad(map);
        });
        map.on("error", (ev) => console.error("[RFI map]", ev?.error?.message || ev));

        // Safety net — if the style never finishes loading (e.g. Mapbox tile
        // host blocked inside the editor iframe), surface a clear message
        // instead of an endless "Loading RF map…" spinner.
        window.setTimeout(() => {
          if (!cancelled && !map.isStyleLoaded()) {
            setError("The map couldn't load here (the map tile host may be blocked in the editor preview). It will work in the published app.");
          }
        }, 12000);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load RF map.");
      }
    })();
    return () => {
      cancelled = true;
      copernicusRequestRef.current += 1;
      oeaaaRequestRef.current += 1;
      if (copernicusTimerRef.current) window.clearTimeout(copernicusTimerRef.current);
      if (oeaaaTimerRef.current) window.clearTimeout(oeaaaTimerRef.current);
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, []);

  // ── Load towers for the current viewport ────────────────────────────────────
  const loadTowersForView = useCallback(async (map) => {
    if (map.getZoom() < 8) {
      allTowers.current = [];
      applyTowerFilter();
      setTowerCount(0);
      return;
    }
    const b = map.getBounds();
    setLoadingTowers(true);
    try {
      const { data } = await rfiTowersInBBox({
        west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), limit: 800,
      });
      allTowers.current = data?.towers || [];
      applyTowerFilter();
      setTowerCount(allTowers.current.length);
    } catch {
      /* leave prior towers */
    } finally {
      setLoadingTowers(false);
    }
  }, []);

  // ── Copernicus viewport imagery ─────────────────────────────────────────────
  const loadCopernicusForView = useCallback(async (map) => {
    if (!map || !copernicusEnabledRef.current) return;
    if (map.getZoom() < 7) {
      setCopernicusMeta({ notice: "Zoom to level 7 or closer to load Copernicus imagery." });
      return;
    }

    const bounds = map.getBounds();
    const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
    const requestId = ++copernicusRequestRef.current;
    setLoadingCopernicus(true);
    setCopernicusMeta(null);

    try {
      const { data } = await getSatelliteSnapshot({
        bbox,
        mode: satelliteModeRef.current,
        width: 768,
        height: 768,
        max_cloud_coverage: 35,
      });
      if (requestId !== copernicusRequestRef.current || !copernicusEnabledRef.current) return;
      if (!data?.success || !data?.image_data_url || !Array.isArray(data?.bounds)) {
        throw new Error(data?.error || "Copernicus returned no imagery.");
      }

      const [west, south, east, north] = data.bounds;
      const coordinates = [[west, north], [east, north], [east, south], [west, south]];
      const source = map.getSource("rfi-copernicus");
      if (source?.updateImage) {
        source.updateImage({ url: data.image_data_url, coordinates });
      } else {
        map.addSource("rfi-copernicus", {
          type: "image",
          url: data.image_data_url,
          coordinates,
        });
        map.addLayer({
          id: "rfi-copernicus",
          type: "raster",
          source: "rfi-copernicus",
          paint: { "raster-opacity": 0.78, "raster-fade-duration": 250 },
        }, "rfi-coverage");
      }
      map.setLayoutProperty("rfi-copernicus", "visibility", "visible");
      setCopernicusMeta({
        mode: data.mode,
        collection: data.collection,
        latestAcquisition: data.latest_acquisition,
        cloudCover: data.cloud_cover,
        sceneCount: data.scene_count,
      });
    } catch (e) {
      if (requestId !== copernicusRequestRef.current) return;
      setCopernicusMeta({ notice: e.message || "Copernicus imagery failed to load." });
      toast.error(e.message || "Copernicus imagery failed to load.");
    } finally {
      if (requestId === copernicusRequestRef.current) setLoadingCopernicus(false);
    }
  }, []);

  const scheduleCopernicusLoad = useCallback((map, immediate = false) => {
    if (copernicusTimerRef.current) window.clearTimeout(copernicusTimerRef.current);
    copernicusTimerRef.current = window.setTimeout(
      () => loadCopernicusForView(map),
      immediate ? 0 : 650
    );
  }, [loadCopernicusForView]);

  // ── FAA OE/AAA / Part 77 screening at the map center ───────────────────────
  const loadOEAAAForView = useCallback(async (map) => {
    if (!map || !oeaaaEnabledRef.current) return;
    const center = map.getCenter();
    const requestId = ++oeaaaRequestRef.current;
    setLoadingOEAAA(true);
    setOEAAAMeta(null);

    try {
      const { data } = await oeaaaAirspaceAnalysis({
        lat: center.lat,
        lng: center.lng,
        radiusMiles: 3,
      });
      if (requestId !== oeaaaRequestRef.current || !oeaaaEnabledRef.current) return;
      if (!data || data.error) throw new Error(data?.error || "FAA screening returned no data.");

      map.getSource("rfi-oeaaa-surfaces")?.setData(data.part77Surfaces || EMPTY_FC);
      map.getSource("rfi-oeaaa-hazards")?.setData(data.hazardZones || EMPTY_FC);
      map.getSource("rfi-oeaaa-airports")?.setData({
        type: "FeatureCollection",
        features: (data.nearestAirports || [])
          .filter((airport) => Number.isFinite(airport.lng) && Number.isFinite(airport.lat))
          .map((airport) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [airport.lng, airport.lat] },
            properties: {
              id: airport.id || "",
              name: airport.name || "Airport",
              type: airport.type || "",
              distanceMiles: airport.distanceMiles,
            },
          })),
      });
      setOEAAAMeta({
        summary: data.summary,
        nearestAirports: data.nearestAirports || [],
        surfaceCount: data.part77Surfaces?.features?.length || 0,
      });
    } catch (e) {
      if (requestId !== oeaaaRequestRef.current) return;
      setOEAAAMeta({ notice: e.message || "FAA screening failed to load." });
      toast.error(e.message || "FAA screening failed to load.");
    } finally {
      if (requestId === oeaaaRequestRef.current) setLoadingOEAAA(false);
    }
  }, []);

  const scheduleOEAAALoad = useCallback((map, immediate = false) => {
    if (oeaaaTimerRef.current) window.clearTimeout(oeaaaTimerRef.current);
    oeaaaTimerRef.current = window.setTimeout(
      () => loadOEAAAForView(map),
      immediate ? 0 : 500
    );
  }, [loadOEAAAForView]);

  // ── Apply carrier/band/tech filters to the tower source ─────────────────────
  const applyTowerFilter = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getSource("rfi-towers")) return;
    const feats = allTowers.current
      .filter((t) => filters.carriers.has(t.carrier) && filters.bands.has(t.band) && filters.techs.has(t.technology))
      .map((t) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [t.lon, t.lat] },
        properties: { carrier: t.carrier, technology: t.technology, frequency_mhz: t.frequency_mhz, band: t.band, source: t.source },
      }));
    map.getSource("rfi-towers").setData({ type: "FeatureCollection", features: feats });
  }, [filters]);

  useEffect(() => { applyTowerFilter(); }, [applyTowerFilter]);

  // ── Layer visibility toggles ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("rfi-towers", layers.towers);
    vis("rfi-coverage", layers.coverage);
    vis("rfi-deadzones", layers.deadzones);
  }, [layers.towers, layers.coverage, layers.deadzones, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!layers.copernicus) {
      copernicusRequestRef.current += 1;
      if (copernicusTimerRef.current) window.clearTimeout(copernicusTimerRef.current);
      if (map.getLayer("rfi-copernicus")) map.setLayoutProperty("rfi-copernicus", "visibility", "none");
      setLoadingCopernicus(false);
      setCopernicusMeta(null);
      return;
    }
    if (map.getLayer("rfi-copernicus")) map.setLayoutProperty("rfi-copernicus", "visibility", "visible");
    scheduleCopernicusLoad(map, true);
  }, [layers.copernicus, satelliteMode, ready, scheduleCopernicusLoad]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const layerIds = [
      "rfi-oeaaa-surfaces-fill",
      "rfi-oeaaa-surfaces-outline",
      "rfi-oeaaa-hazards-fill",
      "rfi-oeaaa-airports",
    ];
    if (!layers.oeaaa) {
      oeaaaRequestRef.current += 1;
      if (oeaaaTimerRef.current) window.clearTimeout(oeaaaTimerRef.current);
      layerIds.forEach((id) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      });
      map.getSource("rfi-oeaaa-surfaces")?.setData(EMPTY_FC);
      map.getSource("rfi-oeaaa-hazards")?.setData(EMPTY_FC);
      map.getSource("rfi-oeaaa-airports")?.setData(EMPTY_FC);
      setLoadingOEAAA(false);
      setOEAAAMeta(null);
      return;
    }
    layerIds.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    });
    scheduleOEAAALoad(map, true);
  }, [layers.oeaaa, ready, scheduleOEAAALoad]);

  // ── Base-map switch — Mapbox base or a USGS raster overlay on top of it ────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("usgs-base")) return;
    const cfg = BASE_LAYERS.find((b) => b.id === baseLayer);
    if (!cfg) return;
    if (cfg.type === "mapbox") {
      map.setLayoutProperty("usgs-base", "visibility", "none");
    } else {
      map.getSource("usgs-base").setTiles([cfg.tiles]);
      map.setLayoutProperty("usgs-base", "visibility", "visible");
    }
  }, [baseLayer, ready]);

  // ── On-demand CloudRF coverage + inverse dead zone at map center ────────────
  const handleDrawCoverage = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const activeCarrier = [...filters.carriers][0] || "VZW";
    onDrawingChange?.(true);
    try {
      const { data } = await cloudRFCoveragePolygon({
        lat: c.lat, lon: c.lng, height_ft: 199, radius_mi: 8,
        site_name: "RFI Engine", threshold_dbm: -100, carrier: CARRIER_PRESET_KEY[activeCarrier] || "verizon",
      });
      if (!data?.success || !data.polygon) {
        toast.error(data?.error || "No coverage returned for this location.");
        return;
      }
      const coverageFeature = { type: "Feature", geometry: data.polygon, properties: { signal_strength_dbm: -85 } };
      map.getSource("rfi-coverage").setData({ type: "FeatureCollection", features: [coverageFeature] });

      // Dead zone = analysis disk minus served footprint.
      const disk = turf.circle([c.lng, c.lat], 8 * 1.60934, { units: "kilometers", steps: 64 });
      let dead = null;
      try { dead = turf.difference(disk, coverageFeature); } catch { dead = null; }
      map.getSource("rfi-deadzones").setData(
        dead ? { type: "FeatureCollection", features: [{ ...dead, properties: { has_service: false } }] } : EMPTY_FC
      );
      toast.success("Coverage modeled — green served area, dark dead zones.");
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || "Coverage modeling failed.");
    } finally {
      onDrawingChange?.(false);
    }
  }, [filters, onDrawingChange]);

  // Expose the coverage action to the left control panel.
  useEffect(() => {
    onRegisterDrawCoverage?.(handleDrawCoverage);
  }, [handleDrawCoverage, onRegisterDrawCoverage]);

  // ── Jump to a searched address / coordinate + drop a marker ─────────────────
  const handleGoTo = useCallback((lngLat, label) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: lngLat, zoom: 12, essential: true });
    setDeclination(magneticDeclination(lngLat[1], lngLat[0]));
    if (searchMarker.current) searchMarker.current.remove();
    searchMarker.current = new window.mapboxgl.Marker({ color: "#8B5CF6" })
      .setLngLat(lngLat)
      .setPopup(new window.mapboxgl.Popup({ offset: 24 }).setHTML(
        `<div style="font-family:sans-serif;font-size:12px">${label || ""}</div>`
      ))
      .addTo(map);
  }, []);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white/70 text-sm p-6 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {(loadingTowers || loadingCopernicus || loadingOEAAA || !ready) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-slate-900/85 text-white text-xs px-3 py-1.5 shadow-lg">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {!ready
            ? "Loading RF map…"
            : loadingOEAAA
              ? "Screening FAA airspace…"
              : loadingCopernicus
                ? "Rendering Copernicus imagery…"
                : "Loading towers…"}
        </div>
      )}
      {ready && (
        <div className="absolute top-4 left-14 z-10 rounded-full bg-slate-900/85 text-white text-xs px-3 py-1.5 shadow-lg">
          {towerCount > 0 ? `${towerCount} towers in view` : "Zoom in to load towers"}
        </div>
      )}
      {ready && layers.copernicus && copernicusMeta && (
        <div
          className="absolute right-4 z-10 max-w-64 rounded-lg border border-cyan-300/20 bg-slate-900/85 px-3 py-2 text-[10px] text-white/70 shadow-lg backdrop-blur"
          style={{ top: layers.oeaaa ? "16rem" : "4rem" }}
        >
          {copernicusMeta.notice ? copernicusMeta.notice : (
            <>
              <div className="font-semibold uppercase tracking-wide text-cyan-200">Copernicus · {String(copernicusMeta.mode || "").replaceAll("_", " ")}</div>
              <div>
                {copernicusMeta.latestAcquisition
                  ? `Latest scene ${new Date(copernicusMeta.latestAcquisition).toLocaleDateString()}`
                  : "Viewport composite"}
                {copernicusMeta.cloudCover != null ? ` · ${Number(copernicusMeta.cloudCover).toFixed(0)}% cloud` : ""}
              </div>
            </>
          )}
        </div>
      )}
      {ready && layers.oeaaa && oeaaaMeta && (
        <div className="absolute top-16 right-4 z-10 w-[min(22rem,calc(100%-2rem))] rounded-xl border border-fuchsia-300/20 bg-slate-950/90 px-3.5 py-3 text-xs text-white/75 shadow-xl backdrop-blur">
          {oeaaaMeta.notice ? (
            <div>{oeaaaMeta.notice}</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold uppercase tracking-wide text-fuchsia-200">
                  FAA Part 77 Screening
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${oeaaaMeta.summary?.riskLevel === "HIGH" ? "bg-red-500/25 text-red-200" : "bg-emerald-500/20 text-emerald-200"}`}>
                  {oeaaaMeta.summary?.riskLevel || "UNKNOWN"}
                </span>
              </div>
              <p className="mt-1.5 leading-snug">{oeaaaMeta.summary?.notes}</p>
              <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/55">
                {oeaaaMeta.surfaceCount} screening zone{oeaaaMeta.surfaceCount === 1 ? "" : "s"} · {oeaaaMeta.nearestAirports.length} nearby airport{oeaaaMeta.nearestAirports.length === 1 ? "" : "s"} listed
                {oeaaaMeta.nearestAirports.slice(0, 3).map((airport) => (
                  <div key={airport.id || airport.name} className="mt-1 flex justify-between gap-3">
                    <span className="truncate">{airport.id || "—"} · {airport.name}</span>
                    <span className="shrink-0">{Number(airport.distanceMiles).toFixed(1)} mi</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px]">
                <span className="text-amber-200/80">Screening only—not an FAA determination.</span>
                <a
                  href={oeaaaMeta.summary?.officialPortalUrl || "https://oeaaa.faa.gov/"}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-semibold text-fuchsia-200 hover:text-fuchsia-100"
                >
                  Verify with FAA ↗
                </a>
              </div>
            </>
          )}
        </div>
      )}
      {ready && <RfiLegend />}
      {ready && <RfiBaseLayerSwitcher baseLayer={baseLayer} onChange={setBaseLayer} />}
      {ready && <RfiSearchBox onGoTo={handleGoTo} />}
      {ready && <RfiCompass declination={declination} />}
      {ready && <RfiOverlays map={mapRef.current} ready={ready} show={overlays} />}
    </div>
  );
}