import { COLOR_HEX, TALONFIT_NAME, TALONFIT_TAGLINE } from "@/lib/aiEquation";

// AI Equation verdict chip for a Target A/B/C column header. Hover shows the
// max supported height + reasons from the parcel-wide pre-screen.
export default function AIEquationScreenBadge({ screen }) {
  if (!screen) return null;
  const label =
    screen.color === "green" ? "TalonFit™ ✓ WORKS"
    : screen.color === "yellow" ? "TalonFit™ ⚠ REVIEW"
    : "TalonFit™ ✗ NOT FEASIBLE";
  const tip = [
    `${TALONFIT_NAME} Tower Placement Feasibility Engine (${TALONFIT_TAGLINE})`,
    screen.maxHeightFt != null ? `Max height at best point: ${Math.round(screen.maxHeightFt)} ft` : null,
    ...(screen.reasons || []),
  ].filter(Boolean).join("\n");
  return (
    <span
      title={tip}
      className="text-[9px] font-bold normal-case px-1.5 py-0.5 rounded text-white cursor-help whitespace-nowrap"
      style={{ background: COLOR_HEX[screen.color] }}
    >
      {label}
    </span>
  );
}