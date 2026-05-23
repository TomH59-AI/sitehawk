/**
 * SCIPOverlayMap — single Mapbox GL JS satellite map with 4 toggle overlays:
 *
 *   💧 WETLANDS  · USFWS NWI raster tile overlay (real water polygons)
 *   📐 PARCELS   · Realie parcel pins with APN labels
 *   💨 WIND      · ASCE 7-22 wind speed gauge + directional compass arrow
 *                  (color scale: green = calm → red = gusty)
 *   ✈️  AIRPORT  · plane icon at nearest FAA airport with IATA, coords,
 *                  and crow-flies distance line (miles + feet)
 *
 * The center waypoint pulse + Target A tower icon are always shown.
 * Each toggle pill turns its layer on/off without re-rendering the map.
 */

import { useEffect, useRef, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import { wetlandsLookup } from "@/functions/wetlandsLookup";
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
    const s = document.createElement("script");
    s.src = "https://api.mapbox.com/mapbox-gl-js/v3.5.2/mapbox-gl.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load Mapbox GL JS"));
    document.head.appendChild(s);
  });
  return window.mapboxgl;
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Green→amber→red wind color (matches ASCE wind risk: 90→160 mph)
function windColor(mph) {
  if (!mph) return "#64748b";
  if (mph < 100) return "#10b981"; // green
  if (mph < 120) return "#84cc16"; // lime
  if (mph < 140) return "#f59e0b"; // amber
  if (mph < 160) return "#ef4444"; // red
  return "#7f1d1d"; // dark red
}

export default function SCIPOverlayMap({ centerLat, centerLon, targetLat, targetLon }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // Toggle state
  const [layers, setLayers] = useState({ wetlands: false, parcels: false, wind: false, airport: false, topo: false });

  // Per-layer loading + data
  const [loading, setLoading] = useState({ wetlands: false, parcels: false, wind: false, airport: false, topo: false });
  const [parcels, setParcels] = useState([]);
  const [wind, setWind] = useState(null);
  const [airport, setAirport] = useState(null);
  const [siteElevation, setSiteElevation] = useState(null);

  // Marker refs (so we can hide/show without re-fetching)
  const parcelMarkersRef = useRef([]);
  const airportMarkerRef = useRef(null);
  const windMarkerRef = useRef(null);
  const elevationMarkersRef = useRef([]);
  const topoClickHandlerRef = useRef(null);

  // ---------- Init the map once ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await loadPublicConfig();
        const token = cfg.mapboxAccessToken;
        if (!token) throw new Error("Mapbox token missing");
        const mapboxgl = await loadMapboxGL();
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = token;

        const lat = parseFloat(targetLat || centerLat);
        const lon = parseFloat(targetLon || centerLon);

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [isFinite(lon) ? lon : -82.4572, isFinite(lat) ? lat : 27.9506],
          zoom: 13.5,
          attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
        map.addControl(new mapboxgl.FullscreenControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;

          // SARF center waypoint (red pulse)
          if (isFinite(parseFloat(centerLat)) && isFinite(parseFloat(centerLon))) {
            const el = document.createElement("div");
            el.style.cssText =
              "width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 0 0 4px rgba(220,38,38,0.35);";
            new mapboxgl.Marker(el)
              .setLngLat([parseFloat(centerLon), parseFloat(centerLat)])
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML("<strong>SARF Center</strong>"))
              .addTo(map);
          }

          // Target A tower icon (cyan)
          if (isFinite(parseFloat(targetLat)) && isFinite(parseFloat(targetLon))) {
            const el = document.createElement("div");
            el.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 4px #00d4ff)"><path d="M12 2L8 7l4 -2 4 2z"/><path d="M12 5v17"/><path d="M5 22h14"/><path d="M7 12h10"/><path d="M6 17h12"/></svg>`;
            new mapboxgl.Marker({ element: el, anchor: "bottom" })
              .setLngLat([parseFloat(targetLon), parseFloat(targetLat)])
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setHTML("<strong>Target A · Tower</strong>"))
              .addTo(map);
          }

          // Pre-register USGS topo contours raster (3DEP via The National Map WMS)
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

          // Pre-register empty Wetlands raster source/layer so toggle just flips visibility
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
      } catch (e) {
        if (!cancelled) setError(e.message || "Map init failed");
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Wetlands toggle (just flips visibility, no fetch) ----------
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    if (m.getLayer("nwi-wetlands-layer")) {
      m.setLayoutProperty("nwi-wetlands-layer", "visibility", layers.wetlands ? "visible" : "none");
    }
  }, [layers.wetlands, ready]);

  // ---------- Topo toggle: USGS contours + site AMSL probe + click-to-probe ----------
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !window.mapboxgl) return;

    // Flip contour raster visibility
    if (m.getLayer("usgs-contours-layer")) {
      m.setLayoutProperty("usgs-contours-layer", "visibility", layers.topo ? "visible" : "none");
    }

    // Detach old click handler if any
    if (topoClickHandlerRef.current) {
      m.off("click", topoClickHandlerRef.current);
      topoClickHandlerRef.current = null;
    }

    if (!layers.topo) {
      // Clean up probe markers
      elevationMarkersRef.current.forEach((mk) => mk.remove());
      elevationMarkersRef.current = [];
      m.getCanvas().style.cursor = "";
      return;
    }

    m.getCanvas().style.cursor = "crosshair";

    // Auto-probe the site center once
    if (siteElevation == null && !loading.topo) {
      const lat = parseFloat(centerLat);
      const lon = parseFloat(centerLon);
      if (isFinite(lat) && isFinite(lon)) {
        setLoading((p) => ({ ...p, topo: true }));
        pointElevation({ lat, lon })
          .then((res) => {
            const data = res?.data || res;
            const ft = data?.elevation_ft;
            setSiteElevation(ft);
            // Drop a labeled marker at the site
            const el = document.createElement("div");
            el.style.cssText =
              "background:#7c3aed;color:#fff;border:1.5px solid #fff;border-radius:4px;padding:2px 6px;font:bold 10px/1 ui-monospace,monospace;white-space:nowrap;transform:translate(-50%,-150%);box-shadow:0 2px 4px rgba(0,0,0,.5);";
            el.textContent = ft != null ? `${ft} ft AMSL` : "elev —";
            const mk = new window.mapboxgl.Marker({ element: el, anchor: "center" })
              .setLngLat([lon, lat])
              .addTo(m);
            elevationMarkersRef.current.push(mk);
          })
          .finally(() => setLoading((p) => ({ ...p, topo: false })));
      }
    }

    // Click-to-probe handler
    const handler = async (e) => {
      const { lng, lat } = e.lngLat;
      const el = document.createElement("div");
      el.style.cssText =
        "background:#7c3aed;color:#fff;border:1.5px solid #fff;border-radius:4px;padding:2px 6px;font:bold 10px/1 ui-monospace,monospace;white-space:nowrap;transform:translate(-50%,-150%);box-shadow:0 2px 4px rgba(0,0,0,.5);";
      el.textContent = "…";
      const mk = new window.mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(m);
      elevationMarkersRef.current.push(mk);
      try {
        const res = await pointElevation({ lat, lon: lng });
        const ft = (res?.data || res)?.elevation_ft;
        el.textContent = ft != null ? `${ft} ft AMSL` : "no data";
      } catch {
        el.textContent = "error";
      }
    };
    m.on("click", handler);
    topoClickHandlerRef.current = handler;

    return () => {
      if (topoClickHandlerRef.current) {
        m.off("click", topoClickHandlerRef.current);
        topoClickHandlerRef.current = null;
      }
      m.getCanvas().style.cursor = "";
    };
  }, [layers.topo, ready, centerLat, centerLon, siteElevation, loading.topo]);

  // ---------- Parcels: fetch on first toggle-on, then show/hide markers ----------
  async function fetchParcels() {
    const lat = parseFloat(centerLat);
    const lon = parseFloat(centerLon);
    if (!isFinite(lat) || !isFinite(lon)) return;
    setLoading((p) => ({ ...p, parcels: true }));
    try {
      const res = await realieParcelsInRing({ lat, lon, radius_miles: 1.0 });
      const data = res?.data || res;
      setParcels(data?.parcels || []);
    } catch (e) {
      setError(`Parcels: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, parcels: false }));
    }
  }

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !window.mapboxgl) return;

    // Hide existing parcel markers
    parcelMarkersRef.current.forEach((mk) => mk.remove());
    parcelMarkersRef.current = [];

    if (!layers.parcels) return;
    if (parcels.length === 0) {
      fetchParcels();
      return;
    }

    for (const p of parcels) {
      if (p.latitude == null || p.longitude == null) continue;
      const el = document.createElement("div");
      el.style.cssText =
        "display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;";
      el.innerHTML = `
        <div style="background:#fbbf24;color:#0a0e17;border:1.5px solid #92400e;border-radius:3px;padding:1px 4px;font:bold 9px/1.1 ui-monospace,monospace;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,.4);">
          ${(p.apn || "—").toString().slice(-12)}
        </div>
        <div style="width:8px;height:8px;border-radius:50%;background:#fbbf24;border:1.5px solid #fff;margin-top:-1px;"></div>
      `;
      const popup = new window.mapboxgl.Popup({ offset: 14 }).setHTML(
        `<div style="font-family:ui-monospace,monospace;font-size:11px">
           <div style="font-weight:bold;margin-bottom:2px">APN ${p.apn || "—"}</div>
           <div>${p.owner_name || ""}</div>
           <div style="opacity:.7">${p.parcel_address || ""}</div>
           ${p.acreage ? `<div style="margin-top:2px">${Number(p.acreage).toFixed(2)} ac</div>` : ""}
         </div>`
      );
      const mk = new window.mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([Number(p.longitude), Number(p.latitude)])
        .setPopup(popup)
        .addTo(m);
      parcelMarkersRef.current.push(mk);
    }
  }, [layers.parcels, parcels, ready]);

  // ---------- Wind: fetch on first toggle-on, then show/hide overlay ----------
  async function fetchWind() {
    const lat = parseFloat(centerLat);
    const lon = parseFloat(centerLon);
    if (!isFinite(lat) || !isFinite(lon)) return;
    setLoading((p) => ({ ...p, wind: true }));
    try {
      const res = await windSpeedLookup({ lat, lon });
      const data = res?.data || res;
      setWind(data);
    } catch (e) {
      setError(`Wind: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, wind: false }));
    }
  }

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !window.mapboxgl) return;

    if (windMarkerRef.current) {
      windMarkerRef.current.remove();
      windMarkerRef.current = null;
    }
    if (!layers.wind) return;
    if (!wind) {
      fetchWind();
      return;
    }

    const mph = wind.wind_speed_mph;
    const color = windColor(mph);
    // FL coastal storm wind direction is typically out of the E/SE; default arrow points SE (135°)
    // ASCE 7-22 doesn't model an instantaneous direction — we visualize design wind via compass arrow.
    const bearing = wind.in_hurricane_prone_region ? 135 : 90;

    const el = document.createElement("div");
    el.style.cssText =
      "transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5));";
    el.innerHTML = `
      <div style="background:${color};color:#fff;border-radius:999px;padding:4px 10px;font:bold 11px/1 ui-monospace,monospace;text-align:center;border:2px solid #fff;">
        ${mph ? `${mph} MPH` : "WIND"}
      </div>
      <div style="display:flex;justify-content:center;margin-top:4px;">
        <svg width="44" height="44" viewBox="0 0 24 24" style="transform:rotate(${bearing}deg);">
          <path d="M12 2 L17 13 L12 10 L7 13 Z" fill="${color}" stroke="#fff" stroke-width="1.2"/>
        </svg>
      </div>
    `;
    const popup = new window.mapboxgl.Popup({ offset: 14 }).setHTML(
      `<div style="font-family:ui-monospace,monospace;font-size:11px">
         <div style="font-weight:bold;color:${color}">${mph || "—"} MPH · ${(wind.wind_risk_level || "").toUpperCase()}</div>
         <div>${wind.wind_mri || ""}</div>
         <div style="opacity:.7;margin-top:2px">
           ${wind.in_hurricane_prone_region ? "Hurricane Prone Region" : "Standard wind region"}
         </div>
       </div>`
    );
    windMarkerRef.current = new window.mapboxgl.Marker({ element: el, anchor: "center" })
      .setLngLat([parseFloat(centerLon), parseFloat(centerLat)])
      .setPopup(popup)
      .addTo(m);
  }, [layers.wind, wind, ready, centerLat, centerLon]);

  // ---------- Airport: fetch on first toggle-on, then show/hide plane + line ----------
  async function fetchAirport() {
    const lat = parseFloat(centerLat);
    const lon = parseFloat(centerLon);
    if (!isFinite(lat) || !isFinite(lon)) return;
    setLoading((p) => ({ ...p, airport: true }));
    try {
      const res = await nearestAirport({ lat, lon, radius_miles: 60 });
      const data = res?.data || res;
      if (data && data.lat != null) setAirport(data);
    } catch (e) {
      setError(`Airport: ${e.message}`);
    } finally {
      setLoading((p) => ({ ...p, airport: false }));
    }
  }

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready || !window.mapboxgl) return;

    // Remove prior airport assets
    if (airportMarkerRef.current) {
      airportMarkerRef.current.remove();
      airportMarkerRef.current = null;
    }
    if (m.getLayer("airport-line-layer")) m.removeLayer("airport-line-layer");
    if (m.getSource("airport-line")) m.removeSource("airport-line");

    if (!layers.airport) return;
    if (!airport) {
      fetchAirport();
      return;
    }

    const centerLatN = parseFloat(centerLat);
    const centerLonN = parseFloat(centerLon);
    const dMiles = haversineMiles(centerLatN, centerLonN, airport.lat, airport.lon);
    const dFeet = Math.round(dMiles * 5280);

    // Crow-flies line: dashed yellow
    m.addSource("airport-line", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [centerLonN, centerLatN],
            [airport.lon, airport.lat],
          ],
        },
      },
    });
    m.addLayer({
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

    // Plane icon marker
    const el = document.createElement("div");
    el.style.cssText =
      "transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));";
    el.innerHTML = `
      <div style="background:#0C1B2E;color:#facc15;border:1.5px solid #facc15;border-radius:6px;padding:3px 7px;text-align:center;font-family:ui-monospace,monospace;line-height:1.1;">
        <div style="display:flex;align-items:center;gap:4px;justify-content:center;font-size:11px;font-weight:bold;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="0.5">
            <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
          ${airport.iata || airport.icao || "AIRPORT"}
        </div>
        <div style="font-size:8.5px;opacity:.85;margin-top:1px">${airport.lat.toFixed(4)}, ${airport.lon.toFixed(4)}</div>
      </div>
    `;
    const popup = new window.mapboxgl.Popup({ offset: 16 }).setHTML(
      `<div style="font-family:ui-monospace,monospace;font-size:11px">
         <div style="font-weight:bold">${airport.name || "Airport"}</div>
         <div>${[airport.city, airport.state].filter(Boolean).join(", ")}</div>
         <div style="margin-top:3px;color:#b45309">
           ${dMiles.toFixed(2)} mi · ${dFeet.toLocaleString()} ft (crow flies)
         </div>
       </div>`
    );
    airportMarkerRef.current = new window.mapboxgl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([airport.lon, airport.lat])
      .setPopup(popup)
      .addTo(m);

    // Fit bounds so both the site and airport are visible
    const bounds = new window.mapboxgl.LngLatBounds()
      .extend([centerLonN, centerLatN])
      .extend([airport.lon, airport.lat]);
    m.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 800 });
  }, [layers.airport, airport, ready, centerLat, centerLon]);

  // ---------- Toggle pill ----------
  function TogglePill({ k, label, icon: Icon, activeColor }) {
    const on = layers[k];
    const isLoading = loading[k];
    return (
      <button
        onClick={() => setLayers((p) => ({ ...p, [k]: !p[k] }))}
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

  // Wind summary text (when wind layer on)
  const windCaption = wind && layers.wind
    ? `${wind.wind_speed_mph || "—"} mph · ${(wind.wind_risk_level || "").toUpperCase()}`
    : null;

  // Airport summary text (when airport layer on)
  const airportCaption = airport && layers.airport
    ? (() => {
        const d = haversineMiles(parseFloat(centerLat), parseFloat(centerLon), airport.lat, airport.lon);
        return `${airport.iata || airport.icao || "?"} · ${d.toFixed(2)} mi (${Math.round(d * 5280).toLocaleString()} ft)`;
      })()
    : null;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          <TogglePill k="wetlands" label="WETLANDS" icon={Droplets} activeColor="#0891b2" />
          <TogglePill k="parcels"  label="PARCELS"  icon={Grid3x3} activeColor="#d97706" />
          <TogglePill k="wind"     label="WIND"     icon={Wind} activeColor={windColor(wind?.wind_speed_mph)} />
          <TogglePill k="airport"  label="AIRPORT"  icon={Plane} activeColor="#facc15" />
          <TogglePill k="topo"     label="TOPO"     icon={Mountain} activeColor="#7c3aed" />
        </div>
        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
          USFWS · Realie · ASCE 7-22 · FAA · USGS 3DEP
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: 560 }} />

      {/* Bottom status bar */}
      <div className="px-3 py-2 border-t border-border text-[11px] font-mono text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        {layers.parcels && <span>📐 {parcels.length} parcels</span>}
        {windCaption && <span style={{ color: windColor(wind?.wind_speed_mph) }}>💨 {windCaption}</span>}
        {airportCaption && <span className="text-yellow-700">✈ {airportCaption}</span>}
        {layers.wetlands && <span className="text-cyan-700">💧 USFWS NWI overlay active</span>}
        {layers.topo && (
          <span className="text-purple-700">
            ⛰ {siteElevation != null ? `Site ${siteElevation} ft AMSL · ` : ""}click map to probe elevation
          </span>
        )}
        {!layers.wetlands && !layers.parcels && !layers.wind && !layers.airport && !layers.topo && (
          <span>Toggle a layer above to begin</span>
        )}
      </div>
    </div>
  );
}