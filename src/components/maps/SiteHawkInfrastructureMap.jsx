/*
 * SITEHAWK LIVE INFRASTRUCTURE COMMAND CENTER — installed 2026-07-14.
 * Base44 adaptations (per install notes):
 *  - Mapbox token arrives via the `mapboxToken` prop (served by getPublicConfig),
 *    not VITE_MAPBOX_ACCESS_TOKEN.
 *  - Live layer queries go through the `layerLoader` prop (backend function
 *    router in pages/InfrastructureIntelligence.jsx), not a raw /api endpoint.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NLCD_LAYERS, NLCD_YEARS, nlcdTilesUrl } from "./nlcdLayers";
import { FIBER_PROVIDER_LAYERS } from "./fiberLayers";
import { fccFiberProviders } from "@/functions/fccFiberProviders";
import ParcelIntelPanel from "./ParcelIntelPanel";

const MAPBOX_CSS = "https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css";
const MAPBOX_JS = "https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.js";
const DEFAULT_CENTER = [-81.5158, 27.6648];
const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] };

const LAYERS = [
  ...Object.values(NLCD_LAYERS),
  ...FIBER_PROVIDER_LAYERS,
  {
    id: "fiber_splice_points",
    group: "Fiber & backhaul",
    label: "Fiber splice points",
    description: "Available splice, handhole and access-point records",
    color: "#06b6d4",
    geometry: "point",
    source: "Live provider feeds",
    minZoom: 10,
    live: true,
  },
  {
    id: 'peeringdb_pops',
    group: 'Fiber & backhaul',
    label: 'Carrier PoPs & Backhaul Nodes',
    description: 'PeeringDB colocation facilities — carrier points-of-presence and IXP locations',
    color: '#A855F7',
    geometry: 'point',
    source: 'PeeringDB',
    minZoom: 6,
    live: true,
  },

  {
    id: "transmission_lines",
    group: "Power infrastructure",
    label: "Transmission lines",
    description: "Public electric transmission corridors",
    color: "#fbbf24",
    geometry: "line",
    source: "Data.gov / HIFLD",
  },
  {
    id: "substations",
    group: "Power infrastructure",
    label: "Substations",
    description: "Electric substations and owner attributes",
    color: "#f97316",
    geometry: "point",
    source: "Data.gov / HIFLD",
  },
  {
    id: "transformers",
    group: "Power infrastructure",
    label: "Transformers",
    description: "Available distribution and transmission transformer records",
    color: "#f59e0b",
    geometry: "point",
    source: "Live utility feeds",
    minZoom: 11,
    live: true,
  },
  {
    id: "utility_easements",
    group: "Power infrastructure",
    label: "Utility easements",
    description: "Recorded utility corridors and available easement boundaries",
    color: "#eab308",
    geometry: "fill",
    source: "County / utility records",
    minZoom: 9,
    live: true,
  },
  {
    id: "power_plants",
    group: "Power infrastructure",
    label: "Generation facilities",
    description: "Power plants, fuel and capacity",
    color: "#fb7185",
    geometry: "point",
    source: "Data.gov / EIA",
  },
  {
    id: "macro_towers",
    group: "Wireless",
    label: "Macro towers & structures",
    description: "Registered and commercially sourced structures",
    color: "#a78bfa",
    geometry: "point",
    source: "FCC ASR / public records",
  },

  {
    id: "cloudrf_coverage",
    group: "RF intelligence",
    label: "CloudRF predicted coverage",
    description: "On-demand RF propagation result",
    color: "#34d399",
    geometry: "fill",
    source: "CloudRF",
    expensive: true,
  },
  {
    id: "broadband_service",
    group: "Market intelligence",
    label: "Broadband service & gaps",
    description: "Availability, technology and underserved areas",
    color: "#60a5fa",
    geometry: "fill",
    source: "Data.gov / FCC",
  },
  {
    id: "cell_observations",
    group: "Field intelligence",
    label: "Cell/Wi-Fi observations",
    description: "User-authorized device observations and fixes",
    color: "#f472b6",
    geometry: "point",
    source: "Unwired Labs",
    expensive: true,
  },
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

function featureKey(feature, index) {
  const properties = feature?.properties || {};
  return String(feature?.id ?? properties.id ?? properties.objectid ?? properties.OBJECTID ??
    properties.globalid ?? properties.route_id ?? properties.site_id ?? `feature-${index}`);
}

function mergeGeoJson(current, incoming, deletedIds = []) {
  const features = new Map(
    normalizeGeoJson(current).features.map((feature, index) => [featureKey(feature, index), feature]),
  );
  deletedIds.forEach((id) => features.delete(String(id)));
  normalizeGeoJson(incoming).features.forEach((feature, index) => {
    features.set(featureKey(feature, index), feature);
  });
  return { type: "FeatureCollection", features: [...features.values()] };
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

function sourceIdFor(definition) {
  return definition.sourceId || `sitehawk-${definition.id}`;
}

function defaultOpacityFor(definition) {
  return definition.opacity ?? 0.9;
}

function addMapLayer(map, definition, data, { nlcdYear = 2025 } = {}) {
  const sourceId = sourceIdFor(definition);
  const existing = map.getSource(sourceId);
  if (existing) {
    if (definition.geometry !== "raster") existing.setData(data);
    return;
  }

  if (definition.geometry === "raster") {
    map.addSource(sourceId, {
      type: "raster",
      tiles: [nlcdTilesUrl(definition, nlcdYear)],
      tileSize: 256,
      attribution: "USGS / MRLC Annual NLCD",
    });
    map.addLayer({
      id: sourceId,
      type: "raster",
      source: sourceId,
      paint: { "raster-opacity": defaultOpacityFor(definition) },
      layout: { visibility: "none" },
    });
    return;
  }

  map.addSource(sourceId, { type: "geojson", data, generateId: true });

  if (definition.geometry === "line") {
    map.addLayer({
      id: sourceId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": definition.color,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 13, 4],
        "line-opacity": 0.9,
        "line-blur": ["interpolate", ["linear"], ["zoom"], 4, 0, 13, 1.2],
        "line-emissive-strength": 1,
      },
    });
    if (definition.showSplicePoints !== false) {
      // Splice / access points embedded in provider KMZ imports
      map.addLayer({
        id: `${sourceId}-points`,
        type: "circle",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          // Splice/access points (spec §4): magenta, 12px; other points inherit the layer color
          "circle-radius": ["interpolate", ["linear"], ["zoom"],
            4, ["case", ["==", ["get", "route_type"], "splice_point"], 4, 2.5],
            13, ["case", ["==", ["get", "route_type"], "splice_point"], 6, 7],
          ],
          "circle-color": ["case", ["==", ["get", "route_type"], "splice_point"], "#FF00FF", definition.color],
          "circle-stroke-color": "#020617",
          "circle-stroke-width": 1,
          "circle-opacity": 0.9,
          "circle-emissive-strength": 1,
        },
      });
    }
  } else if (definition.geometry === "fill") {
    map.addLayer({
      id: `${sourceId}-fill`,
      type: "fill",
      source: sourceId,
      paint: { "fill-color": definition.color, "fill-opacity": 0.3 },
    });
    map.addLayer({
      id: sourceId,
      type: "line",
      source: sourceId,
      paint: { "line-color": definition.color, "line-width": 1.2, "line-opacity": 0.8 },
    });
    map.addLayer({
      id: `${sourceId}-3d`,
      type: "fill-extrusion",
      source: sourceId,
      minzoom: definition.minZoom || 0,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": definition.color,
        "fill-extrusion-height": ["coalesce", ["to-number", ["get", "height"]], 18],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.62,
        "fill-extrusion-emissive-strength": 0.8,
      },
    });
  } else {
    map.addLayer({
      id: `${sourceId}-halo`,
      type: "circle",
      source: sourceId,
      minzoom: definition.minZoom || 0,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 7, 13, 16],
        "circle-color": definition.color,
        "circle-blur": 0.75,
        "circle-opacity": 0.42,
        "circle-emissive-strength": 1,
      },
    });
    map.addLayer({
      id: sourceId,
      type: "circle",
      source: sourceId,
      minzoom: definition.minZoom || 0,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 3, 13, 8],
        "circle-color": definition.color,
        "circle-stroke-color": "#020617",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.92,
        "circle-emissive-strength": 1,
      },
    });
  }
}

function setLayerVisibility(map, definition, visible, is3D = false) {
  const sourceId = sourceIdFor(definition);
  [sourceId, `${sourceId}-fill`, `${sourceId}-halo`, `${sourceId}-points`].forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
  });
  const extrusionId = `${sourceId}-3d`;
  if (map.getLayer(extrusionId)) map.setLayoutProperty(extrusionId, "visibility", visible && is3D ? "visible" : "none");
}

function setLayerOpacity(map, definition, opacity) {
  const id = sourceIdFor(definition);
  if (definition.geometry === "raster") {
    if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", opacity);
    return;
  }
  const fillId = `${id}-fill`;
  if (map.getLayer(fillId)) map.setPaintProperty(fillId, "fill-opacity", opacity * 0.42);
  if (map.getLayer(`${id}-3d`)) map.setPaintProperty(`${id}-3d`, "fill-extrusion-opacity", opacity * 0.7);
  if (map.getLayer(`${id}-halo`)) map.setPaintProperty(`${id}-halo`, "circle-opacity", opacity * 0.42);
  if (map.getLayer(`${id}-points`)) map.setPaintProperty(`${id}-points`, "circle-opacity", opacity * 0.9);
  if (!map.getLayer(id)) return;
  const property = definition.geometry === "point" ? "circle-opacity" : "line-opacity";
  map.setPaintProperty(id, property, opacity);
}

function enableCinematic3D(map) {
  try {
    if (!map.getSource("sitehawk-terrain")) {
      map.addSource("sitehawk-terrain", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
    }
    map.setTerrain({ source: "sitehawk-terrain", exaggeration: 1.35 });
    map.setFog({
      color: "rgb(4, 8, 22)",
      "high-color": "rgb(18, 28, 66)",
      "horizon-blend": 0.08,
      "space-color": "rgb(1, 2, 8)",
      "star-intensity": 0.45,
    });
    if (map.getSource("composite") && !map.getLayer("sitehawk-3d-buildings")) {
      const labelLayer = map.getStyle().layers.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"]);
      map.addLayer({
        id: "sitehawk-3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", ["get", "extrude"], "true"],
        type: "fill-extrusion",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["get", "height"], 0, "#111827", 80, "#312e81", 250, "#22d3ee"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.74,
          "fill-extrusion-emissive-strength": 0.18,
        },
      }, labelLayer?.id);
    }
    map.easeTo({ pitch: 67, bearing: -24, zoom: Math.max(map.getZoom(), 9), duration: 1600 });
  } catch (error) {
    console.warn("SiteHawk 3D enhancement could not be fully applied.", error);
  }
}

// Base44 adaptation: queries route through the backend function `loader`
// (which handles auth) instead of a raw fetch to /api/infrastructure-map.
export async function fetchInfrastructureUpdate({ loader, layer, bbox, zoom, since }) {
  const response = await loader({
    action: "query_layer",
    layer,
    bbox,
    zoom,
    ...(since ? { since } : {}),
  });
  const body = response?.data ?? response;
  if (body?.error) throw new Error(body.error);
  return {
    collection: normalizeGeoJson(body),
    cursor: body?.cursor || body?.next_cursor || body?.updated_at || new Date().toISOString(),
    deletedIds: body?.deleted_ids || body?.deletedIds || [],
    isDelta: body?.delta === true || body?.mode === "delta",
  };
}

export async function fetchInfrastructureLayer(options) {
  const update = await fetchInfrastructureUpdate(options);
  return update.collection;
}

export default function SiteHawkInfrastructureMap({
  mapboxToken,
  layerLoader,
  parcelIntelLoader,
  initialCenter = DEFAULT_CENTER,
  initialZoom = 6,
  liveRefreshMs = 30000,
  onOpen3D,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const requestSeqRef = useRef(new Map());
  const dataRef = useRef(new Map());
  const cursorsRef = useRef(new Map());
  const moveTimerRef = useRef(null);
  const initialLoadRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(() => new Set([
    "transmission_lines", "substations",
    // Layers declaring visible: true in their definition start enabled
    ...LAYERS.filter((layer) => layer.visible === true).map((layer) => layer.id),
  ]));
  const [loading, setLoading] = useState(() => new Set());
  const [errors, setErrors] = useState({});
  const [counts, setCounts] = useState({});
  const [opacity, setOpacity] = useState({});
  const [selected, setSelected] = useState(null);
  const [intel, setIntel] = useState(null);
  const intelLoaderRef = useRef(parcelIntelLoader);
  const intelSeqRef = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mapStyle, setMapStyle] = useState("dark-v11");
  const [nlcdYear, setNlcdYear] = useState(2025);
  const [is3D, setIs3D] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { intelLoaderRef.current = parcelIntelLoader; }, [parcelIntelLoader]);

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
      setFatalError("Mapbox token missing — set MAPBOX_API_KEY in Base44 secrets.");
      return undefined;
    }
    loadMapbox()
      .then((mapboxgl) => {
        if (disposed || !containerRef.current) return;
        mapboxgl.accessToken = mapboxToken;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: `mapbox://styles/mapbox/${mapStyle}`,
          center: initialCenter,
          zoom: initialZoom,
          pitch: 0,
          attributionControl: true,
        });
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-right");
        map.on("load", () => {
          mapRef.current = map;
          setMapReady(true);
        });
        map.on("click", (event) => {
          const ids = LAYERS.filter((layer) => layer.geometry !== "raster").flatMap((layer) => [
            `sitehawk-${layer.id}`,
            `sitehawk-${layer.id}-fill`,
            `sitehawk-${layer.id}-points`,
          ]).filter((id) => map.getLayer(id));
          const feature = ids.length ? map.queryRenderedFeatures(event.point, { layers: ids })[0] : null;
          if (feature) {
            setIntel(null);
            setSelected({ ...feature.properties, _coordinates: event.lngLat.toArray() });
          } else if (intelLoaderRef.current) {
            // Parcel Intelligence: empty-map click samples every GIS layer at the point
            const { lng, lat } = event.lngLat;
            const seq = ++intelSeqRef.current;
            setSelected(null);
            setIntel({ loading: true, lat, lon: lng });
            intelLoaderRef.current({ lat, lon: lng })
              .then((data) => {
                if (intelSeqRef.current === seq) setIntel({ loading: false, lat, lon: lng, data });
              })
              .catch((error) => {
                if (intelSeqRef.current === seq) setIntel({ loading: false, lat, lon: lng, error: error.message || String(error) });
              });

            fccFiberProviders({ lat, lon: lng }).then((fccData) => {
              if (fccData?.fiber_providers?.length > 0) {
                const rows = fccData.fiber_providers
                  .map((p) => `<tr>
                    <td style="padding:2px 8px;font-size:11px;color:#a3e635;">${p.provider_name}</td>
                    <td style="padding:2px 8px;font-size:11px;color:#94a3b8;text-align:right;">${p.max_down_mbps}↓ / ${p.max_up_mbps}↑ Mbps</td>
                  </tr>`)
                  .join('')
                const section = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #334155;">
                  <div style="font-size:11px;font-weight:600;color:#7c3aed;margin-bottom:4px;">
                    📡 FCC Licensed Fiber Carriers (${fccData.count})
                  </div>
                  <table style="width:100%;border-collapse:collapse;">${rows}</table>
                  <div style="font-size:9px;color:#64748b;margin-top:4px;">Source: FCC National Broadband Map · Technology code 50 FTTP</div>
                </div>`
                const popup = document.querySelector('.mapboxgl-popup-content')
                if (popup) {
                  const div = document.createElement('div')
                  div.innerHTML = section
                  popup.appendChild(div)
                }
              }
            }).catch(() => {})
          }
        });
        map.on("mouseenter", () => { map.getCanvas().style.cursor = "crosshair"; });
        // Splice-point hover tooltip (spec §4)
        const splicePopup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
        map.on("mousemove", (event) => {
          const pointIds = LAYERS.filter((layer) => layer.geometry === "line")
            .map((layer) => `sitehawk-${layer.id}-points`)
            .filter((id) => map.getLayer(id));
          const feature = pointIds.length ? map.queryRenderedFeatures(event.point, { layers: pointIds })[0] : null;
          if (feature?.properties?.route_type === "splice_point" && feature.geometry?.type === "Point") {
            const [lon, lat] = feature.geometry.coordinates;
            splicePopup.setLngLat(feature.geometry.coordinates).setHTML(
              `<div style="font-size:11px;line-height:1.5;color:#0f172a">` +
              `<strong>Name:</strong> ${escapeHtml(feature.properties.facility_name || "Unknown")}<br/>` +
              `<strong>Type:</strong> Splice Point<br/>` +
              `<strong>Coordinates:</strong> ${lat.toFixed(6)}, ${lon.toFixed(6)}<br/>` +
              `<strong>Provider:</strong> ${escapeHtml(feature.properties.provider || "Unknown")}` +
              `</div>`,
            ).addTo(map);
            map.getCanvas().style.cursor = "pointer";
          } else {
            splicePopup.remove();
          }
        });
      })
      .catch((error) => setFatalError(error.message || String(error)));
    return () => {
      disposed = true;
      clearTimeout(moveTimerRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Map is created once. Style changes are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const cached = Object.fromEntries(dataRef.current.entries());
    map.setStyle(`mapbox://styles/mapbox/${mapStyle}`);
    map.once("style.load", () => {
      LAYERS.forEach((layer) => {
        if (layer.geometry === "raster") {
          if (!active.has(layer.id)) return;
          addMapLayer(map, layer, null, { nlcdYear });
          setLayerVisibility(map, layer, true, is3D);
          setLayerOpacity(map, layer, opacity[layer.id] ?? defaultOpacityFor(layer));
          return;
        }
        if (!cached[layer.id]) return;
        addMapLayer(map, layer, cached[layer.id]);
        setLayerVisibility(map, layer, active.has(layer.id), is3D);
        setLayerOpacity(map, layer, opacity[layer.id] ?? defaultOpacityFor(layer));
      });
      if (is3D) enableCinematic3D(map);
    });
  }, [mapReady, mapStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLayer = useCallback(async (definition, { delta = false } = {}) => {
    const map = mapRef.current;
    if (!map || !layerLoader) return;
    if (definition.geometry === "raster") {
      addMapLayer(map, definition, null, { nlcdYear });
      setLayerVisibility(map, definition, true, is3D);
      setLayerOpacity(map, definition, opacity[definition.id] ?? defaultOpacityFor(definition));
      setLastSync(new Date());
      return;
    }
    if (definition.minZoom && map.getZoom() < definition.minZoom) {
      setErrors((value) => ({ ...value, [definition.id]: `Zoom to level ${definition.minZoom}+ to load this detail layer.` }));
      return;
    }
    // Stale-request guard: only the latest request per layer may apply.
    const seq = (requestSeqRef.current.get(definition.id) || 0) + 1;
    requestSeqRef.current.set(definition.id, seq);
    setLoading((value) => new Set(value).add(definition.id));
    setErrors((value) => ({ ...value, [definition.id]: "" }));
    try {
      const bounds = map.getBounds();
      const update = await fetchInfrastructureUpdate({
        loader: layerLoader,
        layer: definition.id,
        bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        zoom: Math.round(map.getZoom()),
        since: delta ? cursorsRef.current.get(definition.id) : undefined,
      });
      if (requestSeqRef.current.get(definition.id) !== seq) return;
      const current = dataRef.current.get(definition.id) || EMPTY_COLLECTION;
      const data = update.isDelta
        ? mergeGeoJson(current, update.collection, update.deletedIds)
        : update.collection;
      dataRef.current.set(definition.id, data);
      cursorsRef.current.set(definition.id, update.cursor);
      addMapLayer(map, definition, data);
      setLayerVisibility(map, definition, true, is3D);
      setLayerOpacity(map, definition, opacity[definition.id] ?? defaultOpacityFor(definition));
      setCounts((value) => ({ ...value, [definition.id]: data.features.length }));
      setLastSync(new Date());
    } catch (error) {
      if (requestSeqRef.current.get(definition.id) === seq) {
        setErrors((value) => ({ ...value, [definition.id]: error.message || String(error) }));
        setActive((value) => {
          const next = new Set(value);
          next.delete(definition.id);
          return next;
        });
      }
    } finally {
      setLoading((value) => {
        const next = new Set(value);
        next.delete(definition.id);
        return next;
      });
    }
  }, [layerLoader, is3D, nlcdYear, opacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    Object.values(NLCD_LAYERS).forEach((layer) => {
      const sourceId = sourceIdFor(layer);
      if (map.getLayer(sourceId)) map.removeLayer(sourceId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      if (!active.has(layer.id)) return;
      addMapLayer(map, layer, null, { nlcdYear });
      setLayerVisibility(map, layer, true, is3D);
      setLayerOpacity(map, layer, opacity[layer.id] ?? defaultOpacityFor(layer));
    });
  }, [nlcdYear]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mapReady || initialLoadRef.current) return;
    initialLoadRef.current = true;
    LAYERS.filter((layer) => active.has(layer.id)).forEach((layer) => loadLayer(layer));
  }, [active, loadLayer, mapReady]);

  const toggleLayer = useCallback((definition) => {
    if (!mapReady) return;
    const enabled = !active.has(definition.id);
    setActive((value) => {
      const next = new Set(value);
      enabled ? next.add(definition.id) : next.delete(definition.id);
      return next;
    });
    const sourceExists = mapRef.current?.getSource(sourceIdFor(definition));
    if (sourceExists) setLayerVisibility(mapRef.current, definition, enabled, is3D);
    else if (enabled) loadLayer(definition);
  }, [active, is3D, loadLayer, mapReady]);

  const changeOpacity = (definition, value) => {
    const next = Number(value);
    setOpacity((current) => ({ ...current, [definition.id]: next }));
    if (mapRef.current) setLayerOpacity(mapRef.current, definition, next);
  };

  const refreshActive = useCallback(async ({ delta = false } = {}) => {
    const enabled = LAYERS.filter((layer) => active.has(layer.id));
    if (!enabled.length) return;
    setSyncing(true);
    await Promise.allSettled(enabled.map((layer) => loadLayer(layer, { delta })));
    setSyncing(false);
  }, [active, loadLayer]);

  useEffect(() => {
    if (!mapReady || !liveEnabled) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshActive({ delta: true });
    }, Math.max(10000, liveRefreshMs));
    return () => window.clearInterval(timer);
  }, [liveEnabled, liveRefreshMs, mapReady, refreshActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return undefined;
    const handleMove = () => {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = setTimeout(() => refreshActive(), 450);
    };
    map.on("moveend", handleMove);
    return () => map.off("moveend", handleMove);
  }, [mapReady, refreshActive]);

  const toggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);
    if (next) enableCinematic3D(map);
    else {
      map.setTerrain(null);
      map.setFog(null);
      map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });
    }
    LAYERS.forEach((layer) => setLayerVisibility(map, layer, active.has(layer.id), next));
  };

  return (
    <div className="relative h-[calc(100vh-64px)] min-h-[680px] overflow-hidden bg-slate-950 text-slate-100">
      <div ref={containerRef} className="absolute inset-0" />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-slate-950/95 to-transparent p-4 pb-12">
        <div className="pointer-events-auto flex items-center gap-3">
          <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="rounded-xl border border-cyan-500/30 bg-slate-950/90 px-3 py-2 text-cyan-300 shadow-xl backdrop-blur">
            {sidebarOpen ? "Hide layers" : "Show layers"}
          </button>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-400">SiteHawk</div>
            <h1 className="text-xl font-black tracking-tight text-white">Live Infrastructure Command Center</h1>
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setLiveEnabled((value) => !value)} className={`rounded-xl border px-3 py-2 text-xs font-bold backdrop-blur ${liveEnabled ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200" : "border-slate-700 bg-slate-950/90 text-slate-400"}`}>
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${liveEnabled ? "animate-pulse bg-emerald-300" : "bg-slate-600"}`} />
            {liveEnabled ? "LIVE" : "PAUSED"}
          </button>
          <select value={mapStyle} onChange={(event) => setMapStyle(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-200 backdrop-blur">
            <option value="dark-v11">Dark intelligence</option>
            <option value="satellite-streets-v12">Satellite</option>
            <option value="outdoors-v12">Terrain</option>
            <option value="light-v11">Light</option>
          </select>
          <button type="button" onClick={toggle3D} className={`rounded-xl border px-3 py-2 text-xs font-bold backdrop-blur ${is3D ? "border-fuchsia-300/70 bg-fuchsia-500/30 text-white shadow-[0_0_24px_rgba(217,70,239,0.35)]" : "border-violet-400/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"}`}>
            {is3D ? "Exit Deep Space 3D" : "Deep Space 3D"}
          </button>
          {onOpen3D && <button type="button" onClick={() => onOpen3D({ center: mapRef.current?.getCenter(), zoom: mapRef.current?.getZoom() })} className="rounded-xl border border-slate-600 bg-slate-950/90 px-3 py-2 text-xs font-semibold text-slate-300 backdrop-blur hover:border-cyan-500/50">Photoreal viewer</button>}
        </div>
      </header>

      {sidebarOpen && (
        <aside className="absolute bottom-4 left-4 top-24 z-20 flex w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/94 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Layer control</div>
                <div className="mt-1 text-xs text-slate-500">{active.size} active · {Object.values(counts).reduce((a, b) => a + b, 0).toLocaleString()} features</div>
              </div>
              <button type="button" disabled={!active.size || syncing} onClick={() => refreshActive()} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-cyan-300 disabled:opacity-30">{syncing ? "Syncing..." : "Refresh view"}</button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px]">
              <span className="text-slate-400">Delta refresh</span>
              <span className={liveEnabled ? "font-bold text-emerald-300" : "text-slate-500"}>{liveEnabled ? `Every ${Math.round(liveRefreshMs / 1000)} sec` : "Paused"}</span>
            </div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search infrastructure layers…" className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-500" />
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {Object.entries(groupedLayers).map(([group, layers]) => (
              <section key={group} className="mb-5">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{group}</h2>
                  {group === "Land intelligence" && (
                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Year
                      <select value={nlcdYear} onChange={(event) => setNlcdYear(Number(event.target.value))} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-cyan-200 outline-none focus:border-cyan-500">
                        {NLCD_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="space-y-2">
                  {layers.map((layer) => {
                    const enabled = active.has(layer.id);
                    const busy = loading.has(layer.id);
                    return (
                      <div key={layer.id} className={`rounded-xl border p-3 transition ${enabled ? "border-cyan-500/40 bg-cyan-950/25" : "border-slate-800 bg-slate-900/45"}`}>
                        <button type="button" onClick={() => toggleLayer(layer)} className="flex w-full items-start gap-3 text-left">
                          <span className="mt-0.5 h-4 w-4 shrink-0 rounded border" style={{ borderColor: layer.color, background: enabled ? layer.color : "transparent", boxShadow: enabled ? `0 0 14px ${layer.color}` : "none" }} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-100">{layer.label}{layer.geometry === "raster" ? ` ${nlcdYear}` : ""}</span>
                              <span className="shrink-0 text-[10px] text-slate-500">{busy ? "Loading…" : counts[layer.id] != null ? counts[layer.id].toLocaleString() : layer.source}</span>
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{layer.description}{layer.expensive ? " · on demand" : ""}</span>
                          </span>
                        </button>
                        {enabled && !busy && !errors[layer.id] && (
                          <input aria-label={`${layer.label} opacity`} type="range" min="0.15" max="1" step="0.05" value={opacity[layer.id] ?? defaultOpacityFor(layer)} onChange={(event) => changeOpacity(layer, event.target.value)} className="mt-2 h-1 w-full accent-cyan-400" />
                        )}
                        {errors[layer.id] && <div className="mt-2 rounded-lg bg-red-950/60 px-2 py-1.5 text-[11px] text-red-300">{errors[layer.id]}</div>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </aside>
      )}

      <ParcelIntelPanel intel={intel} onClose={() => setIntel(null)} />

      {selected && (
        <section className="absolute bottom-8 right-4 z-20 w-80 max-w-[calc(100vw-32px)] rounded-2xl border border-cyan-500/30 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">
          <button type="button" onClick={() => setSelected(null)} className="float-right text-slate-500 hover:text-white">×</button>
          <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Feature intelligence</div>
          <h2 className="mt-1 pr-6 text-lg font-bold text-white">{featureName(selected)}</h2>
          <dl className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs">
            {Object.entries(selected).filter(([key, value]) => !key.startsWith("_") && value != null && typeof value !== "object").slice(0, 14).map(([key, value]) => (
              <div key={key} className="grid grid-cols-[105px_1fr] gap-2 border-t border-slate-800 py-1.5">
                <dt className="truncate text-slate-500">{key.replaceAll("_", " ")}</dt>
                <dd className="break-words text-slate-200">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-700/70 bg-slate-950/85 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 shadow-xl backdrop-blur">
        <span className={liveEnabled ? "text-emerald-300" : "text-amber-300"}>{liveEnabled ? "Live command feed" : "Feed paused"}</span>
        <span className="mx-2 text-slate-700">|</span>
        {lastSync ? `Updated ${lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Awaiting first sync"}
      </div>

      {fatalError && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950 p-6">
          <div className="max-w-lg rounded-2xl border border-red-900 bg-red-950/30 p-6 text-center">
            <h2 className="text-lg font-bold text-red-200">Map configuration needed</h2>
            <p className="mt-2 text-sm text-red-300">{fatalError}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export { LAYERS as SITEHAWK_INFRASTRUCTURE_LAYERS, escapeHtml };