import { useEffect, useRef, useState } from "react";
import { RadioTower } from "lucide-react";
import { ensureMapboxLoaded } from "@/lib/section6Proximity";
import { loadPublicConfig } from "@/lib/publicConfig";
import { SKYWAVE } from "@/lib/skywave";

// Live US Cellular Towers map — connects a Mapbox GL geojson source DIRECTLY to
// the HIFLD Cellular Towers ArcGIS REST Feature API. No data is downloaded,
// stored, or cached locally. Centered on Target A, it finds the single nearest
// tower, draws a dashed crow-flies line + imperial distance, and shows the
// tower owner / structure type / distance in a popup.
const HIFLD_TOWERS_GEOJSON =
  "https://services1.arcgis.com/Hp6G60OIvSO7gY19/arcgis/rest/services/Cellular_Towers/FeatureServer/0/query?where=1%3D1&outFields=NAME,ADDRESS,CITY,STATE,TELEPHONE,STRUCTURE_TYPE,OWNER,LATITUDE,LONGITUDE&outSR=4326&f=geojson&resultType=tile";

const TOWER_ACCENT = "#C026D3"; // fuchsia-600 — distinct from the cyan airport accent

// Haversine distance in miles
function distMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function milesFeetLabel(mi) {
  return `${mi.toFixed(2)} mi / ${Math.round(mi * 5280).toLocaleString()} ft`;
}

export default function LiveTowerMap({ lat, lon, label }) {
  const ref = useRef(null);
  const mapRef = useRef(null);
  const [nearest, setNearest] = useState(null); // { owner, structure, dist }

  useEffect(() => {
    let cancelled = false;
    const tLat = Number(lat);
    const tLon = Number(lon);

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

      map.on("load", () => {
        // 1 — live HIFLD GeoJSON source with clustering
        map.addSource("towers", {
          type: "geojson",
          data: HIFLD_TOWERS_GEOJSON,
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 50,
        });

        // Clustered circles
        map.addLayer({
          id: "tower-clusters", type: "circle", source: "towers",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": SKYWAVE.navy, "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24],
            "circle-stroke-width": 2, "circle-stroke-color": "#fff",
          },
        });
        map.addLayer({
          id: "tower-cluster-count", type: "symbol", source: "towers",
          filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 },
          paint: { "text-color": "#fff" },
        });

        // Individual tower markers
        map.addLayer({
          id: "tower-markers", type: "circle", source: "towers",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": TOWER_ACCENT, "circle-radius": 6,
            "circle-stroke-width": 2, "circle-stroke-color": "#fff",
          },
        });

        // 2 — Target A waypoint marker (centerpoint)
        const el = document.createElement("div");
        el.style.cssText =
          `width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,0.92);border:2px solid ${SKYWAVE.blue};border-radius:50%;box-shadow:0 0 12px rgba(37,99,235,0.7);font-size:14px;`;
        el.textContent = "📡";
        new window.mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat(center).addTo(map);

        // 3 + 4 + 5 — once live data loads, find nearest tower, draw the line + distance
        const drawNearest = () => {
          let feats;
          try {
            feats = map.querySourceFeatures("towers", {});
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

          // dashed crow-flies line
          map.addSource("tower-line", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "LineString", coordinates: [center, best.coord] }, properties: {} },
          });
          map.addLayer({ id: "tower-line-casing", type: "line", source: "tower-line", layout: { "line-cap": "round" }, paint: { "line-color": "#fff", "line-width": 5, "line-opacity": 0.85 } });
          map.addLayer({ id: "tower-line", type: "line", source: "tower-line", layout: { "line-cap": "round" }, paint: { "line-color": TOWER_ACCENT, "line-width": 2.5, "line-dasharray": [2, 2] } });

          // imperial distance label at midpoint
          const mid = [(center[0] + best.coord[0]) / 2, (center[1] + best.coord[1]) / 2];
          map.addSource("tower-dist", { type: "geojson", data: { type: "Feature", geometry: { type: "Point", coordinates: mid }, properties: { label: milesFeetLabel(best.dist) } } });
          map.addLayer({
            id: "tower-dist", type: "symbol", source: "tower-dist",
            layout: { "text-field": ["get", "label"], "text-size": 13, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true },
            paint: { "text-color": "#fff", "text-halo-color": TOWER_ACCENT, "text-halo-width": 2.5 },
          });

          const b = new window.mapboxgl.LngLatBounds(center, center);
          b.extend(best.coord);
          map.fitBounds(b, { padding: 80, duration: 0, maxZoom: 13 });

          // 6 — auto-open popup on the nearest tower
          const p = best.props;
          const html = `
            <div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:190px">
              <div style="font-weight:700;color:${SKYWAVE.navy};margin-bottom:4px">Nearest Cell Tower</div>
              <div><strong>Owner:</strong> ${p.OWNER || "—"}</div>
              <div><strong>Structure Type:</strong> ${p.STRUCTURE_TYPE || "—"}</div>
              <div style="margin-top:4px;color:${TOWER_ACCENT}"><strong>Distance to Target A:</strong> ${best.dist.toFixed(2)} mi as the crow flies</div>
            </div>`;
          new window.mapboxgl.Popup({ closeOnClick: false }).setLngLat(best.coord).setHTML(html).addTo(map);

          if (!cancelled) setNearest({ owner: p.OWNER || "Unknown owner", structure: p.STRUCTURE_TYPE || "—", dist: best.dist });
        };
        map.on("sourcedata", (e) => { if (e.sourceId === "towers" && e.isSourceLoaded) drawNearest(); });

        // Zoom into a cluster on click
        map.on("click", "tower-clusters", (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["tower-clusters"] });
          const clusterId = features[0].properties.cluster_id;
          map.getSource("towers").getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
        });

        // 6 — popup on any tower with live attributes
        map.on("click", "tower-markers", (e) => {
          const f = e.features[0];
          const p = f.properties || {};
          const coords = f.geometry.coordinates.slice();
          const d = distMiles(tLat, tLon, coords[1], coords[0]);
          const html = `
            <div style="font-family:sans-serif;font-size:12px;line-height:1.5;min-width:190px">
              <div style="font-weight:700;color:${SKYWAVE.navy};margin-bottom:4px">${p.NAME || "Cell Tower"}</div>
              <div><strong>Owner:</strong> ${p.OWNER || "—"}</div>
              <div><strong>Structure Type:</strong> ${p.STRUCTURE_TYPE || "—"}</div>
              <div><strong>City:</strong> ${p.CITY || "—"}, ${p.STATE || "—"}</div>
              <div style="margin-top:4px;color:${TOWER_ACCENT}"><strong>Distance to Target A:</strong> ${d.toFixed(2)} mi as the crow flies</div>
            </div>`;
          new window.mapboxgl.Popup().setLngLat(coords).setHTML(html).addTo(map);
        });

        const setPointer = (on) => () => { map.getCanvas().style.cursor = on ? "pointer" : ""; };
        ["tower-markers", "tower-clusters"].forEach((id) => {
          map.on("mouseenter", id, setPointer(true));
          map.on("mouseleave", id, setPointer(false));
        });

        requestAnimationFrame(() => requestAnimationFrame(() => { try { map.resize(); } catch { /* disposed */ } }));
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove?.(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: SKYWAVE.line }}>
      <div className="px-3 py-2 flex items-center gap-2 text-white text-xs font-bold uppercase" style={{ background: SKYWAVE.navy }}>
        <RadioTower className="w-4 h-4" /> Live US Cell Towers {label ? `· ${label}` : ""}
      </div>
      <div ref={ref} className="w-full" style={{ height: 460 }} />
      {nearest && (
        <div className="px-3 py-2 text-xs flex items-start gap-2" style={{ background: "#FAF5FF", color: "#86198F" }}>
          <RadioTower className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Nearest cell tower: <strong>{nearest.owner}</strong> ({nearest.structure}) — {milesFeetLabel(nearest.dist)} as the crow flies.
          </span>
        </div>
      )}
      <div className="px-3 py-1.5 text-[10px]" style={{ color: SKYWAVE.muted }}>
        Live HIFLD cellular tower data — click a point for details. Source: HIFLD ArcGIS Feature Service.
      </div>
    </div>
  );
}