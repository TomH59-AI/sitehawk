import { Globe, Network, Server } from "lucide-react";

/**
 * InfraConnectionPoints — the nearest PHYSICAL fiber handoff locations to the
 * active target: carrier-neutral facilities / carrier hotels / data centers and
 * internet exchange points. Real published PeeringDB coordinates, ranked by
 * crow-flies distance. Nothing is inferred — if the table returns nothing for
 * the search area we say so and name the source.
 */
export default function InfraConnectionPoints({ connection }) {
  const points = connection?.points || [];

  return (
    <div className="border-b border-border bg-slate-950 px-4 py-4 text-slate-100">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-mono font-bold tracking-[0.2em] text-fuchsia-300">
          FIBER CONNECTION POINTS
        </span>
        <span className="text-[11px] text-slate-400">
          Nearest carrier facilities &amp; internet exchanges
          {connection?.search_radius_miles ? ` within ${connection.search_radius_miles} mi` : ""}
        </span>
      </div>

      {points.length === 0 ? (
        <div className="text-xs text-slate-500">
          No data available — no carrier facility or internet exchange is published in this search area
          (source: PeeringDB public API).
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {points.map((p) => (
            <div key={p.id} className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-3">
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-fuchsia-300">
                  {p.point_type === "internet_exchange" ? <Network className="h-3 w-3" /> : <Server className="h-3 w-3" />}
                  {p.point_type === "internet_exchange" ? "Internet exchange" : "Carrier facility"}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-slate-300">{p.distance_miles} mi</span>
              </div>
              <div className="text-sm font-semibold leading-tight text-white">{p.name}</div>
              {p.org_name && <div className="text-[11px] text-slate-400">{p.org_name}</div>}
              {(p.address || p.city) && (
                <div className="mt-1 text-[11px] text-slate-400">
                  {[p.address, p.city, p.state].filter(Boolean).join(", ")}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-400">
                {p.net_count != null && <span>{p.net_count} networks</span>}
                {p.carrier_count != null && <span>{p.carrier_count} carriers</span>}
                {p.ix_count != null && <span>{p.ix_count} exchanges</span>}
                {p.clli && <span>CLLI {p.clli}</span>}
              </div>
              {p.website && (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-fuchsia-200 hover:underline"
                >
                  <Globe className="h-3 w-3" /> Website
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 border-t border-fuchsia-500/20 pt-1.5 text-[10px] leading-4 text-slate-500">
        Source: PeeringDB public API (free with attribution). Coordinates are as published by the facility operator —
        confirm available capacity and pricing with the carrier directly.
      </div>
    </div>
  );
}