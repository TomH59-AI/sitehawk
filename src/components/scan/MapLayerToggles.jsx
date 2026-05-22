import { useEffect, useState } from "react";

// Three public WMS/raster overlays — no token needed for any of these services.
// Topography: USGS 3DEP contours (feet AMSL, MapServer export)
// Wetlands: USFWS National Wetlands Inventory WMS
// FEMA Flood: FEMA NFHL 100-Year (1% annual chance) flood zones
const OVERLAYS = [
  {
    id: "topo-contours",
    label: "Topography (ft)",
    icon: "⛰",
    color: "#D97706",
    tiles: [
      "https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&format=png32&transparent=true&layers=show:9,14,19&f=image",
    ],
    opacity: 0.85,
  },
  {
    id: "nwi-wetlands",
    label: "Wetlands (USFWS NWI)",
    icon: "🌿",
    color: "#10B981",
    tiles: [
      "https://www.fws.gov/wetlandsmapservice/services/Wetlands/MapServer/WMSServer?service=WMS&request=GetMap&version=1.3.0&layers=1&styles=&format=image/png&transparent=true&width=512&height=512&crs=EPSG:3857&bbox={bbox-epsg-3857}",
    ],
    opacity: 0.7,
  },
  {
    id: "fema-flood-100yr",
    label: "100-Yr FEMA Flood",
    icon: "🌊",
    color: "#3B82F6",
    tiles: [
      // FEMA NFHL — layer 28 = Flood Hazard Zones (includes A, AE, AH, AO, VE — the 1% annual chance / 100-yr zones)
      "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&format=png32&transparent=true&layers=show:28&f=image",
    ],
    opacity: 0.6,
  },
];

export default function MapLayerToggles({ map, styleLoaded }) {
  const [enabled, setEnabled] = useState({});

  // Ensure all overlay sources/layers exist on the map (added hidden, toggled by visibility).
  useEffect(() => {
    if (!map || !styleLoaded) return;
    OVERLAYS.forEach((ov) => {
      const sourceId = `overlay-src-${ov.id}`;
      const layerId = `overlay-lyr-${ov.id}`;
      if (!map.getSource(sourceId)) {
        try {
          map.addSource(sourceId, {
            type: "raster",
            tiles: ov.tiles,
            tileSize: 512,
          });
        } catch (e) {
          console.warn(`[MapLayerToggles] failed to add source ${sourceId}:`, e?.message);
          return;
        }
      }
      if (!map.getLayer(layerId)) {
        try {
          map.addLayer({
            id: layerId,
            type: "raster",
            source: sourceId,
            layout: { visibility: "none" },
            paint: { "raster-opacity": ov.opacity },
          });
        } catch (e) {
          console.warn(`[MapLayerToggles] failed to add layer ${layerId}:`, e?.message);
        }
      }
    });
  }, [map, styleLoaded]);

  const toggle = (id) => {
    if (!map) return;
    const layerId = `overlay-lyr-${id}`;
    const next = !enabled[id];
    setEnabled((prev) => ({ ...prev, [id]: next }));
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", next ? "visible" : "none");
    }
  };

  return (
    <div className="absolute top-3 left-3 z-10 bg-[#0a0e17]/90 backdrop-blur border border-[#1e293b] rounded-lg p-2 space-y-1.5">
      <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest px-1 pb-0.5">
        Map Layers
      </div>
      {OVERLAYS.map((ov) => {
        const on = !!enabled[ov.id];
        return (
          <button
            key={ov.id}
            onClick={() => toggle(ov.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors"
            style={{
              background: on ? `${ov.color}22` : "transparent",
              border: `1px solid ${on ? ov.color : "#1e293b"}`,
              color: on ? "#fff" : "#94a3b8",
              minWidth: 170,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                background: on ? ov.color : "transparent",
                border: `1.5px solid ${ov.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "#fff",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {on ? "✓" : ""}
            </span>
            <span style={{ fontSize: 12 }}>{ov.icon}</span>
            <span className="text-left flex-1">{ov.label}</span>
          </button>
        );
      })}
      <div className="text-[9px] text-slate-500 px-1 pt-1 leading-tight max-w-[180px]">
        USGS · USFWS · FEMA
      </div>
    </div>
  );
}