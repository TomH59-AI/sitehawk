/* Tower Fit Exhibit — landscape letter sheet (1100×850 ≈ 11″×8.5″ @100dpi). Pure SVG. */
import { forwardRef } from "react";
import ExhibitDrawing from "@/components/towerfit/ExhibitDrawing";
import ExhibitSidebar from "@/components/towerfit/ExhibitSidebar";

const W = 1100, H = 850;

const ExhibitSheet = forwardRef(function ExhibitSheet({ model, config }, ref) {
  const dateStr = config.date || new Date().toISOString().slice(0, 10);
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ background: "white", display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="Helvetica, Arial, sans-serif"
    >
      <rect width={W} height={H} fill="white" />

      {/* header */}
      <rect x="0" y="0" width={W} height="68" fill="#111827" />
      <rect x="0" y="68" width={W} height="4" fill="#E11D48" />
      <text x="28" y="34" fontSize="24" fill="white" fontWeight="bold" letterSpacing="3">SITEHAWK</text>
      <text x="28" y="52" fontSize="10" fill="#9CA3AF" letterSpacing="2">A SKYWAVE COMPANY</text>
      <text x={W / 2} y="32" fontSize="17" fill="#E11D48" fontWeight="bold" textAnchor="middle" letterSpacing="2">TOWER FIT EXHIBIT</text>
      <text x={W / 2} y="52" fontSize="12" fill="white" textAnchor="middle" fontWeight="bold">{config.siteName || "Proposed Tower Site"}</text>
      <text x={W - 28} y="30" fontSize="9.5" fill="#9CA3AF" textAnchor="end">
        {[config.jurisdiction, dateStr].filter(Boolean).join(" · ")}
      </text>
      {config.preparedFor && (
        <text x={W - 28} y="48" fontSize="10" fill="white" textAnchor="end">Prepared for: <tspan fontWeight="bold">{config.preparedFor}</tspan></text>
      )}

      {/* drawing panel */}
      <ExhibitDrawing model={model} x={20} y={86} w={716} h={716} />

      {/* sidebar */}
      <ExhibitSidebar model={model} config={config} x={756} y={100} w={320} />

      {/* footer disclaimer */}
      <line x1="20" y1="816" x2={W - 20} y2="816" stroke="#E2E8F0" />
      <text x={W / 2} y="833" fontSize="8.5" fill="#94A3B8" textAnchor="middle">
        CONCEPT EXHIBIT ONLY — drawn to scale from supplied dimensions. NOT a boundary survey, engineering drawing, or zoning determination. Verify all dimensions, setbacks, and fall-zone rules with a licensed surveyor and the local jurisdiction.
      </text>
      <text x={W / 2} y="845" fontSize="8" fill="#CBD5E1" textAnchor="middle">SiteHawk · SkyWave — Tower Fit Exhibit · {dateStr}</text>
    </svg>
  );
});

export default ExhibitSheet;