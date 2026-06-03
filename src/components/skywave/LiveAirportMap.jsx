import { useEffect, useRef, useState } from "react";
import { Plane, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ensureMapboxLoaded } from "@/lib/section6Proximity";
import { loadPublicConfig } from "@/lib/publicConfig";
import { SKYWAVE } from "@/lib/skywave";

// Live US Airport map — connects a Mapbox GL geojson source DIRECTLY to the FAA
// ArcGIS REST Feature API. No data is downloaded, stored, or cached locally.
// Centered on the selected Target A waypoint, draws the user's radius ring and a
// crow-flies line + imperial distance label to the nearest airport so the user
// can judge whether an FAA (Form 7460-1) determination is likely required.
const FAA_AIRPORTS_GEOJSON =
  "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/US_Airport/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultType=tile";

// Haversine distance in miles
function distMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ringFeature(lat, lon, radiusMi, steps = 96) {
  const coords = [];
  const latR = radiusMi / 69.0;
  const lonR = radiusMi / (69.0 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lon + lonR * Math.cos(t), lat + latR * Math.sin(t)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function milesFeetLabel(mi) {
  return `${mi.toFixed(2)} mi / ${Math.round(mi * 5280).toLocaleString()} ft`;
}

export default function LiveAirportMap({ lat, lon, label, radiusMiles = 1 }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const roRef = useRef(null);
  const [nearest, setNearest] = useState(null); // { name, dist }

  useEffect(() => {
    let cancelled = false;
    const tLat = Number(lat);
    const tLon = Number(lon);
    const radius = Number(radiusMiles) || 1;

    (async () => {
      const cfg = await loadPublicConfig();
      if (cancelled || !ref.current) return;
      await ensureMapboxLoaded();
      if (cancelled || !ref.current) return;
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;

      const center = [tLon, tLat];
      const map = new window.mapboxgl.Map({
        container: ref.current,
        style: "mapbox://styles/mapbox/light-v11",
        center,
        zoom: 10,
        preserveDrawingBuffer: true,
      });
      mapRef.current = map;
      map.addControl(new window.mapboxgl.NavigationControl(), "top-right");
      map.addControl(new window.mapboxgl.ScaleControl({ unit: "imperial" }), "bottom-left");

      // Fix black-canvas: resize whenever the container gains/changes size
      // (it can mount inside a collapsed/zero-height section).
      if (typeof ResizeObserver !== "undefined" && ref.current) {
        roRef.current = new ResizeObserver(() => { try { map.resize(); } catch { /* disposed */ } });
        roRef.current.observe(ref.current);
      }

      map.on("load", () => {
        // 1 + 2 + 3 — live FAA GeoJSON source with clustering
        map.addSource("airports", {
          type: "geojson",
          data: FAA_AIRPORTS_GEOJSON,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 50,
        });

        // User's radius ring around Target A
        map.addSource("target-ring", { type: "geojson", data: ringFeature(tLat, tLon, radius) });
        map.addLayer({
          id: "target-ring-fill", type: "fill", source: "target-ring",
          paint: { "fill-color": SKYWAVE.blue, "fill-opacity": 0.08 },
        });
        map.addLayer({
          id: "target-ring-line", type: "line", source: "target-ring",
          paint: { "line-color": SKYWAVE.blue, "line-width": 2, "line-dasharray": [3, 2] },
        });

        // Clustered circles
        map.addLayer({
          id: "airport-clusters", type: "circle", source: "airports",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": SKYWAVE.blue, "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24],
            "circle-stroke-width": 2, "circle-stroke-color": "#fff",
          },
        });
        map.addLayer({
          id: "airport-cluster-count", type: "symbol", source: "airports",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
          paint: { "text-color": "#fff" },
        });

        // 4 — individual airport markers
        map.addLayer({
          id: "airport-markers", type: "circle", source: "airports",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#0891B2", "circle-radius": 6,
            "circle-stroke-width": 2, "circle-stroke-color": "#fff",
          },
        });

        // Target A waypoint marker (centerpoint)
        const el = document.createElement("div");
        el.style.cssText =
          `width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${SKYWAVE.blue};border-radius:50%;box-shadow:0 0 12px rgba(37,99,235,0.7);font-size:14px;`;
        el.textContent = "📡";
        new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(center).addTo(map);

        // Once the live FAA data loads, find the nearest airport, draw the line + distance
        const drawNearest = () => {
          let feats;
          try {
            feats = map.querySourceFeatures("airports", {});
          } catch { return; }
          if (!feats || !feats.length) return;
          let best = null;
          for (const f of feats) {
            if (f.properties?.cluster) continue;
            const c = f.geometry?.coordinates;
            if (!c || c.length < 2) continue;
            const d = distMiles(tLat, tLon, c[1], c[0]);
            if (!best || d < best.dist) best = { dist: d, coord: c, props: f.properties || {} };
          }
          if (!best || map.__drewLine) return;
          map.__drewLine = true;

          // crow-flies line
          map.addSource("airport-line", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: [center, best.coord] }, properties: {} },
          });
          map.addLayer({ id: "airport-line-casing", type: "line", source: "airport-line", layout: { "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.85 } });
          map.addLayer({ id: "airport-line", type: "line", source: "airport-line", layout: { "line-cap": "round" }, paint: { "line-color": "#0891B2", "line-width": 2.5 } });

          // imperial distance label at midpoint
          const mid = [(center[0] + best.coord[0]) / 2, (center[1] + best.coord[1]) / 2];
          map.addSource("airport-dist", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: mid }, properties: { label: milesFeetLabel(best.dist) } } });
          map.addLayer({
            id: "airport-dist", type: "symbol", source: "airport-dist",
            layout: { "text-field": ["get", "label"], "text-size": 13, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true },
            paint: { "text-color": "#fff", "text-halo-color": "#0891B2", "text-halo-width": 2.5 },
          });

          const b = new window.mapboxgl.LngLatBounds(center, center);
          b.extend(best.coord);
          map.fitBounds(b, { padding: 80, duration: 0, maxZoom: 12 });
          if (!cancelled) {
            const p = best.props;
            setNearest({
              name: p.NAME || "Airport",
              ident: p.IDENT || p.ICAO_ID || "—",
              icao: p.ICAO_ID || "",
              dist: best.dist,
            });
          }
        };
        map.on("sourcedata", (e) => { if (e.sourceId === "airports" && e.isSourceLoaded) drawNearest(); });

        // Zoom into a cluster on click
        map.on("click", "airport-clusters", (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["airport-clusters"] });
          const clusterId = features[0].properties.cluster_id;
          map.getSource("airports").getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
        });

        // 5 — popup with live attributes
        map.on("click", "airport-markers", (e) => {
          const f = e.features[0];
          const p = f.properties || {};
          const coords = f.geometry.coordinates.slice();
          const d = distMiles(tLat, tLon, coords[1], coords[0]);
          const html = `
            <div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:180px">
              <div style="font-weight:700;color:${SKYWAVE.navy};margin-bottom:4px">${p.NAME || "Airport"}</div>
              <div><strong>Call Letters (FAA ID):</strong> ${p.IDENT || "—"}</div>
              <div><strong>ICAO:</strong> ${p.ICAO_ID || "—"}</div>
              <div><strong>City:</strong> ${p.SERVCITY || "—"}</div>
              <div><strong>State:</strong> ${p.STATE || "—"}</div>
              <div><strong>Use:</strong> ${p.MIL_CODE || "—"}${p.PRIVATEUSE === 1 ? " · Private Use" : ""}</div>
              <div style="margin-top:4px;color:#0891B2"><strong>Distance:</strong> ${milesFeetLabel(d)}</div>
            </div>`;
          new window.mapboxgl.Popup().setLngLat(coords).setHTML(html).addTo(map);
        });

        const setPointer = (on) => () => { map.getCanvas().style.cursor = on ? "pointer" : ""; };
        ["airport-markers", "airport-clusters"].forEach((id) => {
          map.on("mouseenter", id, setPointer(true));
          map.on("mouseleave", id, setPointer(false));
        });

        requestAnimationFrame(() => requestAnimationFrame(() => { try { map.resize(); } catch { /* disposed */ } }));
      });
    })();
    return () => { cancelled = true; roRef.current?.disconnect?.(); roRef.current = null; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, radiusMiles]);

  // FAA Form 7460-1 notice triggers within ~5 statute mi (20,000 ft) of an airport.
  const faaLikely = nearest && nearest.dist <= 3.79; // 20,000 ft
  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: SKYWAVE.line }}>
      <div className="px-3 py-2 flex items-center gap-2 text-white text-xs font-bold uppercase" style={{ background: SKYWAVE.blue }}>
        <Plane className="w-4 h-4" /> Live US Airports {label ? `· ${label}` : ""}
      </div>
      <div ref={ref} className="w-full" style={{ height: 460 }} />
      {nearest && (
        <div
          className="px-3 py-2 text-xs flex items-start gap-2"
          style={{ background: faaLikely ? "#FEF3C7" : "#ECFDF5", color: faaLikely ? "#92400E" : "#065F46" }}
        >
          {faaLikely ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>
            Nearest airport: <strong>{nearest.name}</strong> ({nearest.ident}{nearest.icao ? ` / ${nearest.icao}` : ""}) — {milesFeetLabel(nearest.dist)}.
            {faaLikely
              ? " Within ~20,000 ft of an airport — an FAA Form 7460-1 determination is likely required."
              : " Beyond ~20,000 ft of the nearest airport — FAA notice less likely (verify against runway type & tower height)."}
          </span>
        </div>
      )}
      <div className="px-3 py-1.5 text-[10px]" style={{ color: SKYWAVE.muted }}>
        Live FAA airport data — click a point for details. Source: FAA ArcGIS Feature Service.
      </div>
    </div>
  );
}