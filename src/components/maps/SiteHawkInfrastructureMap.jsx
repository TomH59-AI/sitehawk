import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FiberNearestSummary from "@/components/maps/FiberNearestSummary";

const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css";
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.js";
const DEFAULT_CENTER = [-81.5158, 27.6648];
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };

const LAYERS = [
  { id: "transmission_lines", group: "Power infrastructure", label: "Transmission lines", description: "Colored by voltage class with ownership and status", color: "#fbbf24", geometry: "line", source: "HIFLD", sourceDate: "2022" },
  { id: "substations", group: "Power infrastructure", label: "Substations", description: "Clustered transmission substations and facility details", color: "#f97316", geometry: "point", source: "HIFLD public archive", sourceDate: "2021 public archive · reclassified 2023" },
  { id: "service_territories", group: "Power infrastructure", label: "Electric service territories", description: "Shaded utility ownership boundaries", color: "#38bdf8", geometry: "fill", source: "HIFLD", sourceDate: "2022" },
  { id: "fiber_routes", group: "Fiber & backhaul", label: "Long-haul & metro fiber routes", description: "Licensed generalized route geometry when available", color: "#22d3ee", geometry: "line", source: "CarrierFinder" },
  { id: "fiber_pops", group: "Fiber & backhaul", label: "Fiber POPs & carrier hotels", description: "Licensed data-center and network access facilities", color: "#67e8f9", geometry: "point", source: "CarrierFinder", clustered: true },
  { id: "fiber_ixps", group: "Fiber & backhaul", label: "IXPs & interconnection facilities", description: "Licensed major interconnection locations", color: "#818cf8", geometry: "point", source: "CarrierFinder", clustered: true },
  { id: "fiber_buildings", group: "Fiber & backhaul", label: "Lit buildings & on-net locations", description: "Displayed only where the license permits", color: "#34d399", geometry: "point", source: "CarrierFinder", clustered: true },
  { id: "power_plants", group: "Power infrastructure", label: "Generation facilities", description: "Power plants, fuel and capacity", color: "#fb7185", geometry: "point", source: "Data.gov / EIA" },
  { id: "macro_towers", group: "Wireless", label: "Macro towers & structures", description: "Registered and commercially sourced structures", color: "#a78bfa", geometry: "point", source: "CarrierFinder / FCC" },
  { id: "carrier_sites", group: "Wireless", label: "Carrier presence", description: "Known carrier assignments and technologies", color: "#c084fc", geometry: "point", source: "CarrierFinder" },
  { id: "cloudrf_coverage", group: "RF intelligence", label: "CloudRF predicted coverage", description: "On-demand RF propagation result", color: "#34d399", geometry: "fill", source: "CloudRF", expensive: true },
  { id: "broadband_service", group: "Market intelligence", label: "Broadband service & gaps", description: "Availability, technology and underserved areas", color: "#60a5fa", geometry: "fill", source: "Data.gov / FCC" },
  { id: "cell_observations", group: "Field intelligence", label: "Cell/Wi-Fi observations", description: "User-authorized device observations and fixes", color: "#f472b6", geometry: "point", source: "Unwired Labs", expensive: true },
];

function loadMapbox() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  const existing = document.querySelector(`script[src="${MAPBOX_JS}"]`);
  if (!document.querySelector(`link[href="${MAPBOX_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MAPBOX_CSS;
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");
    if (!existing) {
      script.src = MAPBOX_JS;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(window.mapboxgl), { once: true });
    script.addEventListener("error", () => reject(new Error("Mapbox GL failed to load.")), { once: true });
  });
}

function normalizeGeoJson(value) {
  const data = value?.geojson || value?.data || value;
  if (data?.type === "FeatureCollection" && Array.isArray(data.features)) return data;
  if (data?.type === "Feature") return { type: "FeatureCollection", features: [data] };
  return EMPTY_COLLECTION;
}

function featureName(properties = {}) {
  return properties.name || properties.site_name || properties.owner || properties.operator ||
    properties.facility || properties.id || "Infrastructure feature";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMapLayer(map, definition, data) {
  const sourceId = `sitehawk-${definition.id}`;
  const existing = map.getSource(sourceId);
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(sourceId, {
    type: "geojson",
    data,
    generateId: true,
    ...((definition.id === "substations" || definition.clustered) ? { cluster: true, clusterMaxZoom: 8, clusterRadius: 45 } : {}),
  });

  if (definition.geometry === "line") {
    const lineColor = definition.id === "transmission_lines"
      ? ["step", ["to-number", ["get", "voltage_kv"]], "#fde047", 115, "#facc15", 230, "#fb923c", 345, "#f97316", 500, "#ef4444"]
      : definition.id === "fiber_routes" ? ["get", "provider_color"] : definition.color;
    map.addLayer({ id: sourceId, type: "line", source: sourceId, paint: { "line-color": lineColor, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 13, 4], "line-opacity": 0.9 } });
  } else if (definition.geometry === "fill") {
    map.addLayer({ id: `${sourceId}-fill`, type: "fill", source: sourceId, paint: { "fill-color": definition.color, "fill-opacity": 0.3 } });
    map.addLayer({ id: sourceId, type: "line", source: sourceId, paint: { "line-color": definition.color, "line-width": 1.2, "line-opacity": 0.8 } });
  } else if (definition.id === "substations" || definition.clustered) {
    map.addLayer({ id: `${sourceId}-clusters`, type: "circle", source: sourceId, filter: ["has", "point_count"], paint: { "circle-color": definition.color, "circle-radius": ["step", ["get", "point_count"], 14, 20, 19, 75, 25], "circle-opacity": 0.85 } });
    map.addLayer({ id: `${sourceId}-cluster-count`, type: "symbol", source: sourceId, filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 }, paint: { "text-color": "#ffffff" } });
    map.addLayer({ id: sourceId, type: "circle", source: sourceId, filter: ["!", ["has", "point_count"]], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 13, 8], "circle-color": definition.color, "circle-stroke-color": "#020617", "circle-stroke-width": 1.5, "circle-opacity": 0.92 } });
  } else {
    map.addLayer({ id: sourceId, type: "circle", source: sourceId, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 13, 8], "circle-color": definition.color, "circle-stroke-color": "#020617", "circle-stroke-width": 1.5, "circle-opacity": 0.92 } });
  }
}

function setLayerVisibility(map, definition, visible) {
  [`sitehawk-${definition.id}`, `sitehawk-${definition.id}-fill`, `sitehawk-${definition.id}-clusters`, `sitehawk-${definition.id}-cluster-count`].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
}

function setLayerOpacity(map, definition, opacity) {
  const id = `sitehawk-${definition.id}`;
  const fillId = `${id}-fill`;
  if (map.getLayer(fillId)) map.setPaintProperty(fillId, "fill-opacity", opacity * 0.42);
  if (!map.getLayer(id)) return;
  const property = definition.geometry === "point" ? "circle-opacity" : "line-opacity";
  map.setPaintProperty(id, property, opacity);
}

export async function fetchInfrastructureLayer({ endpoint, token, layer, bbox, zoom, signal, candidate, layerLoader }) {
  if (layerLoader) {
    const response = await layerLoader({ action: "query_layer", layer, bbox, zoom, candidate });
    const body = response?.data || response;
    if (body?.error) throw new Error(body.error);
    return { geojson: normalizeGeoJson(body), metadata: body?.metadata || {}, summary: body?.summary || {} };
  }
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action: "query_layer", layer, bbox, zoom, candidate }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || `${layer} failed with HTTP ${response.status}.`);
  return { geojson: normalizeGeoJson(body), metadata: body?.metadata || {}, summary: body?.summary || {} };
}

export default function SiteHawkInfrastructureMap({
  mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
  apiEndpoint = "/api/infrastructure-map",
  accessToken,
  initialCenter = DEFAULT_CENTER,
  initialZoom = 6,
  candidate,
  layerLoader,
  onOpen3D,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const requestsRef = useRef(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(() => new Set());
  const [loading, setLoading] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const [counts, setCounts] = useState({});
  const [opacity, setOpacity] = useState({});
  const [metadata, setMetadata] = useState({});
  const [insights, setInsights] = useState({});
  const [selected, setSelected] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState("dark-v11");

  const groupedLayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return LAYERS.filter((layer) => !query || `${layer.label} ${layer.description} ${layer.source}`.toLowerCase().includes(query))
      .reduce((groups, layer) => {
        (groups[layer.group] ||= []).push(layer);
        return groups;
      }, {});
  }, [search]);

  useEffect(() => {
    let disposed = false;
    if (!mapboxToken) {
      setFatalError("Mapbox access is not configured.");
      return undefined;
    }
    loadMapbox()
      .then((mapboxgl) => {
        if (disposed || !containerRef.current) return;
        mapboxgl.accessToken = mapboxToken;
        const map = new mapboxgl.Map({ container: containerRef.current, style: `mapbox://styles/mapbox/${mapStyle}`, center: initialCenter, zoom: initialZoom, pitch: 0, attributionControl: true });
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-right");
        map.on("load", () => { mapRef.current = map; setMapReady(true); });
        map.on("click", (event) => {
          const ids = LAYERS.flatMap((layer) => [`sitehawk-${layer.id}`, `sitehawk-${layer.id}-fill`]).filter((id) => map.getLayer(id));
          const feature = ids.length ? map.queryRenderedFeatures(event.point, { layers: ids })[0] : null;
          if (feature) setSelected({ ...feature.properties, _layer_id: feature.layer.id, _coordinates: event.lngLat.toArray() });
        });
        map.on("mouseenter", () => { map.getCanvas().style.cursor = "crosshair"; });
      })
      .catch((error) => setFatalError(error.message || String(error)));
    return () => {
      disposed = true;
      requestsRef.current.forEach((controller) => controller.abort());
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const cached = {};
    LAYERS.forEach((layer) => {
      const source = map.getSource(`sitehawk-${layer.id}`);
      if (source?._data) cached[layer.id] = source._data;
    });
    map.setStyle(`mapbox://styles/mapbox/${mapStyle}`);
    map.once("style.load", () => {
      LAYERS.forEach((layer) => {
        if (!cached[layer.id]) return;
        addMapLayer(map, layer, cached[layer.id]);
        setLayerVisibility(map, layer, active.has(layer.id));
        setLayerOpacity(map, layer, opacity[layer.id] ?? 0.9);
      });
    });
  }, [mapReady, mapStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLayer = useCallback(async (definition) => {
    const map = mapRef.current;
    if (!map) return;
    requestsRef.current.get(definition.id)?.abort();
    const controller = new AbortController();
    requestsRef.current.set(definition.id, controller);
    setLoading((value) => new Set(value).add(definition.id));
    setErrors((value) => ({ ...value, [definition.id]: "" }));
    try {
      const bounds = map.getBounds();
      const result = await fetchInfrastructureLayer({ endpoint: apiEndpoint, token: accessToken, layer: definition.id, bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom: Math.round(map.getZoom()), signal: controller.signal, candidate, layerLoader });
      addMapLayer(map, definition, result.geojson);
      setLayerVisibility(map, definition, true);
      setLayerOpacity(map, definition, opacity[definition.id] ?? 0.9);
      setCounts((value) => ({ ...value, [definition.id]: result.geojson.features.length }));
      setMetadata((value) => ({ ...value, [definition.id]: result.metadata }));
      setInsights((value) => ({ ...value, ...result.summary }));
    } catch (error) {
      if (error.name !== "AbortError") {
        setErrors((value) => ({ ...value, [definition.id]: error.message || String(error) }));
        setActive((value) => { const next = new Set(value); next.delete(definition.id); return next; });
      }
    } finally {
      requestsRef.current.delete(definition.id);
      setLoading((value) => { const next = new Set(value); next.delete(definition.id); return next; });
    }
  }, [accessToken, apiEndpoint, candidate, layerLoader, opacity]);

  const toggleLayer = useCallback((definition) => {
    if (!mapReady) return;
    const enabled = !active.has(definition.id);
    setActive((value) => { const next = new Set(value); enabled ? next.add(definition.id) : next.delete(definition.id); return next; });
    const sourceExists = mapRef.current?.getSource(`sitehawk-${definition.id}`);
    if (sourceExists) setLayerVisibility(mapRef.current, definition, enabled);
    else if (enabled) loadLayer(definition);
  }, [active, loadLayer, mapReady]);

  const togglePowerGrid = useCallback(() => {
    if (!mapReady) return;
    const definitions = LAYERS.filter((layer) => layer.id === "transmission_lines" || layer.id === "substations");
    const enabled = !definitions.every((layer) => active.has(layer.id));
    setActive((value) => {
      const next = new Set(value);
      definitions.forEach((layer) => enabled ? next.add(layer.id) : next.delete(layer.id));
      return next;
    });
    definitions.forEach((layer) => {
      if (mapRef.current?.getSource(`sitehawk-${layer.id}`)) setLayerVisibility(mapRef.current, layer, enabled);
      else if (enabled) loadLayer(layer);
    });
  }, [active, loadLayer, mapReady]);

  const changeOpacity = (definition, value) => {
    const next = Number(value);
    setOpacity((current) => ({ ...current, [definition.id]: next }));
    if (mapRef.current) setLayerOpacity(mapRef.current, definition, next);
  };

  const refreshActive = () => LAYERS.filter((layer) => active.has(layer.id)).forEach(loadLayer);

  return (
    <div className="relative h-[calc(100vh-64px)] min-h-[680px] overflow-hidden bg-slate-950 text-slate-100">
      <div ref={containerRef} className="absolute inset-0" />
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-slate-950/95 to-transparent p-4 pb-12">
        <div className="pointer-events-auto flex items-center gap-3">
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="rounded-xl border border-cyan-500/30 bg-slate-950/90 px-3 py-2 text-cyan-300 shadow-xl backdrop-blur">{sidebarOpen ? "Hide layers" : "Show layers"}</button>
          <div><div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400">SiteHawk</div><h1 className="text-xl font-black tracking-tight text-white">Infrastructure Intelligence Map</h1></div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <select value={mapStyle} onChange={(event) => setMapStyle(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-200 backdrop-blur">
            <option value="dark-v11">Dark intelligence</option><option value="satellite-streets-v12">Satellite</option><option value="outdoors-v12">Terrain</option><option value="light-v11">Light</option>
          </select>
          <button type="button" onClick={() => onOpen3D?.({ center: mapRef.current?.getCenter(), zoom: mapRef.current?.getZoom() })} className="rounded-xl border border-violet-400/40 bg-violet-500/20 px-3 py-2 text-xs font-bold text-violet-200 backdrop-blur hover:bg-violet-500/30">Open Cesium 3D</button>
        </div>
      </header>

      {sidebarOpen && (
        <aside className="absolute bottom-4 left-4 top-24 z-20 flex w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/94 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-widest text-slate-400">Layer control</div><div className="mt-1 text-xs text-slate-500">{active.size} active · {Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()} features</div></div><button type="button" disabled={!active.size} onClick={refreshActive} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-cyan-300 disabled:opacity-30">Refresh view</button></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search infrastructure layers…" className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-500" />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <button type="button" onClick={togglePowerGrid} className={`mb-3 w-full rounded-xl border p-3 text-left transition ${active.has("transmission_lines") && active.has("substations") ? "border-amber-400/60 bg-amber-950/30" : "border-slate-700 bg-slate-900/70"}`}>
              <span className="flex items-center justify-between"><span className="text-sm font-black text-amber-300">Power Grid X-Ray</span><span className="text-[10px] uppercase tracking-widest text-slate-500">Lines + substations</span></span>
              <span className="mt-1 block text-[11px] text-slate-400">Synchronizes voltage-class transmission corridors with clustered substation nodes.</span>
            </button>
            <FiberNearestSummary insights={insights} />
            {Object.entries(groupedLayers).map(([group, layers]) => (
              <section key={group} className="mb-5"><h2 className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{group}</h2><div className="space-y-2">
                {layers.map((layer) => {
                  const enabled = active.has(layer.id); const busy = loading.has(layer.id);
                  return <div key={layer.id} className={`rounded-xl border p-3 transition ${enabled ? "border-cyan-500/40 bg-cyan-950/25" : "border-slate-800 bg-slate-900/45"}`}>
                    <button type="button" onClick={() => toggleLayer(layer)} className="flex w-full items-start gap-3 text-left"><span className="mt-0.5 h-4 w-4 shrink-0 rounded border" style={{ borderColor: layer.color, background: enabled ? layer.color : "transparent", boxShadow: enabled ? `0 0 14px ${layer.color}` : "none" }} /><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-slate-100">{layer.label}</span><span className="shrink-0 text-[10px] text-slate-500">{busy ? "Loading…" : counts[layer.id] != null ? counts[layer.id].toLocaleString() : layer.source}</span></span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{layer.description}{layer.expensive ? " · on demand" : ""}</span><span className="mt-1 block text-[10px] text-slate-600">Source: {metadata[layer.id]?.source || layer.source}{(metadata[layer.id]?.source_date || layer.sourceDate) ? ` · Vintage: ${metadata[layer.id]?.source_date || layer.sourceDate}` : ""}</span>{metadata[layer.id]?.limitations && <span className="mt-1 block text-[10px] leading-4 text-amber-300/70">Limitation: {metadata[layer.id].limitations}</span>}</span></button>
                    {enabled && !busy && !errors[layer.id] && <input aria-label={`${layer.label} opacity`} type="range" min="0.15" max="1" step="0.05" value={opacity[layer.id] ?? 0.9} onChange={(event) => changeOpacity(layer, event.target.value)} className="mt-2 h-1 w-full accent-cyan-400" />}
                    {errors[layer.id] && <div className="mt-2 rounded-lg bg-red-950/60 px-2 py-1.5 text-[11px] text-red-300">{errors[layer.id]}</div>}
                  </div>;
                })}
              </div></section>
            ))}
          </div>
        </aside>
      )}

      {selected && (
        <section className="absolute bottom-8 right-4 z-20 w-80 max-w-[calc(100vw-32px)] rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <button type="button" onClick={() => setSelected(null)} className="float-right text-slate-500 hover:text-white">×</button><div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Feature intelligence</div><h2 className="mt-1 pr-6 text-lg font-bold text-white">{featureName(selected)}</h2>
          {candidate && <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-xs"><div className="font-bold uppercase tracking-widest text-amber-300">Power at candidate</div><div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-slate-300"><span>Utility owner</span><strong>{insights.power_owner || selected.owner || "Not loaded"}</strong><span>Nearest substation</span><strong>{insights.nearest_substation_miles != null ? `${insights.nearest_substation_miles} mi` : "Not loaded"}</strong><span>Voltage across area</span><strong>{insights.voltage_classes?.length ? insights.voltage_classes.join(", ") : selected.voltage || "Not loaded"}</strong><span>Nearest transmission line</span><strong>{insights.nearest_line_miles != null ? `${insights.nearest_line_miles} mi` : "Not loaded"}</strong></div></div>}
          <dl className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs">{Object.entries(selected).filter(([key, value]) => {
            if (key.startsWith("_") || value == null || typeof value === "object") return false;
            if (!selected._layer_id?.includes("fiber_")) return true;
            return ["provider", "facility_name", "infrastructure_type", "route_type", "status", "source", "source_date", "distance_miles"].includes(key);
          }).slice(0, 14).map(([key, value]) => <div key={key} className="grid grid-cols-[105px_1fr] gap-2 border-t border-slate-800 py-1.5"><dt className="truncate text-slate-500">{key.replaceAll("_", " ")}</dt><dd className="break-words text-slate-200">{String(value)}</dd></div>)}</dl>
        </section>
      )}

      {fatalError && <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950 p-6"><div className="max-w-lg rounded-2xl border border-red-900 bg-red-950/30 p-6 text-center"><h2 className="text-lg font-bold text-red-200">Map configuration needed</h2><p className="mt-2 text-sm text-red-300">{fatalError}</p></div></div>}
    </div>
  );
}

export { LAYERS as SITEHAWK_INFRASTRUCTURE_LAYERS, escapeHtml };