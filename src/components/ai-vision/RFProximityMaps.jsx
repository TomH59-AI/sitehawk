import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Plane, RadioTower } from "lucide-react";
import { loadPublicConfig } from "@/lib/publicConfig";

const METERS_PER_MILE = 1609.344;

async function loadMapboxGL() {
  if (window.mapboxgl) return window.mapboxgl;

  await new Promise((resolve) => {
    if (document.querySelector("link[data-mapbox-gl-css]")) return resolve();
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

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coord(record, names) {
  for (const name of names) {
    const value = asNumber(record?.[name]);
    if (value != null) return value;
  }
  return null;
}

function firstValue(record, names) {
  for (const name of names) {
    const value = record?.[name];
    if (value != null && value !== "") return value;
  }
  return null;
}

function imageUrl(value) {
  if (typeof value === "string" && value) return value;
  if (!value || typeof value !== "object") return null;
  return value.url || value.image_url || value.map_url || value.href || null;
}

function buildCircle(center, radiusMiles, points = 64) {
  const [lon, lat] = center;
  const radiusMeters = radiusMiles * METERS_PER_MILE;
  const coords = [];
  const dx = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusMeters / 110540;

  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lon + dx * Math.cos(theta), lat + dy * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } };
}

function markerElement(label, color) {
  const element = document.createElement("div");
  element.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto;";

  const dot = document.createElement("div");
  dot.style.cssText = `height:20px;width:20px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.45);`;

  const text = document.createElement("div");
  text.textContent = String(label || "");
  text.style.cssText =
    "max-width:150px;background:rgba(12,27,46,.92);color:white;border:1px solid rgba(255,255,255,.28);border-radius:6px;padding:3px 6px;font:bold 10px/1.2 ui-monospace,monospace;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

  element.append(dot, text);
  return element;
}

function sectionData(result) {
  const sections = [];
  const overlays = result?.map_overlays || {};
  const airport =
    result?.airport ||
    result?.nearest_airport ||
    result?.faa_airport ||
    result?.target_a_airport ||
    null;
  const tower =
    result?.tower ||
    result?.cell_tower ||
    result?.nearest_tower ||
    result?.fcc_tower ||
    result?.target_a_cell_tower ||
    null;

  if (airport) {
    const lat = coord(airport, ["latitude_deg", "lat", "latitude", "airport_lat", "airport_latitude"]);
    const lon = coord(airport, ["longitude_deg", "lon", "lng", "longitude", "airport_lon", "airport_lng", "airport_longitude"]);
    if (lat != null && lon != null) {
      sections.push({
        id: "airport",
        title: "Nearest Airport",
        icon: Plane,
        color: "#facc15",
        label: firstValue(airport, ["call_letters", "airport_callnumber", "iata", "icao", "name"]) || "Airport",
        detail: firstValue(airport, ["name", "airport_type", "type"]) || "Airport proximity",
        distance: asNumber(airport.distance_miles),
        remoteLat: lat,
        remoteLon: lon,
        lineGeoJSON: airport.line_geojson || airport.airport_line,
      });
    }
  }

  if (tower) {
    const lat = coord(tower, ["latitude_deg", "lat", "latitude", "tower_lat", "tower_latitude"]);
    const lon = coord(tower, ["longitude_deg", "lon", "lng", "longitude", "tower_lon", "tower_lng", "tower_longitude"]);
    if (lat != null && lon != null) {
      sections.push({
        id: "cell_tower",
        title: "Nearest Cell Tower",
        icon: RadioTower,
        color: "#22d3ee",
        label: firstValue(tower, ["call_letters", "callsign", "tower_id", "registration_number", "structure_number"]) || "Cell Tower",
        detail: firstValue(tower, ["licensee", "owner_name", "structure_type", "type"]) || "Cell tower proximity",
        distance: asNumber(tower.distance_miles),
        remoteLat: lat,
        remoteLon: lon,
        lineGeoJSON: tower.line_geojson || tower.tower_line,
      });
    }
  }

  const airportImage = imageUrl(result?.airport_map) || imageUrl(overlays.target_a_airport);
  if (!sections.some((section) => section.id === "airport") && airportImage) {
    sections.push({
      id: "airport",
      title: "Nearest Airport",
      icon: Plane,
      color: "#facc15",
      detail: "Returned airport map image",
      imageUrl: airportImage,
    });
  }

  const towerImage = imageUrl(result?.cell_tower_map) || imageUrl(overlays.target_a_cell_tower);
  if (!sections.some((section) => section.id === "cell_tower") && towerImage) {
    sections.push({
      id: "cell_tower",
      title: "Nearest Cell Tower",
      icon: RadioTower,
      color: "#22d3ee",
      detail: "Returned cell tower map image",
      imageUrl: towerImage,
    });
  }

  return sections;
}

function ImageProximityMap({ section }) {
  const Icon = section.icon;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: section.color }} />
          <div>
            <div className="font-heading text-sm font-bold text-foreground">{section.title}</div>
            <div className="text-xs text-muted-foreground">{section.detail}</div>
          </div>
        </div>
      </div>
      <img src={section.imageUrl} alt={section.title} crossOrigin="anonymous" className="h-auto w-full bg-muted/20" />
    </div>
  );
}

function ProximityMap({ section, site, radiusMiles }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const siteLat = asNumber(site?.lat);
      const siteLon = asNumber(site?.lon);
      if (siteLat == null || siteLon == null || !containerRef.current) return;

      try {
        const config = await loadPublicConfig();
        if (!config.mapboxAccessToken) throw new Error("Mapbox token missing");
        const mapboxgl = await loadMapboxGL();
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = config.mapboxAccessToken;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: [siteLon, siteLat],
          zoom: 13,
          attributionControl: false,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;

          map.addSource("radius", { type: "geojson", data: buildCircle([siteLon, siteLat], radiusMiles) });
          map.addLayer({
            id: "radius-fill",
            type: "fill",
            source: "radius",
            paint: { "fill-color": "#2563eb", "fill-opacity": 0.08 },
          });
          map.addLayer({
            id: "radius-outline",
            type: "line",
            source: "radius",
            paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [4, 2] },
          });

          const line = section.lineGeoJSON
            ? section.lineGeoJSON.type === "Feature"
              ? section.lineGeoJSON
              : { type: "Feature", properties: {}, geometry: section.lineGeoJSON.geometry || section.lineGeoJSON }
            : {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [[siteLon, siteLat], [section.remoteLon, section.remoteLat]],
            },
          };
          map.addSource("distance-line", { type: "geojson", data: line });
          map.addLayer({
            id: "distance-line-layer",
            type: "line",
            source: "distance-line",
            paint: { "line-color": section.color, "line-width": 3, "line-opacity": 0.9, "line-dasharray": [2, 1.2] },
          });

          new mapboxgl.Marker({ element: markerElement("Target A", "#dc2626"), anchor: "bottom" })
            .setLngLat([siteLon, siteLat])
            .addTo(map);
          new mapboxgl.Marker({ element: markerElement(section.label, section.color), anchor: "bottom" })
            .setLngLat([section.remoteLon, section.remoteLat])
            .addTo(map);

          const bounds = new mapboxgl.LngLatBounds()
            .extend([siteLon, siteLat])
            .extend([section.remoteLon, section.remoteLat]);
          map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 0 });
        });
      } catch (err) {
        if (!cancelled) setError(err.message || "Map failed to load");
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
  }, [radiusMiles, section, site]);

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <p className="text-sm font-semibold text-destructive">{error}</p>
      </div>
    );
  }

  const Icon = section.icon;

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" style={{ color: section.color }} />
          <div>
            <div className="font-heading text-sm font-bold text-foreground">{section.title}</div>
            <div className="text-xs text-muted-foreground">{section.detail}</div>
          </div>
        </div>
        {section.distance != null && (
          <div className="font-mono text-xs font-bold text-foreground">{section.distance.toFixed(2)} mi</div>
        )}
      </div>
      <div ref={containerRef} className="h-[360px] w-full bg-muted/20" />
    </div>
  );
}

export default function RFProximityMaps({ site, result, rfRadiusMiles = 2 }) {
  const sections = useMemo(() => sectionData(result), [result]);

  if (!sections.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
        No proximity map data was returned for this section.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        section.imageUrl
          ? <ImageProximityMap key={section.id} section={section} />
          : <ProximityMap key={section.id} section={section} site={site} radiusMiles={rfRadiusMiles} />
      ))}
    </div>
  );
}
