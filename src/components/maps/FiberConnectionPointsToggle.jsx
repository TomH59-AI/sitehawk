import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SRC = "fiber-connection-points";
const COLOR = "#06b6d4";
const EMPTY = { type: "FeatureCollection", features: [] };

function featuresToGeoJSON(points) {
  return {
    type: "FeatureCollection",
    features: (points || []).map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
      properties: {
        name: p.name || "Unnamed facility",
        point_type: p.point_type || "",
        org_name: p.org_name || "",
        city: p.city || "",
        state: p.state || "",
        net_count: p.net_count ?? null,
        carrier_count: p.carrier_count ?? null,
        ix_count: p.ix_count ?? null,
        clli: p.clli || "",
        website: p.website || "",
        source: p.source || "PeeringDB public API",
      },
    })),
  };
}

function addLayers(map, data) {
  if (!map.getSource(SRC)) {
    map.addSource(SRC, { type: "geojson", data });
    map.addLayer({
      id: `${SRC}-halo`,
      type: "circle",
      source: SRC,
      paint: {
        "circle-radius": 9,
        "circle-color": COLOR,
        "circle-opacity": 0.18,
      },
    });
    map.addLayer({
      id: `${SRC}-point`,
      type: "circle",
      source: SRC,
      paint: {
        "circle-radius": 5,
        "circle-color": COLOR,
        "circle-stroke-color": "#0f172a",
        "circle-stroke-width": 1.5,
      },
    });
    const popup = new window.mapboxgl.Popup({ offset: 14, maxWidth: "280px" });
    map.on("mouseenter", `${SRC}-point`, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", `${SRC}-point`, () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", `${SRC}-point`, (e) => {
      if (!e.features?.length) return;
      const f = e.features[0];
      const p = f.properties || {};
      const nets = p.net_count != null ? `${p.net_count} network${p.net_count === 1 ? "" : "s"}` : null;
      const carriers = p.carrier_count != null ? `${p.carrier_count} carrier${p.carrier_count === 1 ? "" : "s"}` : null;
      const html =
        `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;">` +
        `<strong style="color:${COLOR};font-size:13px;">🔌 ${p.name || "Fiber facility"}</strong><br/>` +
        `<span style="opacity:.7">${p.point_type === "internet_exchange" ? "Internet Exchange" : "Carrier Facility / Data Center"}</span><br/>` +
        `${p.org_name ? `<b>Org:</b> ${p.org_name}<br/>` : ""}` +
        `${p.city || p.state ? `<b>Location:</b> ${[p.city, p.state].filter(Boolean).join(", ")}<br/>` : ""}` +
        `${nets ? `<b>Networks:</b> ${nets}<br/>` : ""}` +
        `${carriers ? `<b>Carriers:</b> ${carriers}<br/>` : ""}` +
        `${p.clli ? `<b>CLLI:</b> ${p.clli}<br/>` : ""}` +
        `${p.website ? `<a href="${p.website}" target="_blank" rel="noopener" style="color:${COLOR};">${p.website}</a><br/>` : ""}` +
        `<span style="opacity:.6;font-size:10px;">Source: ${p.source}</span></div>`;
      popup.setLngLat(f.geometry.coordinates.slice()).setHTML(html).addTo(map);
    });
  } else {
    map.getSource(SRC).setData(data);
  }
}

function removeLayers(map) {
  [`${SRC}-halo`, `${SRC}-point`].forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource(SRC)) map.removeSource(SRC);
}

/**
 * FiberConnectionPointsToggle — overlays PeeringDB carrier-neutral facilities
 * (carrier hotels, data centers, IXPs) on the search map so acquisition
 * professionals can see fiber backhaul handoff proximity to candidate parcels.
 * Queries the FiberConnectionPoint entity within the current viewport and
 * refreshes as the user pans/zooms.
 */
export default function FiberConnectionPointsToggle({ mapRef }) {
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(0);
  const onRef = useRef(false);

  const load = async () => {
    const map = mapRef.current;
    if (!map || !onRef.current) return;
    setLoading(true);
    try {
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const points = await base44.entities.FiberConnectionPoint.filter({
        latitude: { $gte: sw.lat, $lte: ne.lat },
        longitude: { $gte: sw.lng, $lte: ne.lng },
      }, undefined, 200);
      if (onRef.current && mapRef.current) {
        const data = points?.length ? featuresToGeoJSON(points) : EMPTY;
        addLayers(mapRef.current, data);
        setCount(points?.length || 0);
      }
    } catch {
      // leave the layer as-is on transient failures
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !on;
    onRef.current = next;
    setOn(next);
    if (next) load();
    else { removeLayers(map); setCount(0); }
  };

  // Refresh on pan/zoom + re-add after basemap switches (setStyle wipes layers).
  useEffect(() => {
    const map = mapRef.current;
    if (!on || !map) return;
    const refresh = () => load();
    map.on("moveend", refresh);
    map.on("style.load", refresh);
    return () => { map.off("moveend", refresh); map.off("style.load", refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold shadow-lg transition-all ${
        on ? "bg-cyan-500 border-cyan-400 text-slate-900" : "bg-slate-900/85 border-white/15 text-white/80 hover:text-white"
      }`}
      title="Toggle fiber connection points (PeeringDB carrier facilities)"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
        <span className={`inline-block w-7 h-4 rounded-full relative transition-colors ${on ? "bg-slate-900/40" : "bg-white/20"}`}>
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
        </span>
      )}
      Fiber Points{on && count > 0 ? ` (${count})` : ""}
    </button>
  );
}