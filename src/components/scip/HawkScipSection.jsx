import { HAWK, CONFIDENTIAL_SHORT } from "./hawkScipBrand";

const EXACT = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" };

// A faint diagonal "CONFIDENTIAL" watermark sitting behind page content.
export function HawkWatermark() {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none", zIndex: 0, ...EXACT,
      }}
    >
      <div style={{
        transform: "rotate(-32deg)", fontSize: "62pt", fontWeight: 900,
        letterSpacing: 8, color: HAWK.watermark, whiteSpace: "nowrap",
        fontFamily: "Inter, Arial, sans-serif", textTransform: "uppercase",
      }}>
        SiteHawk · Confidential
      </div>
    </div>
  );
}

// One bound page: branded header bar + boxed body + confidentiality footer strip.
export default function HawkScipSection({ kicker, title, accent = HAWK.gold, right, children, page, footerNote }) {
  return (
    <div
      className="page"
      style={{
        position: "relative", width: "8.5in", height: "11in",
        padding: "0.45in 0.5in", background: "#fff",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <HawkWatermark />

      {/* Content sits above the watermark */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Branded header bar */}
        <div className="flex items-stretch rounded-lg overflow-hidden mb-4" style={{ border: `2px solid ${HAWK.navy}`, ...EXACT }}>
          <div style={{ width: 8, background: accent }} />
          <div className="flex-1 px-4 py-2.5" style={{ background: HAWK.blue }}>
            {kicker && (
              <div className="text-[8pt] font-bold uppercase" style={{ color: HAWK.gold, letterSpacing: 3 }}>{kicker}</div>
            )}
            <div className="text-[15pt] font-bold text-white leading-tight">{title}</div>
          </div>
          {right && (
            <div className="flex items-center px-4 text-[8.5pt] text-right" style={{ background: HAWK.navy, color: "#C7D2EA", maxWidth: "2.4in" }}>
              {right}
            </div>
          )}
        </div>

        {/* Bound body */}
        <div
          className="flex-1 rounded-lg p-4"
          style={{ border: `1.5px solid ${HAWK.line}`, background: "#fff", overflow: "hidden", minHeight: 0 }}
        >
          {children}
        </div>

        {footerNote && (
          <div className="mt-3 text-[8pt]" style={{ color: HAWK.muted }}>{footerNote}</div>
        )}

        {/* Confidentiality footer strip */}
        <div
          className="flex justify-between items-center mt-3 px-3 py-1.5 rounded"
          style={{ background: HAWK.dark, color: HAWK.gold, fontSize: "7.5pt", letterSpacing: 0.5, ...EXACT }}
        >
          <span style={{ fontWeight: 700 }}>{CONFIDENTIAL_SHORT}</span>
          <span style={{ color: "#9FB0CC" }}>{page ? `Page ${page}` : ""}{right ? "" : ""}</span>
        </div>
      </div>
    </div>
  );
}