import { useState } from "react";
import { Phone, Globe, Zap, Cable, MapPin } from "lucide-react";

/**
 * InfraCallCard — the "who do I call" panel for the ACTIVE target of the Hawk
 * Infrastructure Vision map. Two lanes:
 *   POWER — electric utility resolved for the target coordinates (name/phone/site).
 *   FIBER — FCC BDC availability summary for the target's block group + the
 *           providers the FCC reports publishing fixed-broadband coverage in the
 *           state. Provenance is stated verbatim; nothing is inferred as
 *           parcel-level service.
 */
export default function InfraCallCard({ targetLabel, targetA, utility, coverage }) {
  const [showAll, setShowAll] = useState(false);

  const providers = coverage?.provider_names || [];
  const shown = showAll ? providers : providers.slice(0, 10);
  const geo = coverage?.coverage?.geo || null;
  const fiber = coverage?.coverage?.fiber || null;
  const blockProviderCount = coverage?.provider_count;

  return (
    <div className="border-b border-border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-4 text-slate-100">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="rounded-md bg-cyan-500/15 px-2 py-0.5 text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-300">
          WHO TO CALL · {targetLabel || "TARGET A"}
        </span>
        {(targetA?.parcel_address || targetA?.owner) && (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="h-3 w-3" /> {targetA?.parcel_address || targetA?.owner}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* POWER lane */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-300">
            <Zap className="h-3.5 w-3.5" /> Electric service
          </div>
          {utility ? (
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-white">{utility.name}</div>
              {utility.type && <div className="text-[11px] text-slate-400">{utility.type}</div>}
              <div className="flex flex-wrap gap-3 pt-1 text-xs">
                {utility.phone ? (
                  <a href={`tel:${utility.phone}`} className="flex items-center gap-1.5 font-mono text-amber-200 hover:underline">
                    <Phone className="h-3.5 w-3.5" /> {utility.phone}
                  </a>
                ) : (
                  <span className="text-slate-500">Phone — no data available (HIFLD)</span>
                )}
                {utility.website && (
                  <a href={utility.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-amber-200 hover:underline">
                    <Globe className="h-3.5 w-3.5" /> Website
                  </a>
                )}
              </div>
              {utility.address && <div className="text-[11px] text-slate-400">{utility.address}</div>}
            </div>
          ) : (
            <div className="text-xs text-slate-500">No utility record returned for these coordinates.</div>
          )}
          <div className="mt-2 border-t border-amber-500/20 pt-1.5 text-[10px] text-slate-500">
            Source: HIFLD electric retail service territory
          </div>
        </div>

        {/* FIBER lane */}
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-cyan-300">
            <Cable className="h-3.5 w-3.5" /> Fiber / backhaul
          </div>
          {fiber ? (
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="font-mono text-cyan-200">{fiber.servedPct}% of block-group locations served by fiber</span>
              <span className="font-mono text-slate-400">
                {blockProviderCount == null ? "No data" : blockProviderCount} fiber provider(s) reported in the block group
              </span>
            </div>
          ) : (
            <div className="mb-2 text-xs text-slate-500">No FCC block-group availability record found.</div>
          )}

          {providers.length > 0 ? (
            <>
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                FCC-reported fixed-broadband providers in {geo?.stateName || "this state"} ({providers.length})
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {shown.map((name) => (
                  <li key={name} className="rounded-md border border-cyan-500/25 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200">
                    {name}
                  </li>
                ))}
              </ul>
              {providers.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 text-[11px] font-semibold text-cyan-300 hover:underline"
                >
                  {showAll ? "Show fewer" : `Show all ${providers.length} providers`}
                </button>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-500">No provider list published for this state.</div>
          )}

          <div className="mt-2 border-t border-cyan-500/20 pt-1.5 text-[10px] leading-4 text-slate-500">
            Source: FCC Broadband Data Collection{coverage?.source?.as_of_date ? ` · as of ${coverage.source.as_of_date}` : ""}.
            Provider list is statewide and availability is an area summary — confirm service at the parcel directly.
          </div>
        </div>
      </div>
    </div>
  );
}