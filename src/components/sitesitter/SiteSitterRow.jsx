import { formatFt } from "@/lib/siteSitterFeasibility";

// One rolled-up site: latest SiteSitter™ verdict, allowable height, binding constraint.
export default function SiteSitterRow({ site }) {
  return (
    <tr className="border-b border-border align-top">
      <td className="px-3 py-3">
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${
            site.feasible ? "bg-green-600 text-white" : "border border-red-600 text-red-600"
          }`}
        >
          {site.feasible ? "BUILDABLE" : "EJECTED"}
        </span>
      </td>
      <td className="px-3 py-3 text-sm text-foreground">
        <div>{site.parcel_id || "No parcel ID available"}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {Number.isFinite(site.latitude) && Number.isFinite(site.longitude)
            ? `${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}`
            : "No coordinates available"}
        </div>
      </td>
      <td className="px-3 py-3 text-sm text-foreground">{site.jurisdiction || "No data available"}</td>
      <td className="px-3 py-3 text-sm font-semibold text-foreground">{formatFt(site.max_height_ft)}</td>
      <td className="px-3 py-3 text-sm text-muted-foreground">{formatFt(site.tower_height_ft)}</td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {site.binding_constraint || "No data available"}
        {site.result_class ? <div className="mt-0.5 opacity-70">{site.result_class}</div> : null}
      </td>
      <td className="px-3 py-3 text-xs text-muted-foreground">
        {site.run_timestamp_utc ? new Date(site.run_timestamp_utc).toLocaleString() : "—"}
        <div className="opacity-70">{site.run_count} run{site.run_count === 1 ? "" : "s"}</div>
      </td>
    </tr>
  );
}