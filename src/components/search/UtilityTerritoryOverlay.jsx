import { useEffect, useRef, useState } from "react";
import { electricUtilityTerritory } from "@/functions/electricUtilityTerritory";

// HIFLD utility-type → fill color (matches UtilityRow badge palette)
const TYPE_COLORS = {
  "INVESTOR OWNED":         "#3B82F6", // blue
  "MUNICIPAL":              "#10B981", // emerald
  "COOPERATIVE":            "#F59E0B", // amber
  "POLITICAL SUBDIVISION":  "#A855F7", // purple
  "FEDERAL":                "#EF4444", // red
  "STATE":                  "#06B6D4", // cyan
};
const DEFAULT_COLOR = "#64748B";

const SOURCE_ID = "utility-territory";
const FILL_LAYER = "utility-territory-fill";
const OUTLINE_LAYER = "utility-territory-outline";

/**
 * Renders HIFLD electric utility service-territory polygons as a toggleable
 * Mapbox overlay. Mounts inside MapboxSatelliteMap and acts on the same map ref.
 */
export default function UtilityTerritoryOverlay({ map, mapLoaded, centerLat, centerLon }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [territories, setTerritories] = useState(null); // FeatureCollection
  const [error, setError] = useState(null);
  const fetchedKey = useRef(null);
  const popupRef = useRef(null);

  // Fetch once per (lat,lon) when toggled on
  useEffect(() => {
    if (!enabled || !centerLat || !centerLon) return;
    const key = `${centerLat.toFixed(5)},${centerLon.toFixed(5)}`;
    if (fetchedKey.current === key && territories) return;

    setLoading(true);
    setError(null);
    electricUtilityTerritory({ lat: centerLat, lon: centerLon })
      .then(res => {
        const fc = res.data;
        if (fc?.error) { setError(fc.error); return; }
        setTerritories(fc);
        fetchedKey.current = key;
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [enabled, centerLat, centerLon]);

  // Add/remove map source + layers
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const removeLayers = () => {
      if (map.getLayer(OUTLINE_LAYER)) map.removeLayer(OUTLINE_LAYER);
      if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    if (!enabled || !territories?.features?.length) {
      removeLayers();
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
      return;
    }

    removeLayers();

    map.addSource(SOURCE_ID, { type: "geojson", data: territories });

    // Build a match expression for fill color based on TYPE attribute
    const colorExpr = ["match", ["get", "TYPE"]];
    Object.entries(TYPE_COLORS).forEach(([type, color]) => {
      colorExpr.push(type, color);
    });
    colorExpr.push(DEFAULT_COLOR);

    map.addLayer({
      id: FILL_LAYER,
      type: "fill",
      source: SOURCE_ID,
      paint: { "fill-color": colorExpr, "fill-opacity": 0.18 },
    });
    map.addLayer({
      id: OUTLINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      paint: { "line-color": colorExpr, "line-width": 2, "line-opacity": 0.85 },
    });

    // Click popup
    const handleClick = (e) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties || {};
      const html = `
        <div style="font-family:sans-serif;min-width:220px;padding:2px 4px;">
          <div style="font-weight:800;font-size:13px;margin-bottom:6px;color:#0f172a;border-bottom:2px solid ${TYPE_COLORS[props.TYPE] || DEFAULT_COLOR};padding-bottom:5px;">
            ⚡ ${props.NAME || "Utility"}
          </div>
          <table style="width:100%;font-size:11px;color:#334155;border-collapse:collapse;">
            <tr><td style="padding:1px 0;color:#64748b;">Type</td><td style="padding:1px 0;font-weight:600;">${props.TYPE || "—"}</td></tr>
            ${props.HOLDING_CO && props.HOLDING_CO !== props.NAME ? `<tr><td style="padding:1px 0;color:#64748b;">Parent</td><td style="padding:1px 0;font-weight:600;">${props.HOLDING_CO}</td></tr>` : ""}
            ${props.CNTRL_AREA && props.CNTRL_AREA !== "NOT AVAILABLE" ? `<tr><td style="padding:1px 0;color:#64748b;">ISO/Area</td><td style="padding:1px 0;font-weight:600;font-family:monospace;">${props.CNTRL_AREA}</td></tr>` : ""}
            ${props.CUSTOMERS ? `<tr><td style="padding:1px 0;color:#64748b;">Customers</td><td style="padding:1px 0;font-weight:600;">${Number(props.CUSTOMERS).toLocaleString()}</td></tr>` : ""}
            ${props.TELEPHONE && props.TELEPHONE !== "NOT AVAILABLE" ? `<tr><td style="padding:1px 0;color:#64748b;">Phone</td><td style="padding:1px 0;font-weight:600;">${props.TELEPHONE}</td></tr>` : ""}
          </table>
          ${props.WEBSITE && props.WEBSITE !== "NOT AVAILABLE" ? `<a href="${props.WEBSITE.startsWith("http") ? props.WEBSITE : "http://" + props.WEBSITE}" target="_blank" rel="noopener" style="display:block;margin-top:6px;font-size:11px;color:#2563EB;font-weight:600;text-decoration:none;">Website ↗</a>` : ""}
        </div>`;

      if (popupRef.current) popupRef.current.remove();
      popupRef.current = new window.mapboxgl.Popup({ offset: 8, maxWidth: "260px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    };

    const handleEnter = () => { map.getCanvas().style.cursor = "pointer"; };
    const handleLeave = () => { map.getCanvas().style.cursor = ""; };

    map.on("click", FILL_LAYER, handleClick);
    map.on("mouseenter", FILL_LAYER, handleEnter);
    map.on("mouseleave", FILL_LAYER, handleLeave);

    // Move candidate ring outline above utility layers if present
    if (map.getLayer("search-ring-outline")) map.moveLayer("search-ring-outline");
    if (map.getLayer("search-ring-fill")) map.moveLayer("search-ring-fill", OUTLINE_LAYER);

    return () => {
      map.off("click", FILL_LAYER, handleClick);
      map.off("mouseenter", FILL_LAYER, handleEnter);
      map.off("mouseleave", FILL_LAYER, handleLeave);
    };
  }, [map, mapLoaded, enabled, territories]);

  // Visible territory types (for the legend chips)
  const presentTypes = territories?.features
    ? Array.from(new Set(territories.features.map(f => f.properties?.TYPE).filter(Boolean)))
    : [];

  return (
    <div className="absolute top-3 right-14 z-10 flex flex-col items-end gap-1.5">
      <button
        onClick={() => setEnabled(e => !e)}
        className={`px-3 py-1.5 rounded-lg border shadow text-xs font-semibold transition-all flex items-center gap-1.5 ${
          enabled
            ? "bg-amber-500 text-white border-amber-600"
            : "bg-card/90 backdrop-blur text-foreground border-border hover:bg-card"
        }`}
        title="Toggle electric utility service-territory overlay"
      >
        ⚡ {enabled ? "Hide" : "Show"} Utility Territories
        {loading && <span className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />}
      </button>

      {enabled && presentTypes.length > 0 && (
        <div className="bg-card/92 backdrop-blur border border-border rounded-lg p-2 text-[10px] shadow space-y-1 max-w-[200px]">
          <div className="font-bold text-foreground uppercase tracking-wider mb-1">Utility Type</div>
          {presentTypes.map(t => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded" style={{ background: TYPE_COLORS[t] || DEFAULT_COLOR, opacity: 0.85 }} />
              <span className="text-foreground/80">{t}</span>
            </div>
          ))}
          <div className="text-foreground/50 pt-1 border-t border-border italic">Click a polygon for details</div>
        </div>
      )}

      {enabled && error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg px-2 py-1 text-[10px] max-w-[200px]">
          Failed to load territories
        </div>
      )}
    </div>
  );
}