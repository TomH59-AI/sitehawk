/*
 * SECTION 8 — HAWK RF PROPAGATION VISION (Target A)
 * Standalone. Does NOT gate any other section. One "Generate Propagation Map"
 * button → UnwiredLabs carrier scan + per-carrier CloudRF (serial) → render.
 * Fixed 1-mile analysis radius. Target A coords from Section 3.
 *
 * Mapping: ALL carrier coverages render as independent toggleable raster
 * layers on one Mapbox map — per-carrier show/hide, overlay opacity slider,
 * 3D terrain mode, and satellite/streets base. Legend uses the exact CloudRF
 * color key of the active carrier.
 */
import { useEffect, useRef, useState } from "react";
import { RefreshCw, AlertTriangle, Radio } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";
import HawkFlightSpinner from "./HawkFlightSpinner";
import PropagationLegend from "./section8/PropagationLegend";
import PropagationLayerToggles from "./section8/PropagationLayerToggles";
import SectionClearButton from "./SectionClearButton";
import { section8Propagation } from "@/functions/section8Propagation";

const BRAND_GREEN = "#628C83";
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js";
const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css";

let mapboxLoadingPromise = null;
async function ensureMapboxLoaded() {
  if (window.mapboxgl) return;
  if (!mapboxLoadingPromise) {
    mapboxLoadingPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = MAPBOX_CSS;
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = MAPBOX_JS;
      s.onload = () => resolve();
      s.onerror = () => { mapboxLoadingPromise = null; reject(new Error("Failed to load Mapbox GL")); };
      document.head.appendChild(s);
    });
  }
  await mapboxLoadingPromise;
}

const STYLES = {
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  streets: "mapbox://styles/mapbox/streets-v12",
};

// CloudRF bounds: [north, east, south, west] or {north,...}. Normalize.
function normBounds(b) {
  let north, south, east, west;
  if (Array.isArray(b)) { [north, east, south, west] = b; }
  else if (b) { ({ north, south, east, west } = b); }
  return [north, south, east, west].every(Number.isFinite) ? { north, south, east, west } : null;
}
const layerId = (name) => `rf-${String(name).replace(/[^a-z0-9]/gi, "_")}`;

export default function Section8Propagation({ unlocked, targetA, towerHeightFt = 150, onData, onClear }) {
  const lat = targetA?.latitude;
  const lon = targetA?.longitude;
  const coordsOk = Number.isFinite(lat) && Number.isFinite(lon);

  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // backend detect response
  const [activeCarrier, setActiveCarrier] = useState(null); // carrier for cockpit/stats/legend
  const [visible, setVisible] = useState({}); // carrier_name → bool (layer shown)
  const [opacity, setOpacity] = useState(0.6);
  const [terrain3D, setTerrain3D] = useState(false);
  const [txPower, setTxPower] = useState(43);
  const [heightFt, setHeightFt] = useState(towerHeightFt || 150);
  const [base, setBase] = useState("satellite");
  const [mapReady, setMapReady] = useState(0); // bumped after each map "load"

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const visibleRef = useRef(visible);
  const opacityRef = useRef(opacity);
  // Memo cache keyed by inputs so re-Generate with same inputs is instant.
  const cacheRef = useRef({});

  useEffect(() => { setHeightFt(towerHeightFt || 150); }, [towerHeightFt]);

  const activeCoverage = result?.coverages?.find((c) => c.carrier_name === activeCarrier) || null;

  // Initialize per-carrier visibility (all usable layers ON) for a fresh result.
  function initFromResult(data) {
    const vis = {};
    data.coverages.forEach((c) => { vis[c.carrier_name] = !!c.png_url; });
    setVisible(vis);
    setActiveCarrier(data.coverages.find((c) => c.png_url)?.carrier_name || null);
  }

  async function handleGenerate() {
    if (!coordsOk) return;
    const key = `${lat},${lon},${heightFt},${txPower}`;
    if (cacheRef.current[key]) {
      const cached = cacheRef.current[key];
      setResult(cached);
      initFromResult(cached);
      setStatus("done");
      return;
    }
    setStatus("running");
    setError(null);
    try {
      const res = await section8Propagation({
        mode: "detect", lat, lon,
        height_ft: heightFt, tx_power_dbm: txPower,
        site_name: targetA?.parcel_address || "Target A",
      });
      const data = res.data;
      if (!data?.success) throw new Error(data?.error || "Propagation run failed");
      cacheRef.current[key] = data;
      setResult(data);
      initFromResult(data);
      // Emit propagation summary to the bus (bonus context, not a weighted factor).
      onData?.({ propagation: { carrier_count: data.carrier_count ?? (data.coverages?.length || 0) } });
      setStatus("done");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Propagation run failed");
      setStatus("error");
    }
  }

  async function handleRecompute() {
    if (!activeCoverage) return;
    setStatus("running");
    setError(null);
    try {
      const res = await section8Propagation({
        mode: "recompute", lat, lon,
        height_ft: heightFt, tx_power_dbm: txPower,
        site_name: targetA?.parcel_address || "Target A",
        carrier_name: activeCoverage.carrier_name,
        band: activeCoverage.band,
        frequency_mhz: activeCoverage.frequency_mhz,
      });
      const data = res.data;
      if (!data?.success) throw new Error(data?.error || "Recompute failed");
      // Replace just this carrier's coverage in the result; bust the cache.
      cacheRef.current = {};
      setResult((prev) => ({
        ...prev,
        height_ft: heightFt, tx_power_dbm: txPower,
        generated_at: new Date().toISOString(),
        coverages: prev.coverages.map((c) =>
          c.carrier_name === activeCoverage.carrier_name ? data.coverage : c
        ),
      }));
      setStatus("done");
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Recompute failed");
      setStatus("error");
    }
  }

  // Build the Mapbox map with ONE raster layer per carrier coverage.
  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (status !== "done" || !result || !coordsOk) return;
      const cfg = await loadPublicConfig();
      const token = cfg?.mapboxAccessToken;
      if (!token || cancelled) return;
      await ensureMapboxLoaded();
      if (cancelled || !containerRef.current || !window.mapboxgl) return;

      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      window.mapboxgl.accessToken = token;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: STYLES[base],
        center: [lon, lat],
        zoom: 13.5,
        pitch: 0,
      });
      map.addControl(new window.mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-right");

      map.on("load", () => {
        if (cancelled) return;
        let union = null;
        for (const c of result.coverages) {
          if (!c.png_url) continue;
          const nb = normBounds(c.bounds);
          if (!nb) continue;
          const id = layerId(c.carrier_name);
          map.addSource(id, {
            type: "image",
            url: c.png_url,
            coordinates: [[nb.west, nb.north], [nb.east, nb.north], [nb.east, nb.south], [nb.west, nb.south]],
          });
          map.addLayer({
            id, type: "raster", source: id,
            paint: { "raster-opacity": opacityRef.current, "raster-fade-duration": 0 },
            layout: { visibility: visibleRef.current[c.carrier_name] ? "visible" : "none" },
          });
          union = union
            ? {
                north: Math.max(union.north, nb.north), south: Math.min(union.south, nb.south),
                east: Math.max(union.east, nb.east), west: Math.min(union.west, nb.west),
              }
            : nb;
        }
        if (union) map.fitBounds([[union.west, union.south], [union.east, union.north]], { padding: 50, duration: 0 });

        // Target A tower marker (brand green).
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${BRAND_GREEN};border:3px solid #fff;box-shadow:0 0 0 2px ${BRAND_GREEN},0 0 12px ${BRAND_GREEN}cc;`;
        new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(map);

        setMapReady((n) => n + 1);
      });

      mapRef.current = map;
    }
    draw().catch((e) => console.warn("Section8 map draw failed:", e?.message || e));
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, base, result?.generated_at]);

  // Layer visibility toggles → setLayoutProperty (no map rebuild).
  useEffect(() => {
    visibleRef.current = visible;
    const map = mapRef.current;
    if (!map || !result) return;
    result.coverages.forEach((c) => {
      const id = layerId(c.carrier_name);
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible[c.carrier_name] ? "visible" : "none");
    });
  }, [visible, mapReady, result]);

  // Overlay opacity → setPaintProperty (no map rebuild).
  useEffect(() => {
    opacityRef.current = opacity;
    const map = mapRef.current;
    if (!map || !result) return;
    result.coverages.forEach((c) => {
      const id = layerId(c.carrier_name);
      if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", opacity);
    });
  }, [opacity, mapReady, result]);

  // 3D terrain toggle → Mapbox DEM + pitch (no map rebuild).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (terrain3D) {
      if (!map.getSource("s8-dem")) {
        map.addSource("s8-dem", { type: "raster-dem", url: "mapbox://mapbox.mapbox-terrain-dem-v1", tileSize: 512, maxzoom: 14 });
      }
      map.setTerrain({ source: "s8-dem", exaggeration: 1.4 });
      map.easeTo({ pitch: 60, duration: 800 });
    } else {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, duration: 800 });
    }
  }, [terrain3D, mapReady]);

  const toggleCarrier = (name) => setVisible((v) => ({ ...v, [name]: !v[name] }));
  const selectCarrier = (name) => {
    setActiveCarrier(name);
    setVisible((v) => ({ ...v, [name]: true })); // selecting always shows the layer
  };

  // ── Locked state ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center">
        <Radio className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
        <div className="font-heading font-semibold text-foreground">HAWK RF PROPAGATION VISION — TARGET A</div>
        <p className="text-sm text-muted-foreground mt-1">Locked — resolve Target A first (Section 3).</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#628C83]/40 bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#628C83]/30 flex items-start justify-between gap-3" style={{ background: `${BRAND_GREEN}14` }}>
        <div>
          <div className="text-[10px] font-mono tracking-[0.3em]" style={{ color: BRAND_GREEN }}>SECTION 5 · CLOUDRF</div>
          <h2 className="font-heading font-bold text-lg text-foreground">HAWK RF PROPAGATION VISION — TARGET A</h2>
          <p className="text-xs text-muted-foreground mt-0.5">1-mile CloudRF coverage simulation · toggle carrier layers, opacity & 3D terrain</p>
        </div>
        {status !== "idle" && onClear && <SectionClearButton onClear={onClear} />}
      </div>

      <div className="p-5 space-y-4">
        {status === "idle" && (
          <button
            onClick={handleGenerate}
            disabled={!coordsOk}
            className="w-full md:w-auto px-5 py-2.5 rounded-lg font-semibold text-white shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: BRAND_GREEN }}
          >
            <Radio className="w-4 h-4" /> Generate Propagation Map
          </button>
        )}

        {status === "running" && <HawkFlightSpinner label="Running RF propagation…" />}

        {status === "error" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium text-destructive">{error}</div>
              {/cloudrf\.com\/plans|out of credits/i.test(error || "") && (
                <a href="https://cloudrf.com/plans" target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-1 text-xs font-semibold underline" style={{ color: BRAND_GREEN }}>
                  Renew CloudRF plan →
                </a>
              )}
              <div>
                <button onClick={handleGenerate} className="mt-2 px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: BRAND_GREEN }}>
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-4">
            {/* Map + floating controls */}
            <div className="relative rounded-xl overflow-hidden border border-border" style={{ minHeight: 520 }}>
              <div ref={containerRef} className="w-full" style={{ minHeight: 520 }} />

              {/* Layer toggle panel (top-left) */}
              <div className="absolute top-3 left-3 z-10">
                <PropagationLayerToggles
                  coverages={result.coverages}
                  visible={visible}
                  onToggle={toggleCarrier}
                  activeCarrier={activeCarrier}
                  onSelect={selectCarrier}
                  opacity={opacity}
                  onOpacity={setOpacity}
                  terrain3D={terrain3D}
                  onTerrain={setTerrain3D}
                  base={base}
                  onBase={setBase}
                />
              </div>

              {/* Legend (bottom-left) — exact CloudRF color key of active carrier */}
              <div className="absolute bottom-3 left-3 z-10"><PropagationLegend colorKey={activeCoverage?.key} /></div>

              {/* Tweak controls (bottom-right) */}
              <div className="absolute bottom-8 right-3 z-10 rounded-lg bg-[#0C1B2E]/90 backdrop-blur border border-[#628C83]/40 p-2.5 text-white space-y-2 w-44">
                <div className="text-[10px] font-mono tracking-[0.2em] text-[#628C83] mb-0.5">RF COCKPIT</div>
                {activeCoverage && (
                  <div className="rounded bg-[#0a1422] border border-[#334155] px-2 py-1.5 space-y-0.5 text-[10px] font-mono">
                    <div className="flex justify-between"><span className="text-white/50">CARRIER</span><span className="truncate">{activeCoverage.carrier_name}</span></div>
                    <div className="flex justify-between"><span className="text-white/50">FREQ</span><span>{activeCoverage.frequency_mhz} MHz</span></div>
                    <div className="flex justify-between"><span className="text-white/50">BAND</span><span>{activeCoverage.band}</span></div>
                    <div className="flex justify-between"><span className="text-white/50">AGL</span><span>{heightFt} ft</span></div>
                    <div className="flex justify-between"><span className="text-white/50">EIRP</span><span>{txPower} dBm</span></div>
                  </div>
                )}
                <label className="block text-[10px] font-mono tracking-wider text-[#628C83]">TX POWER (dBm)</label>
                <input type="number" value={txPower} onChange={(e) => setTxPower(Number(e.target.value))}
                  className="w-full bg-[#0a1422] border border-[#334155] rounded px-2 py-1 text-xs" />
                <label className="block text-[10px] font-mono tracking-wider text-[#628C83]">ANT HEIGHT (ft AGL)</label>
                <input type="number" value={heightFt} onChange={(e) => setHeightFt(Number(e.target.value))}
                  className="w-full bg-[#0a1422] border border-[#334155] rounded px-2 py-1 text-xs" />
                <button onClick={handleRecompute}
                  className="w-full mt-1 px-2 py-1.5 rounded text-[11px] font-semibold text-white flex items-center justify-center gap-1.5"
                  style={{ background: BRAND_GREEN }}>
                  <RefreshCw className="w-3 h-3" /> Recompute
                </button>
              </div>
            </div>

            {/* Stats panel */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Detected carriers" value={result.carrier_count} />
              <Stat label="Active carrier" value={activeCoverage ? `${activeCoverage.carrier_name} · ${activeCoverage.band}` : "—"} />
              <Stat label="Coverage area" value={activeCoverage?.area_covered_sq_km != null ? `${Number(activeCoverage.area_covered_sq_km).toFixed(2)} km²` : "—"} />
              <Stat label="Usable radius" value={activeCoverage?.max_range_km != null ? `${(activeCoverage.max_range_km / 1.60934).toFixed(2)} mi` : "—"} />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
              SOURCE · {result.detected_via === "fallback" ? "MAJOR-CARRIER FALLBACK" : "UNWIREDLABS"} · CLOUDRF /area · 1-MILE RADIUS · {new Date(result.generated_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[10px] font-mono tracking-wider text-muted-foreground">{label.toUpperCase()}</div>
      <div className="font-heading font-bold text-sm text-foreground mt-0.5 truncate">{value}</div>
    </div>
  );
}