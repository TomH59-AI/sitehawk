import { Loader2 } from "lucide-react";
import { regridPowerLabel, regridElevationLabel, regridLbcsLabel } from "@/lib/regridEnrich";

const EXTRA_ROWS = [
  ["Power Proximity", regridPowerLabel],
  ["Ground Elevation", regridElevationLabel],
  ["LBCS Land Use", regridLbcsLabel],
];

/**
 * RegridEnrichRows — extra <tr> rows appended to a target table body.
 * `enrich` / `loading` are arrays aligned to the table's target columns.
 * variant "section3" uses the Section 3 bordered table style; "skywave" the
 * SCIP HawkParcelTargets style.
 */
export default function RegridEnrichRows({ enrich = [], loading = [], variant = "section3" }) {
  if (!enrich.some(Boolean) && !loading.some(Boolean)) return null;
  const isS3 = variant === "section3";
  const labelClass = isS3
    ? "px-4 py-2 font-bold text-left border border-border align-top text-sky-800 dark:text-sky-300"
    : "p-2 font-medium align-top";
  const cellClass = isS3
    ? "px-4 py-2 text-sm border border-border align-top text-foreground"
    : "p-2 align-top text-sm";
  return (
    <>
      {EXTRA_ROWS.map(([label, fmt]) => {
        const values = enrich.map((e) => (e ? fmt(e) : null));
        if (!values.some(Boolean) && !loading.some(Boolean)) return null;
        return (
          <tr key={label} className={isS3 ? "bg-sky-50 dark:bg-sky-950/20" : ""}>
            <td className={labelClass} style={isS3 ? undefined : { color: "#059669", borderBottom: "1px solid #E2E8F0" }}>
              {label}:
            </td>
            {enrich.map((e, i) => (
              <td key={i} className={cellClass} style={isS3 ? undefined : { borderBottom: "1px solid #E2E8F0" }}>
                {loading[i] ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin opacity-60" />
                ) : (
                  values[i] || <span className="opacity-50">—</span>
                )}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}