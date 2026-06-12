import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/mapboxLoader";
import { loadPublicConfig } from "@/lib/publicConfig";

const EMPTY = { type: "FeatureCollection", features: [] };
const fc = (items) => ({
  type: "FeatureCollection",
  features: (items || []).filter(Boolean).map((g) => (g.type === "Feature" ? g : { type: "Feature", properties: {}, geometry: g.geometry ?? g })),
});

// Live Exhibit B view — Mapbox satellite-streets-v12. Parcel white 2.5px,
// envelope teal dash + 12% fill, fall zone cyan 18%, compound amber 45%,
// tower white circle / amber stroke, residential circle red dash. Drag the
// tower to re-site (clamping + recompute happen in the parent).
export default function SiterMap({ parcelGeoJSON, result, leaseLonLat, residCircle, draftPoints, onTowerDrag, onMapClick, clickMode }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const cbRef = useRef({ onTowerDrag, onMapClick, clickMode });
  cbRef.current = { onTowerDrag, onMapClick, clickMode };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureMapboxLoaded();
      const cfg = await loadPublicConfig();
      if (cancelled || !containerRef.current) return;
      window.mapboxgl.accessToken = cfg.mapboxAccessToken;
      const map = new window.mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [-80.8895, 35.7805],
        zoom: 15,
        preserveDrawingBuffer: true,
      });
      map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        const add = (id, type, paint, layout = {}) => {
          map.addSource(id, { type: "geojson", data: EMPTY });
          map.addLayer({ id, type, source: id, paint, layout });
        };
        add("ts-env-fill", "fill", { "fill-color": "#14b8a6", "fill-opacity": 0.12 });
        add("ts-fall-fill", "fill", { "fill-color": "#22d3ee", "fill-opacity": 0.18 });
        add("ts-compound-fill", "fill", { "fill-color": "#f59e0b", "fill-opacity": 0.45 });
        add("ts-parcel-line", "line", { "line-color": "#ffffff", "line-width": 2.5 });
        add("ts-env-line", "line", { "line-color": "#14b8a6", "line-width": 2, "line-dasharray": [2, 2] });
        add("ts-fall-line", "line", { "line-color": "#22d3ee", "line-width": 1.5 });
        add("ts-lease-line", "line", { "line-color": "#f59e0b", "line-width": 1.5, "line-dasharray": [3, 2] });
        add("ts-resid-line", "line", { "line-color": "#ef4444", "line-width": 2, "line-dasharray": [2, 2] });
        add("ts-draft-line", "line", { "line-color": "#60a5fa", "line-width": 2, "line-dasharray": [1, 1] });
        add("ts-draft-pts", "circle", { "circle-radius": 4, "circle-color": "#60a5fa", "circle-stroke-color": "#fff", "circle-stroke-width": 1 });
        add("ts-tower", "circle", {
          "circle-radius": 8, "circle-color": "#ffffff",
          "circle-stroke-color": "#f59e0b", "circle-stroke-width": 3,
        });

        // tower drag
        let dragging = false;
        map.on("mousedown", "ts-tower", (e) => {
          e.preventDefault();
          dragging = true;
          map.dragPan.disable();
          map.getCanvas().style.cursor = "grabbing";
        });
        map.on("mousemove", (e) => {
          if (!dragging) return;
          cbRef.current.onTowerDrag?.([e.lngLat.lng, e.lngLat.lat]);
        });
        map.on("mouseup", () => {
          if (!dragging) return;
          dragging = false;
          map.dragPan.enable();
          map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", "ts-tower", () => { map.getCanvas().style.cursor = "grab"; });
        map.on("mouseleave", "ts-tower", () => { if (!dragging) map.getCanvas().style.cursor = ""; });

        map.on("click", (e) => {
          if (cbRef.current.clickMode) cbRef.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat]);
        });

        mapRef.current = map;
        setReady(true);
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  const setData = (id, data) => mapRef.current?.getSource(id)?.setData(data || EMPTY);

  // parcel + fit bounds
  useEffect(() => {
    if (!ready) return;
    setData("ts-parcel-line", parcelGeoJSON ? fc([parcelGeoJSON]) : EMPTY);
    if (parcelGeoJSON && mapRef.current) {
      const g = parcelGeoJSON.geometry ?? parcelGeoJSON;
      const coords = (g.type === "MultiPolygon" ? g.coordinates.flat(2) : g.coordinates.flat(1));
      const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
      mapRef.current.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 70, duration: 600 }
      );
    }
  }, [ready, parcelGeoJSON]);

  // engine result layers
  useEffect(() => {
    if (!ready) return;
    setData("ts-env-fill", result?.envelope ? fc([result.envelope]) : EMPTY);
    setData("ts-env-line", result?.envelope ? fc([result.envelope]) : EMPTY);
    const fall = result?.checks?.fallZone?.circle;
    setData("ts-fall-fill", fall ? fc([fall]) : EMPTY);
    setData("ts-fall-line", fall ? fc([fall]) : EMPTY);
    setData("ts-compound-fill", result?.compound?.lonLat ? fc([result.compound.lonLat]) : EMPTY);
    setData("ts-lease-line", leaseLonLat ? fc([leaseLonLat]) : EMPTY);
    setData("ts-tower", result?.towerLonLat
      ? fc([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: result.towerLonLat } }])
      : EMPTY);
  }, [ready, result, leaseLonLat]);

  // residential separation circle (active after Confirm on HawkVision+)
  useEffect(() => {
    if (!ready) return;
    setData("ts-resid-line", residCircle ? fc([residCircle]) : EMPTY);
  }, [ready, residCircle]);

  // manual polygon draft
  useEffect(() => {
    if (!ready) return;
    const pts = draftPoints || [];
    setData("ts-draft-pts", fc(pts.map((p) => ({ type: "Point", coordinates: p }))));
    setData("ts-draft-line", pts.length >= 2
      ? fc([{ type: "LineString", coordinates: pts }])
      : EMPTY);
  }, [ready, draftPoints]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-xl overflow-hidden border border-white/10">
      <div ref={containerRef} className="absolute inset-0" />
      {clickMode && (
        <div className="absolute top-2 left-2 z-10 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold shadow">
          {clickMode === "parcel" ? "Click a parcel to load it" : clickMode === "rectCenter" ? "Click to place the rectangle center" : clickMode === "platAnchor" ? "Click to anchor the reconstructed plat" : "Click to add polygon points"}
        </div>
      )}
    </div>
  );
}