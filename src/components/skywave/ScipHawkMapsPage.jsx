import { SKYWAVE } from "@/lib/skywave";

// Print section — HAWK MAPS 2x2 grid: Aerial / Topography / Floodplain / Zoning.
const TILES = [
  ["aerial_url", "Aerial"],
  ["topography_url", "Topography"],
  ["floodplain_url", "Floodplain Map"],
  ["zoning_url", "Zoning Map"],
];

function MapTile({ title, url, sub }) {
  return (
    <div style={{ border: `1px solid ${SKYWAVE.line}`, borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "4px 8px", background: SKYWAVE.blue, color: "#fff", fontWeight: 700,
        fontSize: "9pt", textTransform: "uppercase", display: "flex", justifyContent: "space-between",
        printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
      }}>
        <span>{title}</span>
        {sub && <span style={{ fontWeight: 500, opacity: 0.85 }}>{sub}</span>}
      </div>
      <div style={{ height: "3.6in", background: SKYWAVE.bg }}>
        {url ? (
          <img src={url} alt={title} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: SKYWAVE.muted, fontSize: "9pt" }}>
            Not generated
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScipHawkMapsPage({ hawkMaps = {} }) {
  const subFor = (key) => {
    if (key === "topography_url" && hawkMaps.center_amsl_ft != null) return `${hawkMaps.center_amsl_ft} ft AMSL`;
    if (key === "zoning_url" && hawkMaps.zone_code) return hawkMaps.zone_code;
    return null;
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {TILES.map(([key, title]) => (
        <MapTile key={key} title={title} url={hawkMaps[key]} sub={subFor(key)} />
      ))}
    </div>
  );
}