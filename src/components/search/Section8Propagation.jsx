/*
 * SECTION 8 — HAWK RF PROPAGATION VISION (Target A)
 * Standalone. Does NOT gate any other section. One "Generate Propagation Map"
 * button → UnwiredLabs carrier scan + per-carrier CloudRF (serial) → render.
 * Fixed 1-mile analysis radius. Target A coords from Section 3. Tower height
 * from Section 1 (default 150 ft). Recompute re-runs CloudRF for the current
 * carrier only (no carrier rescan). Result memoized by inputs.
 */
import { useEffect, useRef, useState } from "react";
import { Satellite, RefreshCw, AlertTriangle, Radio } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";
import HawkFlightSpinner from "./HawkFlightSpinner";
import PropagationLegend from "./section8/PropagationLegend";
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

export default function Section8Propagation({ unlocked, targetA, towerHeightFt = 150, onData, onClear }) {
  const lat = targetA?.latitude;
  const lon = targetA?.longitude;
  const coordsOk = Number.isFinite(lat) && Number.isFinite(lon);

  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // backend detect response
  const [activeCarrier, setActiveCarrier] = useState(null); // carrier_name
  const [txPower, setTxPower] = useState(43);
  const [heightFt, setHeightFt] = useState(towerHeightFt || 150);
  const [base, setBase] = useState("satellite");

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // Memo cache keyed by inputs so re-Generate with same inputs is instant.
  const cacheRef = useRef({});

  useEffect(() => { setHeightFt(towerHeightFt || 150); }, [towerHeightFt]);

  const activeCoverage = result?.coverages?.find((c) => c.carrier_name === activeCarrier) || null;

  async function handleGenerate() {
    if (!coordsOk) return;
    const key = `${lat},${lon},${heightFt},${txPower}`;
    if (cacheRef.current[key]) {
      const cached = cacheRef.current[key];
      setResult(cached);
      setActiveCarrier(cached.coverages.find((c) => c.png_url)?.carrier_name || null);
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
      setActiveCarrier(data.coverages.find((c) => c.png_url)?.carrier_name || null);
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

  // Render / refresh the Mapbox map whenever the active coverage or base changes.
  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (status !== "done" || !activeCoverage?.png_url || !coordsOk) return;
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
      });
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");

      map.on("load", () => {
        if (cancelled) return;
        const b = activeCoverage.bounds;
        // CloudRF bounds: [north, east, south, west] or {north,...}. Normalize.
        let north, south, east, west;
        if (Array.isArray(b)) { [north, east, south, west] = b; }
        else if (b) { north = b.north; south = b.south; east = b.east; west = b.west; }
        if ([north, south, east, west].every(Number.isFinite)) {
          map.addSource("rf-overlay", {
            type: "image",
            url: activeCoverage.png_url,
            coordinates: [[west, north], [east, north], [east, south], [west, south]],
          });
          map.addLayer({ id: "rf-overlay-layer", type: "raster", source: "rf-overlay", paint: { "raster-opacity": 0.6 } });
          map.fitBounds([[west, south], [east, north]], { padding: 50, duration: 0 });
        }

        // Target A tower marker (brand green).
        const el = document.createElement("div");
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${BRAND_GREEN};border:3px solid #fff;box-shadow:0 0 0 2px ${BRAND_GREEN},0 0 12px ${BRAND_GREEN}cc;`;
        new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(map);
      });

      mapRef.current = map;
    }
    draw().catch((e) => console.warn("Section8 map draw failed:", e?.message || e));
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, activeCarrier, base, activeCoverage?.png_url]);

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
          <div className="text-[10px] font-mono tracking-[0.3em]" style={{ color: BRAND_GREEN }}>SECTION 7 · CLOUDRF</div>
          <h2 className="font-heading font-bold text-lg text-foreground">HAWK RF PROPAGATION VISION — TARGET A</h2>
          <p className="text-xs text-muted-foreground mt-0.5">1-mile CloudRF coverage simulation across area carriers</p>
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
              <button onClick={handleGenerate} className="mt-2 px-3 py-1.5 rounded-md text-xs font-semibold text-white" style={{ background: BRAND_GREEN }}>
                Retry
              </button>
            </div>
          </div>
        )}

        {status === "done" && result && (
          <div className="space-y-4">
            {/* Map + floating controls */}
            <div className="relative rounded-xl overflow-hidden border border-border" style={{ minHeight: 480 }}>
              <div ref={containerRef} className="w-full" style={{ minHeight: 480 }} />

              {/* Carrier chips + base toggle (top-left) */}
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[60%]">
                <div className="flex flex-wrap gap-1.5 p-1.5 rounded-lg bg-[#0C1B2E]/90 backdrop-blur border border-[#628C83]/40">
                  {result.coverages.map((c) => (
                    <button
                      key={c.carrier_name}
                      onClick={() => setActiveCarrier(c.carrier_name)}
                      disabled={!c.png_url}
                      className="px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-40"
                      style={c.carrier_name === activeCarrier
                        ? { background: BRAND_GREEN, color: "#fff" }
                        : { background: "transparent", color: "#cbd5e1", border: "1px solid #334155" }}
                      title={`${c.carrier_name} · ${c.band}`}
                    >
                      {c.carrier_name}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-lg overflow-hidden border border-[#628C83]/40 bg-[#0C1B2E]/90 backdrop-blur w-fit">
                  {["satellite", "streets"].map((b) => (
                    <button key={b} onClick={() => setBase(b)}
                      className="px-3 py-1 text-[11px] font-semibold capitalize"
                      style={base === b ? { background: BRAND_GREEN, color: "#fff" } : { color: "#cbd5e1" }}>
                      {b === "satellite" ? <span className="flex items-center gap-1"><Satellite className="w-3 h-3" /> Satellite</span> : "Streets"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Legend (bottom-left) */}
              <div className="absolute bottom-3 left-3 z-10"><PropagationLegend /></div>

              {/* Tweak controls (bottom-right) */}
              <div className="absolute bottom-3 right-3 z-10 rounded-lg bg-[#0C1B2E]/90 backdrop-blur border border-[#628C83]/40 p-2.5 text-white space-y-2 w-44">
                <div className="text-[10px] font-mono tracking-[0.2em] text-[#628C83] mb-0.5">RF COCKPIT</div>
                {activeCoverage && (
                  <div className="rounded bg-[#0a1422] border border-[#334155] px-2 py-1.5 space-y-0.5 text-[10px] font-mono">
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