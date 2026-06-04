/**
 * SCIPOverlayMap - Target A proximity and environmental overlays.
 *
 * The SARF center is shown as context, but all overlay lookups run from
 * Target A once it exists. This keeps maps 1-4 tied to the selected parcel
 * instead of the first blank/default render.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import { nearestAirport } from "@/functions/nearestAirport";
import { pointElevation } from "@/functions/pointElevation";
import { Loader2, Droplets, Grid3x3, Wind, Plane, Mountain } from "lucide-react";

async function loadMapboxGL() {
  if (window.mapboxgl) return window.mapboxgl;

  await new Promise((resolve) => {
    if (document.querySelector('link[data-mapbox-gl-css]')) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.5.2/mapbox-gl.css";
    link.setAttribute("data-mapbox-gl-css", "true");
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  });

  await new Promise((resolve, reject) => {
    if (window.mapboxgl) return resolve();
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.5.2/mapbox-gl.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Mapbox GL JS"));
    document.head.appendChild(script);
  });

  return window.mapboxgl;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function windColor(mph) {
  if (!mph) return "#64748b";
  if (mph < 100) return "#10b981";
  if (mph < 120) return "#84cc16";
  if (mph < 140) return "#f59e0b";
  if (mph < 160) return "#ef4444";
  return "#7f1d1d";
}

function removeMarker(ref) {
  if (ref.current) {
    ref.current.remove();
    ref.current = null;
  }
}

function clearMarkers(ref) {
  ref.current.forEach((marker) => marker.remove());
  ref.current = [];
}

function addDotMarker(mapboxgl, map, lon, lat, label, color) {
  const element = document.createElement("div");
  element.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;";
  element.innerHTML = `
    <div style="height:18px;width:18px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);"></div>
    <div style="background:rgba(12,27,46,.92);color:#fff;border:1px solid rgba(255,255,255,.28);border-radius:6px;padding:3px 6px;font:bold 10px/1.2 ui-monospace,monospace;white-space:nowrap;">${label}</div>
  `;
  return new mapboxgl.Marker({ element, anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);
}

function addTowerMarker(mapboxgl, map, lon, lat) {
  const element = document.createElement("div");
  element.innerHTML = `
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px #00d4ff)">
      <path d="M12 2L8 7l4 -2 4 2z"/><path d="M12 5v17"/><path d="M5 22h14"/><path d="M7 12h10"/><path d="M6 17h12"/>
    </svg>
  `;
  return new mapboxgl.Marker({ element, anchor: "bottom" })
    .setLngLat([lon, lat])
    .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML("<strong>Target A - Tower</strong>"))
    .addTo(map);
}

export default function SCIPOverlayMap({ centerLat, centerLon, targetLat, targetLon }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const sarfMarkerRef = useRef(null);
  const targetMarkerRef = useRef(null);
  const parcelMarkersRef = useRef([]);
  const airportMarkerRef = useRef(null);
  const windMarkerRef = useRef(null);
  const elevationMarkersRef = useRef([]);
  const topoClickHandlerRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [layers, setLayers] = useState({ wetlands: false, parcels: false, wind: false, airport: false, topo: false });
  const [loading, setLoading] = useState({ parcels: false, wind: false, airport: false, topo: false });
  const [loaded, setLoaded] = useState({ parcels: false, wind: false, airport: false, topo: false });
  const [parcels, setParcels] = useState([]);
  const [wind, setWind] = useState(null);
  const [airport, setAirport] = useState(null);
  const [siteElevation, setSiteElevation] = useState(null);

  const sarfLat = numberOrNull(centerLat);
  const sarfLon = numberOrNull(centerLon);
  const targetLatNumber = numberOrNull(targetLat);
  const targetLonNumber = numberOrNull(targetLon);
  const analysisLat = targetLatNumber ?? sarfLat;
  const analysisLon = targetLonNumber ?? sarfLon;
  const hasAnalysisPoint = analysisLat != null && analysisLon != null;

  const clearAirportAssets = useCallback(() => {
    const map = mapRef.current;
    removeMarker(airportMarkerRef);
    if (!map) return;
    if (map.getLayer("airport-line-layer")) map.removeLayer("airport-line-layer");
    if (map.getSource("airport-line")) map.removeSource("airport-line");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const config = await loadPublicConfig();
        if (!config.mapboxAccessToken) throw new Error("Mapbox token missing");
        const mapboxgl = await loadMapboxGL();
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = config.mapboxAccessToken;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [analysisLon ?? -82.4572, analysisLat ?? 27.9506],
          zoom: 13.5,
          attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
        map.addControl(new mapboxgl.FullscreenControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;

          map.addSource("usgs-contours", {
            type: "raster",
            tiles: [
              "https://basemap.nationalmap.gov/arcgis/services/USGSTopo/MapServer/WmsServer?service=WMS&request=GetMap&layers=0&styles=&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512",
            ],
            tileSize: 512,
          });
          map.addLayer({
            id: "usgs-contours-layer",
            type: "raster",
            source: "usgs-contours",
            paint: { "raster-opacity": 0.65 },
            layout: { visibility: "none" },
          });

          map.addSource("nwi-wetlands", {
            type: "raster",
            tiles: [
              "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/services/Wetlands/MapServer/WmsServer?service=WMS&request=GetMap&layers=1&styles=&format=image/png&transparent=true&version=1.1.1&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512",
            ],
            tileSize: 512,
          });
          map.addLayer({
            id: "nwi-wetlands-layer",
            type: "raster",
            source: "nwi-wetlands",
            paint: { "raster-opacity": 0.72 },
            layout: { visibility: "none" },
          });

          setReady(true);
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Map init failed");
      }
    }

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // The map is initialized once. Later coordinate changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.mapboxgl) return;

    removeMarker(sarfMarkerRef);
    removeMarker(targetMarkerRef);

    if (sarfLat != null && sarfLon != null) {
      sarfMarkerRef.current = addDotMarker(window.mapboxgl, map, sarfLon, sarfLat, "SARF Center", "#dc2626");
    }

    if (hasAnalysisPoint) {
      targetMarkerRef.current = addTowerMarker(window.mapboxgl, map, analysisLon, analysisLat);
      map.resize();

      if (sarfLat != null && sarfLon != null && (sarfLat !== analysisLat || sarfLon !== analysisLon)) {
        const bounds = new window.mapboxgl.LngLatBounds()
          .extend([sarfLon, sarfLat])
          .extend([analysisLon, analysisLat]);
        map.fitBounds(bounds, { padding: 90, maxZoom: 15, duration: 500 });
      } else {
        map.flyTo({ center: [analysisLon, analysisLat], zoom: 14, duration: 500 });
      }
    }
  }, [analysisLat, analysisLon, hasAnalysisPoint, ready, sarfLat, sarfLon]);

  useEffect(() => {
    setParcels([]);
    setWind(null);
    setAirport(null);
    setSiteElevation(null);
    setLoaded({ parcels: false, wind: false, airport: false, topo: false });
    setError(null);
    clearMarkers(parcelMarkersRef);
    clearMarkers(elevationMarkersRef);
    removeMarker(windMarkerRef);
    clearAirportAssets();
  }, [analysisLat, analysisLon, clearAirportAssets]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer("nwi-wetlands-layer")) {
      map.setLayoutProperty("nwi-wetlands-layer", "visibility", layers.wetlands ? "visible" : "none");
    }
  }, [layers.wetlands, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.mapboxgl) return;

    if (map.getLayer("usgs-contours-layer")) {
      map.setLayoutProperty("usgs-contours-layer", "visibility", layers.topo ? "visible" : "none");
    }

    if (topoClickHandlerRef.current) {
      map.off("click", topoClickHandlerRef.current);
      topoClickHandlerRef.current = null;
    }

    if (!layers.topo || !hasAnalysisPoint) {
      clearMarkers(elevationMarkersRef);
      map.getCanvas().style.cursor = "";
      return;
    }

    map.getCanvas().style.cursor = "crosshair";

    if (!loaded.topo && !loading.topo) {
      setLoading((current) => ({ ...current, topo: true }));
      pointElevation({ lat: analysisLat, lon: analysisLon })
        .then((response) => {
          const data = response?.data || response;
          const feet = data?.elevation_ft;
          setSiteElevation(feet);

          const element = document.createElement("div");
          element.style.cssText =
            "background:#7c3aed;color:#fff;border:1.5px solid #fff;border-radius:4px;padding:2px 6px;font:bold 10px/1 ui-monospace,monospace;white-space:nowrap;transform:translate(-50%,-150%);box-shadow:0 2px 4px rgba(0,0,0,.5);";
          element.textContent = feet != null ? `${feet} ft AMSL` : "elev -";
          const marker = new window.mapboxgl.Marker({ element, anchor: "center" })
            .setLngLat([analysisLon, analysisLat])
            .addTo(map);
          elevationMarkersRef.current.push(marker);
        })
        .catch((err) => setError(`Topo: ${err.message}`))
        .finally(() => {
          setLoaded((current) => ({ ...current, topo: true }));
          setLoading((current) => ({ ...current, topo: false }));
        });
    }

    const handler = async (event) => {
      const { lng, lat } = event.lngLat;
      const element = document.createElement("div");
      element.style.cssText =
        "background:#7c3aed;color:#fff;border:1.5px solid #fff;border-radius:4px;padding:2px 6px;font:bold 10px/1 ui-monospace,monospace;white-space:nowrap;transform:translate(-50%,-150%);box-shadow:0 2px 4px rgba(0,0,0,.5);";
      element.textContent = "...";
      const marker = new window.mapboxgl.Marker({ element, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);
      elevationMarkersRef.current.push(marker);
      try {
        const response = await pointElevation({ lat, lon: lng });
        const feet = (response?.data || response)?.elevation_ft;
        element.textContent = feet != null ? `${feet} ft AMSL` : "no data";
      } catch {
        element.textContent = "error";
      }
    };

    map.on("click", handler);
    topoClickHandlerRef.current = handler;

    return () => {
      if (topoClickHandlerRef.current) {
        map.off("click", topoClickHandlerRef.current);
        topoClickHandlerRef.current = null;
      }
      map.getCanvas().style.cursor = "";
    };
  }, [analysisLat, analysisLon, hasAnalysisPoint, layers.topo, loaded.topo, loading.topo, ready]);

  const fetchParcels = useCallback(async () => {
    if (!hasAnalysisPoint) return;
    setLoading((current) => ({ ...current, parcels: true }));
    try {
      const response = await realieParcelsInRing({ lat: analysisLat, lon: analysisLon, radius_miles: 1.0 });
      const data = response?.data || response;
      setParcels(data?.parcels || []);
    } catch (err) {
      setError(`Parcels: ${err.message}`);
    } finally {
      setLoaded((current) => ({ ...current, parcels: true }));
      setLoading((current) => ({ ...current, parcels: false }));
    }
  }, [analysisLat, analysisLon, hasAnalysisPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.mapboxgl) return;

    clearMarkers(parcelMarkersRef);

    if (!layers.parcels || !hasAnalysisPoint) return;
    if (!loaded.parcels && !loading.parcels) {
      fetchParcels();
      return;
    }

    for (const parcel of parcels) {
      const lat = numberOrNull(parcel.latitude);
      const lon = numberOrNull(parcel.longitude);
      if (lat == null || lon == null) continue;

      const element = document.createElement("div");
      element.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;";
      element.innerHTML = `
        <div style="background:#fbbf24;color:#0a0e17;border:1.5px solid #92400e;border-radius:3px;padding:1px 4px;font:bold 9px/1.1 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.4);">
          ${(parcel.apn || "-").toString().slice(-12)}
        </div>
        <div style="width:8px;height:8px;border-radius:50%;background:#fbbf24;border:1.5px solid #fff;margin-top:-1px;"></div>
      `;
      const popup = new window.mapboxgl.Popup({ offset: 14 }).setHTML(
        `<div style="font-family:ui-monospace,monospace;font-size:11px">
           <div style="font-weight:bold;margin-bottom:2px">APN ${parcel.apn || "-"}</div>
           <div>${parcel.owner_name || ""}</div>
           <div style="opacity:.7">${parcel.parcel_address || ""}</div>
           ${parcel.acreage ? `<div style="margin-top:2px">${Number(parcel.acreage).toFixed(2)} ac</div>` : ""}
         </div>`,
      );
      const marker = new window.mapboxgl.Marker({ element, anchor: "bottom" })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map);
      parcelMarkersRef.current.push(marker);
    }
  }, [fetchParcels, hasAnalysisPoint, layers.parcels, loaded.parcels, loading.parcels, parcels, ready]);

  const fetchWind = useCallback(async () => {
    if (!hasAnalysisPoint) return;
    setLoading((current) => ({ ...current, wind: true }));
    try {
      const response = await windSpeedLookup({ lat: analysisLat, lon: analysisLon });
      setWind(response?.data || response);
    } catch (err) {
      setError(`Wind: ${err.message}`);
    } finally {
      setLoaded((current) => ({ ...current, wind: true }));
      setLoading((current) => ({ ...current, wind: false }));
    }
  }, [analysisLat, analysisLon, hasAnalysisPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.mapboxgl) return;

    removeMarker(windMarkerRef);

    if (!layers.wind || !hasAnalysisPoint) return;
    if (!loaded.wind && !loading.wind) {
      fetchWind();
      return;
    }
    if (!wind) return;

    const mph = wind.wind_speed_mph;
    const color = windColor(mph);
    const bearing = wind.in_hurricane_prone_region ? 135 : 90;
    const element = document.createElement("div");
    element.style.cssText =
      "transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));";
    element.innerHTML = `
      <div style="background:${color};color:#fff;border-radius:999px;padding:4px 10px;font:bold 11px/1 ui-monospace,monospace;text-align:center;border:2px solid #fff;">
        ${mph ? `${mph} MPH` : "WIND"}
      </div>
      <div style="display:flex;justify-content:center;margin-top:4px;">
        <svg width="44" height="44" viewBox="0 0 24 24" style="transform:rotate(${bearing}deg);">
          <path d="M12 2 L17 13 L12 10 L7 13 Z" fill="${color}" stroke="#fff" stroke-width="1.2"/>
        </svg>
      </div>
    `;
    windMarkerRef.current = new window.mapboxgl.Marker({ element, anchor: "center" })
      .setLngLat([analysisLon, analysisLat])
      .setPopup(
        new window.mapboxgl.Popup({ offset: 14 }).setHTML(
          `<div style="font-family:ui-monospace,monospace;font-size:11px">
             <div style="font-weight:bold;color:${color}">${mph || "-"} MPH - ${(wind.wind_risk_level || "").toUpperCase()}</div>
             <div>${wind.wind_mri || ""}</div>
             <div style="opacity:.7;margin-top:2px">${wind.in_hurricane_prone_region ? "Hurricane Prone Region" : "Standard wind region"}</div>
           </div>`,
        ),
      )
      .addTo(map);
  }, [analysisLat, analysisLon, fetchWind, hasAnalysisPoint, layers.wind, loaded.wind, loading.wind, ready, wind]);

  const fetchAirport = useCallback(async () => {
    if (!hasAnalysisPoint) return;
    setLoading((current) => ({ ...current, airport: true }));
    try {
      const response = await nearestAirport({ lat: analysisLat, lon: analysisLon, radius_miles: 60 });
      const data = response?.data || response;
      setAirport(data?.lat != null || data?.latitude_deg != null ? data : null);
    } catch (err) {
      setError(`Airport: ${err.message}`);
    } finally {
      setLoaded((current) => ({ ...current, airport: true }));
      setLoading((current) => ({ ...current, airport: false }));
    }
  }, [analysisLat, analysisLon, hasAnalysisPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.mapboxgl) return;

    clearAirportAssets();

    if (!layers.airport || !hasAnalysisPoint) return;
    if (!loaded.airport && !loading.airport) {
      fetchAirport();
      return;
    }
    if (!airport) return;

    const airportLat = numberOrNull(airport.lat ?? airport.latitude_deg);
    const airportLon = numberOrNull(airport.lon ?? airport.longitude_deg);
    if (airportLat == null || airportLon == null) return;

    const dMiles = haversineMiles(analysisLat, analysisLon, airportLat, airportLon);
    const dFeet = Math.round(dMiles * 5280);

    map.addSource("airport-line", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [analysisLon, analysisLat],
            [airportLon, airportLat],
          ],
        },
      },
    });
    map.addLayer({
      id: "airport-line-layer",
      type: "line",
      source: "airport-line",
      paint: {
        "line-color": "#facc15",
        "line-width": 2.5,
        "line-opacity": 0.85,
        "line-dasharray": [2, 1.5],
      },
    });

    const element = document.createElement("div");
    element.style.cssText =
      "transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));";
    element.innerHTML = `
      <div style="background:#0C1B2E;color:#facc15;border:1.5px solid #facc15;border-radius:6px;padding:3px 7px;text-align:center;font-family:ui-monospace,monospace;line-height:1.1;">
        <div style="font-size:11px;font-weight:bold;">${airport.iata || airport.icao || airport.airport_callnumber || "AIRPORT"}</div>
        <div style="font-size:8.5px;opacity:.85;margin-top:1px">${airportLat.toFixed(4)}, ${airportLon.toFixed(4)}</div>
      </div>
    `;
    airportMarkerRef.current = new window.mapboxgl.Marker({ element, anchor: "bottom" })
      .setLngLat([airportLon, airportLat])
      .setPopup(
        new window.mapboxgl.Popup({ offset: 16 }).setHTML(
          `<div style="font-family:ui-monospace,monospace;font-size:11px">
             <div style="font-weight:bold">${airport.name || airport.airport_callnumber || "Airport"}</div>
             <div>${[airport.city, airport.state].filter(Boolean).join(", ")}</div>
             <div style="margin-top:3px;color:#b45309">${dMiles.toFixed(2)} mi - ${dFeet.toLocaleString()} ft (crow flies)</div>
           </div>`,
        ),
      )
      .addTo(map);

    const bounds = new window.mapboxgl.LngLatBounds()
      .extend([analysisLon, analysisLat])
      .extend([airportLon, airportLat]);
    map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 });
  }, [
    airport,
    analysisLat,
    analysisLon,
    clearAirportAssets,
    fetchAirport,
    hasAnalysisPoint,
    layers.airport,
    loaded.airport,
    loading.airport,
    ready,
  ]);

  function TogglePill({ k, label, icon: Icon, activeColor }) {
    const on = layers[k];
    const isLoading = loading[k];
    return (
      <button
        type="button"
        onClick={() => setLayers((current) => ({ ...current, [k]: !current[k] }))}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider border transition-colors ${
          on ? "text-white" : "bg-card"
        }`}
        style={{
          backgroundColor: on ? activeColor : undefined,
          borderColor: on ? activeColor : "#cbd5e1",
          color: on ? "#fff" : activeColor,
        }}
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
        {label} {on ? "ON" : "OFF"}
      </button>
    );
  }

  const windCaption = wind && layers.wind
    ? `${wind.wind_speed_mph || "-"} mph - ${(wind.wind_risk_level || "").toUpperCase()}`
    : null;

  const airportCaption = airport && layers.airport
    ? (() => {
        const airportLat = numberOrNull(airport.lat ?? airport.latitude_deg);
        const airportLon = numberOrNull(airport.lon ?? airport.longitude_deg);
        if (airportLat == null || airportLon == null || !hasAnalysisPoint) return null;
        const distance = haversineMiles(analysisLat, analysisLon, airportLat, airportLon);
        return `${airport.iata || airport.icao || airport.airport_callnumber || "?"} - ${distance.toFixed(2)} mi (${Math.round(distance * 5280).toLocaleString()} ft)`;
      })()
    : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          <TogglePill k="wetlands" label="WETLANDS" icon={Droplets} activeColor="#0891b2" />
          <TogglePill k="parcels" label="PARCELS" icon={Grid3x3} activeColor="#d97706" />
          <TogglePill k="wind" label="WIND" icon={Wind} activeColor={windColor(wind?.wind_speed_mph)} />
          <TogglePill k="airport" label="AIRPORT" icon={Plane} activeColor="#facc15" />
          <TogglePill k="topo" label="TOPO" icon={Mountain} activeColor="#7c3aed" />
        </div>
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
          Target A overlays: USFWS / Realie / ASCE 7-22 / FAA / USGS
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: 560 }} />

      <div className="px-3 py-2 border-t border-border text-[11px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        {layers.parcels && <span>{parcels.length} parcels near Target A</span>}
        {windCaption && <span style={{ color: windColor(wind?.wind_speed_mph) }}>{windCaption}</span>}
        {airportCaption && <span className="text-yellow-700">{airportCaption}</span>}
        {layers.wetlands && <span className="text-cyan-700">USFWS NWI overlay active</span>}
        {layers.topo && (
          <span className="text-purple-700">
            {siteElevation != null ? `Target A ${siteElevation} ft AMSL - ` : ""}click map to probe elevation
          </span>
        )}
        {!hasAnalysisPoint && <span>Generate Hawk Vision Targets first so this map can use Target A.</span>}
        {hasAnalysisPoint && !layers.wetlands && !layers.parcels && !layers.wind && !layers.airport && !layers.topo && (
          <span>Toggle a Target A layer above to begin</span>
        )}
      </div>
    </div>
  );
}
