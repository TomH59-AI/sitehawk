/**
 * FiberOpticsBanner — MAP 11 readout: fiber hookup / splice point, the operator
 * who owns it, and the FCC BDC broadband providers to call for backhaul.
 * Every unavailable field is stated as such — nothing is inferred.
 */
const NA = <span className="opacity-70">No data available</span>;

export default function FiberOpticsBanner({ fiber, access, fcc }) {
  if (!fiber && !fcc) return null;
  const providers = fcc?.provider_names || [];

  return (
    <div className="px-4 py-2 bg-violet-50 dark:bg-violet-950/20 border-y border-violet-300/50 text-sm text-violet-900 dark:text-violet-100 space-y-1">
      <div>
        <span className="font-semibold">
          {fiber?.assumed ? "Assumed hookup (road ROW)" : "Nearest mapped fiber asset"}:
        </span>{" "}
        <span className="font-mono">{fiber?.asset || (fiber?.assumed ? "Fiber presumed along road frontage" : null) || NA}</span>
        {fiber?.distance_ft != null ? <span className="opacity-80"> · {fiber.distance_ft} ft from Target A</span> : null}
      </div>
      <div>
        <span className="font-semibold">Splice / hookup point:</span>{" "}
        <span className="font-mono">
          {fiber?.point ? `${fiber.point.lat.toFixed(6)}, ${fiber.point.lon.toFixed(6)}` : NA}
        </span>
        {" · "}
        <span className="font-semibold">Operator:</span>{" "}
        <span className="font-mono">{fiber?.operator || NA}</span>
      </div>
      {access?.road_name ? (
        <div>
          <span className="font-semibold">Access frontage:</span>{" "}
          <span className="font-mono">{access.road_name}</span>
          {access.distance_ft != null ? <span className="opacity-80"> · {access.distance_ft} ft</span> : null}
        </div>
      ) : null}
      <div>
        <span className="font-semibold">FCC BDC fiber providers in block group:</span>{" "}
        <span className="font-mono">{fcc?.provider_count ?? NA}</span>
      </div>
      {providers.length ? (
        <div className="text-xs">
          <span className="font-semibold">Providers to call (state-reported):</span>{" "}
          <span className="font-mono">{providers.slice(0, 12).join(" · ")}</span>
          {providers.length > 12 ? <span className="opacity-80"> +{providers.length - 12} more</span> : null}
        </div>
      ) : null}
      <div className="text-[11px] opacity-80">
        Sources: OpenStreetMap telecom assets, FCC Broadband Data Collection. Proximity does not confirm
        service — availability and splice access require provider or field confirmation.
      </div>
    </div>
  );
}