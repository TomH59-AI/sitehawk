import { useCallback, useEffect, useRef, useState } from "react";
import * as turf from "@turf/turf";
import {
  AlertTriangle,
  ArrowRight,
  Cable,
  CheckCircle2,
  Crosshair,
  Loader2,
  Network,
  Radio,
  Save,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";
import { useBilling } from "@/lib/useBilling";
import UpgradeModal from "@/components/billing/UpgradeModal";

const MIN_RADIUS_MILES = 0.5;
const MAX_RADIUS_MILES = 3;
const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 };
const MAP_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

const CARRIERS = [
  { value: "verizon", label: "Verizon", color: "#ef4444" },
  { value: "att", label: "AT&T", color: "#38bdf8" },
  { value: "tmobile", label: "T-Mobile", color: "#ec4899" },
];

const MAP_LAYERS = [
  "cf-points-cluster-count",
  "cf-points-cluster",
  "cf-points",
  "cf-runs-highlight",
  "cf-runs",
  "prop-center",
  "prop-towers",
  "prop-opportunities-outline",
  "prop-opportunities",
  "prop-coverage-outline",
  "prop-coverage",
  "prop-radius-line",
  "prop-radius-fill",
  "prop-coverage-raster",
];

const MAP_SOURCES = [
  "cf-points",
  "cf-runs",
  "prop-center",
  "prop-towers",
  "prop-opportunities",
  "prop-coverage",
  "prop-radius",
  "prop-coverage-raster",
];

function clampRadius(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, number));
}

function normalizeCenter(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng ?? value?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function normalizeBounds(bounds) {
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

function carrierFinderBbox(center) {
  // The backend enforces a 2-mile diagonal. This 1.98-mile box leaves a
  // rounding margin while keeping the overlay centered on the RF analysis.
  const halfDiagonalMiles = 0.99;
  const halfSideMiles = halfDiagonalMiles / Math.sqrt(2);
  const dLat = halfSideMiles / 69;
  const cosLat = Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));
  const dLng = halfSideMiles / (69.172 * cosLat);
  return [
    center.lng - dLng,
    center.lat - dLat,
    center.lng + dLng,
    center.lat + dLat,
  ];
}

function featureCollection(features = []) {
  return { type: "FeatureCollection", features };
}

function carrierFinderPopupContent({ metadata, loading = false, error = "" }) {
  const root = document.createElement("div");
  root.style.minWidth = "210px";
  root.style.maxWidth = "280px";
  root.style.color = "#0f172a";
  root.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";

  const title = document.createElement("div");
  title.style.fontWeight = "800";
  title.style.fontSize = "13px";
  title.style.marginBottom = "6px";
  title.textContent = loading
    ? "Loading CarrierFinder details…"
    : error
      ? "CarrierFinder"
      : metadata?.properties?.operator || metadata?.properties?.label || "CarrierFinder feature";
  root.appendChild(title);

  if (loading || error) {
    const message = document.createElement("div");
    message.style.fontSize = "12px";
    message.style.color = error ? "#b91c1c" : "#475569";
    message.textContent = error || "Loading…";
    root.appendChild(message);
    return root;
  }

  const properties = metadata?.properties || {};
  const rows = [
    ["Type", metadata?.feature_type === "run" ? "Fiber run" : properties.node_type || "Network point"],
    ["Status", metadata?.feature_type === "run" ? properties.status : properties.network_access],
    ["Capacity", properties.capacity_gbps != null ? `${properties.capacity_gbps} Gbps` : null],
    ["Carriers", Array.isArray(properties.carrier_list) ? properties.carrier_list.join(", ") : null],
    ["Location", properties.label],
    ["Updated", properties.last_updated],
  ].filter(([, value]) => value);

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.style.fontSize = "11px";
    row.style.lineHeight = "1.45";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    row.appendChild(strong);
    row.appendChild(document.createTextNode(String(value)));
    root.appendChild(row);
  });

  if (properties._cf_geometry_valid === false) {
    const warning = document.createElement("div");
    warning.style.marginTop = "6px";
    warning.style.fontSize = "11px";
    warning.style.color = "#b45309";
    warning.textContent = properties._cf_geometry_warnings || "CarrierFinder geometry needs review.";
    root.appendChild(warning);
  }

  const source = document.createElement("div");
  source.style.marginTop = "7px";
  source.style.fontSize = "10px";
  source.style.color = "#64748b";
  source.textContent = "Source: CarrierFinder";
  root.appendChild(source);
  return root;
}

function bindCarrierFinderInteractions(map, onFeatureClick) {
  if (map.__sitehawkCarrierFinderBound) return;
  map.__sitehawkCarrierFinderBound = true;

  map.on("click", (event) => {
    const layerIds = [
      "cf-points-cluster",
      "cf-points",
      "cf-runs",
    ].filter((layerId) => map.getLayer(layerId));
    if (!layerIds.length) return;

    const feature = map.queryRenderedFeatures(event.point, { layers: layerIds })?.[0];
    if (!feature) return;

    const clusterId = feature?.properties?.cluster_id;
    const source = map.getSource("cf-points");
    if (clusterId != null && source?.getClusterExpansionZoom) {
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error) return;
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      });
      return;
    }
    onFeatureClick(feature, event.lngLat);
  });

  map.on("mousemove", (event) => {
    const layerIds = ["cf-points-cluster", "cf-points", "cf-runs"]
      .filter((layerId) => map.getLayer(layerId));
    map.getCanvas().style.cursor =
      layerIds.length &&
      map.queryRenderedFeatures(event.point, { layers: layerIds }).length
        ? "pointer"
        : "";
  });
}

function towerCollection(towers = []) {
  return {
    type: "FeatureCollection",
    features: towers.map((tower) => ({
      type: "Feature",
      properties: {
        structure_type: tower.structure_type || "Registered structure",
        distance_miles: tower.distance_miles ?? null,
        source: tower.source || "FCC ASR",
      },
      geometry: {
        type: "Point",
        coordinates: [tower.lng, tower.lat],
      },
    })),
  };
}

function clearExplorerLayers(map) {
  MAP_LAYERS.forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  MAP_SOURCES.forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });
}

function addExplorerLayers(
  map,
  center,
  radiusMiles,
  result,
  carrierFinderGeojson,
  carrierFinderLayers,
  onCarrierFinderClick
) {
  clearExplorerLayers(map);

  const radius = turf.circle([center.lng, center.lat], radiusMiles, {
    steps: 96,
    units: "miles",
  });

  const rasterBounds = normalizeBounds(result?.coverage?.raster?.bounds);
  const rasterUrl = result?.coverage?.raster?.url;
  if (rasterBounds && rasterUrl) {
    map.addSource("prop-coverage-raster", {
      type: "image",
      url: rasterUrl,
      coordinates: [
        [rasterBounds.west, rasterBounds.north],
        [rasterBounds.east, rasterBounds.north],
        [rasterBounds.east, rasterBounds.south],
        [rasterBounds.west, rasterBounds.south],
      ],
    });
    map.addLayer({
      id: "prop-coverage-raster",
      type: "raster",
      source: "prop-coverage-raster",
      paint: {
        "raster-opacity": 0.62,
        "raster-fade-duration": 0,
      },
    });
  }

  map.addSource("prop-radius", { type: "geojson", data: radius });
  map.addLayer({
    id: "prop-radius-fill",
    type: "fill",
    source: "prop-radius",
    paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.05 },
  });
  map.addLayer({
    id: "prop-radius-line",
    type: "line",
    source: "prop-radius",
    paint: {
      "line-color": "#67e8f9",
      "line-width": 2,
      "line-dasharray": [2, 2],
    },
  });

  if (result?.coverage?.geometry) {
    map.addSource("prop-coverage", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: result.coverage.properties || {},
        geometry: result.coverage.geometry,
      },
    });
    map.addLayer({
      id: "prop-coverage",
      type: "fill",
      source: "prop-coverage",
      paint: { "fill-color": "#22c55e", "fill-opacity": rasterUrl ? 0.08 : 0.28 },
    });
    map.addLayer({
      id: "prop-coverage-outline",
      type: "line",
      source: "prop-coverage",
      paint: { "line-color": "#86efac", "line-width": 1.5, "line-opacity": 0.9 },
    });
  }

  if (result?.opportunityZones?.features?.length) {
    map.addSource("prop-opportunities", {
      type: "geojson",
      data: result.opportunityZones,
    });
    map.addLayer({
      id: "prop-opportunities",
      type: "fill",
      source: "prop-opportunities",
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "score"],
          60,
          "#fbbf24",
          100,
          "#f97316",
        ],
        "fill-opacity": 0.5,
      },
    });
    map.addLayer({
      id: "prop-opportunities-outline",
      type: "line",
      source: "prop-opportunities",
      paint: { "line-color": "#fed7aa", "line-width": 0.8 },
    });
  }

  if (result?.towers?.length) {
    map.addSource("prop-towers", {
      type: "geojson",
      data: towerCollection(result.towers),
    });
    map.addLayer({
      id: "prop-towers",
      type: "circle",
      source: "prop-towers",
      paint: {
        "circle-radius": 6,
        "circle-color": "#a855f7",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });
  }

  if (carrierFinderGeojson) {
    const rawFeatures = Array.isArray(carrierFinderGeojson.features)
      ? carrierFinderGeojson.features
      : [];
    const runFeatures = carrierFinderLayers?.runs
      ? rawFeatures.filter((feature) =>
          feature?.geometry?.type === "LineString" ||
          feature?.geometry?.type === "MultiLineString"
        )
      : [];
    const pointFeatures = carrierFinderLayers?.points
      ? rawFeatures.filter((feature) => feature?.geometry?.type === "Point")
      : [];

    map.addSource("cf-runs", {
      type: "geojson",
      data: featureCollection(runFeatures),
    });
    map.addLayer({
      id: "cf-runs",
      type: "line",
      source: "cf-runs",
      paint: {
        "line-color": [
          "match",
          ["get", "status"],
          "active", "#22c55e",
          "planned", "#f97316",
          "retired", "#94a3b8",
          "#06b6d4",
        ],
        "line-width": 3,
        "line-opacity": 0.9,
      },
    });
    map.addLayer({
      id: "cf-runs-highlight",
      type: "line",
      source: "cf-runs",
      filter: ["==", ["get", "_cf_geometry_valid"], false],
      paint: {
        "line-color": "#f59e0b",
        "line-width": 4,
        "line-dasharray": [1.5, 1.5],
      },
    });

    map.addSource("cf-points", {
      type: "geojson",
      data: featureCollection(pointFeatures),
      cluster: true,
      clusterMaxZoom: 16,
      clusterRadius: 36,
    });
    map.addLayer({
      id: "cf-points-cluster",
      type: "circle",
      source: "cf-points",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#0f766e",
        "circle-radius": [
          "step",
          ["get", "point_count"],
          14,
          10,
          18,
          50,
          23,
        ],
        "circle-stroke-color": "#ccfbf1",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "cf-points-cluster-count",
      type: "symbol",
      source: "cf-points",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-size": 11,
      },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: "cf-points",
      type: "circle",
      source: "cf-points",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "match",
          ["get", "network_access"],
          "on-net", "#22c55e",
          "near-net", "#facc15",
          "#14b8a6",
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    });

    bindCarrierFinderInteractions(map, onCarrierFinderClick);
  }

  map.addSource("prop-center", {
    type: "geojson",
    data: turf.point([center.lng, center.lat]),
  });
  map.addLayer({
    id: "prop-center",
    type: "circle",
    source: "prop-center",
    paint: {
      "circle-radius": 8,
      "circle-color": "#06b6d4",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  });

  const bounds = turf.bbox(radius);
  map.fitBounds(
    [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    { padding: 46, duration: 500 }
  );
}

function planQuotaLabel(tier) {
  const limit = tier?.propagation_daily_quota;
  if (limit === Infinity) return "Unlimited runs";
  if (Number.isFinite(limit) && limit > 0) return `${limit} runs/day`;
  return "HawkVision feature";
}

export default function PropagationExplorer({
  active = true,
  initialCenter,
  towerHeightFt = 199,
  onRunTalonFit,
  onSaveScip,
}) {
  const billing = useBilling();
  const seededCenter = normalizeCenter(initialCenter);
  const [center, setCenter] = useState(seededCenter);
  const [radiusMiles, setRadiusMiles] = useState(1);
  const [carrier, setCarrier] = useState("verizon");
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [carrierFinderEnabled, setCarrierFinderEnabled] = useState(false);
  const [carrierFinderLayers, setCarrierFinderLayers] = useState({
    runs: true,
    points: true,
  });
  const [carrierFinderLoading, setCarrierFinderLoading] = useState(false);
  const [carrierFinderError, setCarrierFinderError] = useState("");
  const [carrierFinderGeojson, setCarrierFinderGeojson] = useState(null);
  const [carrierFinderQuota, setCarrierFinderQuota] = useState(null);
  const [carrierFinderCacheHit, setCarrierFinderCacheHit] = useState(false);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const seededRef = useRef(Boolean(seededCenter));
  const carrierFinderRequestRef = useRef(null);
  const carrierFinderSequenceRef = useRef(0);
  const carrierFinderClickRef = useRef(null);

  useEffect(() => {
    const next = normalizeCenter(initialCenter);
    if (!next || seededRef.current) return;
    seededRef.current = true;
    setCenter(next);
  }, [initialCenter]);

  useEffect(() => {
    if (!active || mapRef.current || !containerRef.current) return undefined;
    let cancelled = false;

    async function initializeMap() {
      try {
        const config = await loadPublicConfig();
        const token = config?.mapboxAccessToken;
        if (!token) throw new Error("Mapbox is not configured.");
        await ensureMapboxLoaded();
        if (cancelled || !containerRef.current || !window.mapboxgl) return;

        window.mapboxgl.accessToken = token;
        const firstCenter = center || DEFAULT_CENTER;
        const map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: [firstCenter.lng, firstCenter.lat],
          zoom: center ? 12 : 3.2,
          attributionControl: true,
        });
        map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
        map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-right");
        map.on("click", (event) => {
          const carrierFinderLayerIds = [
            "cf-runs",
            "cf-points",
            "cf-points-cluster",
          ].filter((layerId) => map.getLayer(layerId));
          if (
            carrierFinderLayerIds.length &&
            map.queryRenderedFeatures(event.point, { layers: carrierFinderLayerIds }).length
          ) {
            return;
          }
          const next = { lat: event.lngLat.lat, lng: event.lngLat.lng };
          setCenter(next);
          setResult(null);
          setSaveMessage("");
          setError("");
          setCarrierFinderError("");
        });
        map.on("load", () => {
          if (!cancelled) setMapReady(true);
        });
        mapRef.current = map;
      } catch (err) {
        if (!cancelled) setMapError(err?.message || "Map failed to load.");
      }
    }

    initializeMap();
    return () => {
      cancelled = true;
    };
  }, [active, center]);

  useEffect(() => {
    if (!active || !mapRef.current) return;
    window.setTimeout(() => mapRef.current?.resize?.(), 0);
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !center) return;
    try {
      addExplorerLayers(
        map,
        center,
        radiusMiles,
        result,
        carrierFinderEnabled ? carrierFinderGeojson : null,
        carrierFinderLayers,
        (feature, lngLat) => carrierFinderClickRef.current?.(feature, lngLat)
      );
    } catch (err) {
      console.warn("Propagation Explorer layer draw failed:", err);
      setMapError(err?.message || "Map layers could not be drawn.");
    }
  }, [
    carrierFinderEnabled,
    carrierFinderGeojson,
    carrierFinderLayers,
    center,
    mapReady,
    radiusMiles,
    result,
  ]);

  useEffect(() => () => {
    mapRef.current?.remove?.();
    mapRef.current = null;
  }, []);

  const openUpgrade = useCallback((gate, message, upgradeTo) => {
    setUpgradeModal({
      gate,
      message,
      upgradeTo,
      currentTier: billing.tierKey,
    });
  }, [billing.tierKey]);

  const handleCarrierFinderToggle = useCallback(() => {
    if (!billing.canPropagation) {
      openUpgrade(
        "carrierfinder",
        "CarrierFinder requires HawkVision Pro or higher.",
        billing.tierKey === "hawk_site_law" ? "hawk_vision_law" : "hawk_vision"
      );
      return;
    }
    setCarrierFinderEnabled((enabled) => !enabled);
    setCarrierFinderError("");
  }, [billing.canPropagation, billing.tierKey, openUpgrade]);

  const handleCarrierFinderFeature = useCallback(async (feature, lngLat) => {
    const request = carrierFinderRequestRef.current;
    const featureId = String(feature?.properties?.id || feature?.id || "").slice(0, 96);
    if (!request || !featureId || !window.mapboxgl) return;

    const popup = new window.mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "300px",
    })
      .setLngLat(lngLat)
      .setDOMContent(carrierFinderPopupContent({ loading: true }))
      .addTo(mapRef.current);

    try {
      const response = await base44.functions.invoke("carrierFinderOverlay", {
        action: "metadata",
        featureId,
        ...request,
      });
      const data = response?.data ?? response;
      if (!data?.success || !data?.metadata) {
        throw Object.assign(
          new Error(data?.error || "CarrierFinder details are unavailable."),
          { data }
        );
      }
      popup.setDOMContent(carrierFinderPopupContent({ metadata: data.metadata }));
      if (data.quota) setCarrierFinderQuota(data.quota);
    } catch (err) {
      const body = err?.response?.data || err?.data || {};
      popup.setDOMContent(
        carrierFinderPopupContent({
          error: body?.error || err?.message || "CarrierFinder details are unavailable.",
        })
      );
    }
  }, []);

  useEffect(() => {
    carrierFinderClickRef.current = handleCarrierFinderFeature;
  }, [handleCarrierFinderFeature]);

  useEffect(() => {
    if (!carrierFinderEnabled) {
      carrierFinderSequenceRef.current += 1;
      carrierFinderRequestRef.current = null;
      setCarrierFinderGeojson(null);
      setCarrierFinderLoading(false);
      return undefined;
    }
    if (!active || !mapReady || !center || billing.loading) return undefined;
    if (!billing.canPropagation) {
      setCarrierFinderError("CarrierFinder requires HawkVision Pro or higher.");
      return undefined;
    }

    const sequence = carrierFinderSequenceRef.current + 1;
    carrierFinderSequenceRef.current = sequence;
    const timer = window.setTimeout(async () => {
      const request = {
        bbox: carrierFinderBbox(center),
        zoom: Math.round(mapRef.current?.getZoom?.() ?? 14),
        layers: ["runs", "points"],
      };
      carrierFinderRequestRef.current = request;
      setCarrierFinderLoading(true);
      setCarrierFinderError("");
      try {
        const response = await base44.functions.invoke("carrierFinderOverlay", {
          action: "geojson",
          ...request,
        });
        const data = response?.data ?? response;
        if (!data?.success || data?.geojson?.type !== "FeatureCollection") {
          throw Object.assign(
            new Error(data?.error || "CarrierFinder overlay failed."),
            { data }
          );
        }
        if (carrierFinderSequenceRef.current !== sequence) return;
        setCarrierFinderGeojson(data.geojson);
        setCarrierFinderQuota(data.quota || null);
        setCarrierFinderCacheHit(Boolean(data.cache?.hit));
      } catch (err) {
        if (carrierFinderSequenceRef.current !== sequence) return;
        const body = err?.response?.data || err?.data || {};
        setCarrierFinderGeojson(null);
        setCarrierFinderQuota(body?.quota || null);
        setCarrierFinderError(
          body?.error || err?.message || "CarrierFinder overlay failed."
        );
      } finally {
        if (carrierFinderSequenceRef.current === sequence) {
          setCarrierFinderLoading(false);
        }
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    active,
    billing.canPropagation,
    billing.loading,
    carrierFinderEnabled,
    center,
    mapReady,
  ]);

  const handleRun = useCallback(async () => {
    if (!center || loading) return;
    if (!billing.canPropagation) {
      openUpgrade(
        "propagation",
        "Propagation Explorer requires HawkVision Pro or higher.",
        billing.tierKey === "hawk_site_law" ? "hawk_vision_law" : "hawk_vision"
      );
      return;
    }

    setLoading(true);
    setError("");
    setSaveMessage("");
    try {
      const response = await base44.functions.invoke("propagationExplorerRun", {
        lat: center.lat,
        lng: center.lng,
        radiusMiles: clampRadius(radiusMiles),
        carrier,
        heightFt: Number(towerHeightFt) || 199,
      });
      const data = response?.data ?? response;
      if (!data?.success) throw Object.assign(new Error(data?.error || "Propagation run failed."), { data });
      setResult(data);
    } catch (err) {
      const body = err?.response?.data || err?.data || {};
      const message = body?.error || err?.message || "Propagation run failed.";
      setError(message);
      if (body?.code === "propagation_quota_exceeded" || body?.code === "propagation_upgrade_required") {
        openUpgrade("propagation", message, body?.upgrade_to || "hawk_vision");
      }
    } finally {
      setLoading(false);
    }
  }, [
    billing.canPropagation,
    billing.tierKey,
    carrier,
    center,
    loading,
    openUpgrade,
    radiusMiles,
    towerHeightFt,
  ]);

  const handleSave = useCallback(async () => {
    if (!result || saving || !onSaveScip) return;
    if (!billing.canScip) {
      openUpgrade(
        "scip_quota",
        "Saving an RF view to SCIP requires a SCIP-enabled plan.",
        "hawk_site"
      );
      return;
    }

    setSaving(true);
    setError("");
    setSaveMessage("");
    try {
      const records = await base44.entities.ScipRecord.list("-created_date", 500);
      const month = new Date().toISOString().slice(0, 7);
      const monthCount = (records || []).filter((record) =>
        String(record?.created_date || "").startsWith(month)
      ).length;
      const gate = await billing.checkScipQuota(monthCount);
      if (!gate.allowed) {
        openUpgrade(gate.gate, gate.message, gate.upgradeTo);
        return;
      }
      await onSaveScip(result);
      setSaveMessage("RF view saved to SCIP.");
    } catch (err) {
      setError(err?.message || "Could not save this RF view.");
    } finally {
      setSaving(false);
    }
  }, [billing, onSaveScip, openUpgrade, result, saving]);

  const handleTalonFit = useCallback(() => {
    if (!center) return;
    onRunTalonFit?.(center);
  }, [center, onRunTalonFit]);

  const selectedCarrier = CARRIERS.find((item) => item.value === carrier);
  const usage = result?.usage;
  const opportunityCount = result?.opportunityZones?.features?.length || 0;
  const carrierFinderFeatures = carrierFinderGeojson?.features || [];
  const carrierFinderRunCount = carrierFinderFeatures.filter(
    (feature) =>
      feature?.geometry?.type === "LineString" ||
      feature?.geometry?.type === "MultiLineString"
  ).length;
  const carrierFinderPointCount = carrierFinderFeatures.filter(
    (feature) => feature?.geometry?.type === "Point"
  ).length;

  return (
    <div className="flex h-full min-h-0 bg-slate-950 text-slate-100">
      <aside className="w-[310px] shrink-0 overflow-y-auto border-r border-slate-800 bg-slate-900 p-4">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-cyan-300">
            <Radio className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">RF Intelligence</span>
          </div>
          <h2 className="mt-1 text-lg font-bold">Propagation Explorer</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Click the map to choose a center, then compare CloudRF coverage with registered towers.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Carrier preset
            </span>
            <select
              value={carrier}
              onChange={(event) => {
                setCarrier(event.target.value);
                setResult(null);
                setSaveMessage("");
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              {CARRIERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Radius</span>
              <span className="text-cyan-300">{radiusMiles.toFixed(1)} mi</span>
            </span>
            <input
              type="range"
              min={MIN_RADIUS_MILES}
              max={MAX_RADIUS_MILES}
              step="0.5"
              value={radiusMiles}
              onChange={(event) => {
                setRadiusMiles(clampRadius(event.target.value));
                setResult(null);
                setSaveMessage("");
              }}
              className="w-full accent-cyan-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>0.5 mi</span>
              <span>3 mi hard cap</span>
            </div>
          </label>

          <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Crosshair className="h-4 w-4 text-cyan-400" />
              {center
                ? `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`
                : "Click the map to set the center"}
            </div>
          </div>

          <button
            type="button"
            onClick={handleRun}
            disabled={!center || loading || billing.loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            {loading ? "Running propagation…" : "Run Propagation"}
          </button>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-400">
            <div className="flex justify-between">
              <span>Plan</span>
              <span className="font-semibold text-slate-200">{billing.tier?.label || "Free"}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Propagation allowance</span>
              <span className="text-cyan-300">{planQuotaLabel(billing.tier)}</span>
            </div>
            {usage && (
              <div className="mt-1 flex justify-between">
                <span>Used today</span>
                <span className="text-slate-200">
                  {usage.used}{usage.limit == null ? "" : ` / ${usage.limit}`}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 p-3">
            <button
              type="button"
              onClick={handleCarrierFinderToggle}
              aria-pressed={carrierFinderEnabled}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Cable className="h-4 w-4 shrink-0 text-teal-300" />
                <span>
                  <span className="block text-xs font-bold text-slate-100">
                    CarrierFinder overlay
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    Propagation Map only · 2-mile lookup area
                  </span>
                </span>
              </span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition ${
                  carrierFinderEnabled ? "bg-teal-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                    carrierFinderEnabled ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            {carrierFinderEnabled && (
              <div className="mt-3 space-y-2 border-t border-teal-500/15 pt-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCarrierFinderLayers((layers) => ({
                        ...layers,
                        runs: !layers.runs,
                      }))
                    }
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold ${
                      carrierFinderLayers.runs
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                        : "border-slate-700 text-slate-500"
                    }`}
                  >
                    <Network className="h-3 w-3" />
                    Runs {carrierFinderRunCount}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCarrierFinderLayers((layers) => ({
                        ...layers,
                        points: !layers.points,
                      }))
                    }
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-bold ${
                      carrierFinderLayers.points
                        ? "border-teal-400/40 bg-teal-500/15 text-teal-200"
                        : "border-slate-700 text-slate-500"
                    }`}
                  >
                    <Cable className="h-3 w-3" />
                    Points {carrierFinderPointCount}
                  </button>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>
                    {carrierFinderLoading
                      ? "Loading secure overlay…"
                      : carrierFinderCacheHit
                        ? "15-minute cache hit"
                        : carrierFinderGeojson
                          ? "Live CarrierFinder result"
                          : "No lookup made"}
                  </span>
                  {carrierFinderQuota && (
                    <span className="font-mono text-teal-300">
                      {carrierFinderQuota.used}/{carrierFinderQuota.limit} calls
                    </span>
                  )}
                </div>

                {carrierFinderError && (
                  <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-4 text-amber-200">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{carrierFinderError}</span>
                  </div>
                )}

                <p className="text-[9px] leading-4 text-slate-500">
                  Off by default. Credentials stay in Base44; cached views do not consume a new CarrierFinder API call.
                </p>
              </div>
            )}
          </div>

          {(error || mapError) && (
            <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error || mapError}</span>
            </div>
          )}

          {result && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Coverage" value={
                  result.coverage?.properties?.area_covered_sq_km != null
                    ? `${Number(result.coverage.properties.area_covered_sq_km).toFixed(1)} km²`
                    : "Mapped"
                } />
                <Metric label="FCC towers" value={result.towers?.length || 0} />
                <Metric label="Opportunities" value={opportunityCount} />
                <Metric label="Carrier" value={selectedCarrier?.label || carrier} />
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={handleTalonFit}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                >
                  Run TalonFit siting on this area
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? "Saving…" : "Save this RF view to SCIP"}
                </button>
              </div>
            </>
          )}

          {saveMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              {saveMessage}
            </div>
          )}

          <div className="border-t border-slate-800 pt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Legend</div>
            <Legend color="#22c55e" label="CloudRF coverage" />
            <Legend color="#f97316" label="Opportunity zone" />
            <Legend color="#a855f7" label="FCC / registered tower" dot />
            <Legend color="#06b6d4" label="Selected center" dot />
            {carrierFinderEnabled && (
              <>
                <Legend color="#22c55e" label="CarrierFinder active / on-net" />
                <Legend color="#f97316" label="CarrierFinder planned run" />
                <Legend color="#14b8a6" label="CarrierFinder network point" dot />
              </>
            )}
          </div>

          <p className="text-[10px] leading-4 text-slate-500">
            RF planning screen only. No parcel owner or APN data is shown. Field validation and carrier engineering review are still required.
          </p>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1 bg-slate-900">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ position: "absolute" }}
        />
        {!center && (
          <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-full border border-cyan-500/30 bg-slate-950/90 px-4 py-2 text-xs text-cyan-100 shadow-xl">
            Click anywhere on the map to choose a propagation center
          </div>
        )}
        {carrierFinderEnabled && carrierFinderLoading && !loading && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-teal-400/30 bg-slate-950/90 px-3 py-2 text-xs text-teal-200 shadow-xl">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading CarrierFinder overlay…
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/45 backdrop-blur-[1px]">
            <div className="rounded-xl border border-cyan-500/30 bg-slate-950/95 px-5 py-4 text-center shadow-2xl">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-cyan-400" />
              <div className="mt-2 text-sm font-bold">Running CloudRF + FCC analysis</div>
              <div className="mt-1 text-xs text-slate-400">This can take a moment.</div>
            </div>
          </div>
        )}
      </div>

      {upgradeModal && (
        <UpgradeModal
          open
          onClose={() => setUpgradeModal(null)}
          gate={upgradeModal.gate}
          message={upgradeModal.message}
          upgradeTo={upgradeModal.upgradeTo}
          currentTier={upgradeModal.currentTier}
        />
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}

function Legend({ color, label, dot = false }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-400">
      <span
        className={dot ? "h-2.5 w-2.5 rounded-full border border-white/60" : "h-2.5 w-5 rounded-sm"}
        style={{ background: color }}
      />
      {label}
    </div>
  );
}
