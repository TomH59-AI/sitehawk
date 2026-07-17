import { useEffect, useRef, useState, useCallback } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { rfiTowersInBBox } from "@/functions/rfiTowersInBBox";
import { cloudRFCoveragePolygon } from "@/functions/cloudRFCoveragePolygon";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import RfiFilters from "./RfiFilters";
import RfiLegend from "./RfiLegend";
import RfiSearchBox from "./RfiSearchBox";
import RfiCompass from "./RfiCompass";
import RfiBaseLayerSwitcher from "./RfiBaseLayerSwitcher";
import { CARRIER_COLORS, DEADZONE_COLOR, CARRIER_PRESET_KEY, BASE_LAYERS, USGS_ATTRIBUTION } from "./rfiConfig";
import { magneticDeclination } from "@/lib/magneticDeclination";
import * as turf from "@turf/turf";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// Nationwide RF Intelligence Engine map. Standalone — no pipeline coupling.
export default function RfiMap() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [loadingTowers, setLoadingTowers] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [towerCount, setTowerCount] = useState(0);
  const [declination, setDeclination] = useState(magneticDeclination(39.5, -98.5));
  const [baseLayer, setBaseLayer] = useState("dark");
  const searchMarker = useRef(null);

  const [filters, setFilters] = useState({
    carriers: new Set(["ATT", "VZW", "TMO", "DISH", "OTHER"]),
    bands: new Set(["Low-Band", "Mid-Band", "C-Band", "mmWave"]),
    techs: new Set(["5G NR", "LTE", "UMTS", "GSM", "CDMA"]),
  });
  const [layers, setLayers] = useState({ towers: true, coverage: true, deadzones: true });

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
        const map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [-98.5, 39.5], // continental US
          zoom: 3.4,
          projection: "mercator",
        });
        mapRef.current = map;
        map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-left");

        map.on("load", () => {
          // USGS National Map raster base — added first so it sits UNDER every
          // RF layer. Hidden until a USGS base is chosen from the switcher.
          map.addSource("usgs-base", {
            type: "raster",
            tiles: [BASE_LAYERS.find((b) => b.id === "usgs_topo").tiles],
            tileSize: 256,
            attribution: USGS_ATTRIBUTION,
          });
          map.addLayer({
            id: "usgs-base",
            type: "raster",
            source: "usgs-base",
            layout: { visibility: "none" },
          });

          // Sources
          map.addSource("rfi-towers", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-coverage", { type: "geojson", data: EMPTY_FC });
          map.addSource("rfi-deadzones", { type: "geojson", data: EMPTY_FC });

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

          setReady(true);
          loadTowersForView(map);
        });

        const updateDeclination = () => {
          const c = map.getCenter();
          setDeclination(magneticDeclination(c.lat, c.lng));
        };
        map.on("moveend", () => { loadTowersForView(map); updateDeclination(); });
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
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [layers, ready]);

  // ── Base-map switch — swap USGS raster tiles or fall back to Mapbox dark ────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("usgs-base")) return;
    const cfg = BASE_LAYERS.find((b) => b.id === baseLayer);
    if (!cfg || cfg.type === "style") {
      map.setLayoutProperty("usgs-base", "visibility", "none");
      return;
    }
    map.getSource("usgs-base").setTiles([cfg.tiles]);
    map.setLayoutProperty("usgs-base", "visibility", "visible");
  }, [baseLayer, ready]);

  // ── On-demand CloudRF coverage + inverse dead zone at map center ────────────
  const handleDrawCoverage = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const activeCarrier = [...filters.carriers][0] || "VZW";
    setDrawing(true);
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
      setDrawing(false);
    }
  }, [filters]);

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
      <div ref={containerRef} className="absolute inset-0" />
      {(loadingTowers || !ready) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-slate-900/85 text-white text-xs px-3 py-1.5 shadow-lg">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {!ready ? "Loading RF map…" : "Loading towers…"}
        </div>
      )}
      {ready && (
        <div className="absolute top-4 left-14 z-10 rounded-full bg-slate-900/85 text-white text-xs px-3 py-1.5 shadow-lg">
          {towerCount > 0 ? `${towerCount} towers in view` : "Zoom in to load towers"}
        </div>
      )}
      {ready && (
        <RfiFilters
          filters={filters} setFilters={setFilters}
          layers={layers} setLayers={setLayers}
          onDrawCoverage={handleDrawCoverage} drawing={drawing}
        />
      )}
      {ready && <RfiLegend />}
      {ready && <RfiBaseLayerSwitcher baseLayer={baseLayer} onChange={setBaseLayer} />}
      {ready && <RfiSearchBox onGoTo={handleGoTo} />}
      {ready && <RfiCompass declination={declination} />}
    </div>
  );
}