import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

// Toggleable raster overlays for the Mapbox map: USGS Topo + USFWS NWI wetlands.
// Each overlay has an on/off toggle and an opacity slider.

const OVERLAYS = [
  {
    id: "usgs-topo",
    name: "USGS Topography",
    type: "raster",
    tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    attribution: "USGS The National Map",
  },
  {
    id: "nwi-wetlands",
    name: "USFWS Wetlands (NWI)",
    type: "raster",
    tiles: [
      "https://www.fws.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer?service=WMS&request=GetMap&version=1.3.0&layers=0&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}",
    ],
    tileSize: 256,
    attribution: "U.S. Fish & Wildlife Service",
  },
];

export default function MapOverlayControls({ map, mapLoaded }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(() =>
    OVERLAYS.reduce((acc, o) => ({ ...acc, [o.id]: { enabled: false, opacity: 0.6 } }), {})
  );

  // Re-attach overlays whenever the basemap style reloads (mapLoaded toggles)
  useEffect(() => {
    if (!map || !mapLoaded) return;
    OVERLAYS.forEach((o) => {
      const s = state[o.id];
      if (!s?.enabled) return;
      addOrUpdate(map, o, s.opacity);
    });
  }, [map, mapLoaded]); // eslint-disable-line

  const addOrUpdate = (m, overlay, opacity) => {
    const sourceId = `ov-src-${overlay.id}`;
    const layerId = `ov-lyr-${overlay.id}`;
    if (!m.getSource(sourceId)) {
      m.addSource(sourceId, {
        type: "raster",
        tiles: overlay.tiles,
        tileSize: overlay.tileSize,
        attribution: overlay.attribution,
      });
    }
    if (!m.getLayer(layerId)) {
      m.addLayer({ id: layerId, type: "raster", source: sourceId, paint: { "raster-opacity": opacity } });
    } else {
      m.setPaintProperty(layerId, "raster-opacity", opacity);
    }
  };

  const removeLayer = (m, overlay) => {
    const sourceId = `ov-src-${overlay.id}`;
    const layerId = `ov-lyr-${overlay.id}`;
    if (m.getLayer(layerId)) m.removeLayer(layerId);
    if (m.getSource(sourceId)) m.removeSource(sourceId);
  };

  const toggle = (overlay) => {
    if (!map) return;
    const cur = state[overlay.id];
    const next = { ...cur, enabled: !cur.enabled };
    setState((s) => ({ ...s, [overlay.id]: next }));
    if (next.enabled) addOrUpdate(map, overlay, next.opacity);
    else removeLayer(map, overlay);
  };

  const setOpacity = (overlay, value) => {
    setState((s) => ({ ...s, [overlay.id]: { ...s[overlay.id], opacity: value } }));
    if (map && state[overlay.id]?.enabled) addOrUpdate(map, overlay, value);
  };

  return (
    <div className="absolute top-3 right-14 z-10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-card/90 backdrop-blur border border-border rounded-lg px-2.5 py-1.5 shadow text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-card"
        title="Map overlays"
      >
        <Layers className="w-3.5 h-3.5" /> Overlays
      </button>
      {open && (
        <div className="absolute top-9 right-0 w-64 bg-card border border-border rounded-xl shadow-2xl p-3 space-y-3">
          <div className="font-heading font-bold text-xs text-foreground uppercase tracking-wider">Overlays</div>
          {OVERLAYS.map((o) => {
            const s = state[o.id];
            return (
              <div key={o.id} className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={() => toggle(o)}
                    className="accent-primary"
                  />
                  {o.name}
                </label>
                {s.enabled && (
                  <div className="flex items-center gap-2 pl-5">
                    <span className="text-[10px] text-muted-foreground w-12">Opacity</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={s.opacity}
                      onChange={(e) => setOpacity(o, parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(s.opacity * 100)}%</span>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground border-t border-border pt-2">
            Sources: USGS The National Map · USFWS National Wetlands Inventory
          </p>
        </div>
      )}
    </div>
  );
}