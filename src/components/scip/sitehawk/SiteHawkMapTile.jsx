import { HAWK } from "../hawkScipBrand";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

// One labeled map tile inside the SiteHawk SCIP maps grid. `url` may be a string
// or {url, distLabel}. Shows a "not generated" placeholder when missing.
export default function SiteHawkMapTile({ title, url, sub, height = "3.4in" }) {
  const src = typeof url === "string" ? url : url?.url;
  const distLabel = typeof url === "object" ? url?.distLabel : null;
  return (
    <div style={{ border: `1px solid ${HAWK.line}`, borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "4px 8px", background: HAWK.navy, color: "#fff", fontWeight: 700,
        fontSize: "8.5pt", textTransform: "uppercase", display: "flex", justifyContent: "space-between", gap: 8,
        ...EXACT,
      }}>
        <span>{title}</span>
        {(sub || distLabel) && <span style={{ fontWeight: 500, opacity: 0.85 }}>{sub || distLabel}</span>}
      </div>
      <div style={{ height, background: HAWK.bg }}>
        {src ? (
          <img src={src} alt={title} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: HAWK.muted, fontSize: "9pt" }}>
            Not generated
          </div>
        )}
      </div>
    </div>
  );
}