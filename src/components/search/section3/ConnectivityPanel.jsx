/**
 * ConnectivityPanel — CarrierFinder connectivity intel for Section 3 targets.
 *
 * ADDITIVE, display-only. Renders one card per target column (A/B/C) with the
 * serving telco central office (CLLI / LATA / CO address) and the backhaul
 * carriers available in that target's ZIP. Fires the `carrierfinder` edge
 * function lazily when expanded — never blocks the base target pipeline, never
 * writes back into it.
 *
 * Data source: get_telcoinfo(geo) + get_carriers_by_zip via carrierFinder.js.
 */

import { useState, useCallback } from "react";
import { Waypoints, Building2, Radio, ChevronDown, Loader2 } from "lucide-react";
import { carrierFinderTarget, normalizeCarrierFinder, zipFromAddress } from "@/lib/carrierFinder";

const COLS = ["Target A", "Target B", "Target C"];
const HEADER_GREEN = "#628C83";

function CarrierBadge({ c }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border border-orange-400/50 bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-300">
      <Radio className="w-3 h-3" />
      {c.name}
      <span className="text-orange-500/70">· {c.type}</span>
    </span>
  );
}

function TargetConnCard({ colIdx, target }) {
  const [state, setState] = useState("idle"); // idle | loading | done | empty | error
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const lat = target?.latitude;
  const lon = target?.longitude;
  const zip = zipFromAddress(target?.parcel_address) || zipFromAddress(target?.mailing_address);

  const load = useCallback(async () => {
    if (state === "loading" || state === "done") return;
    setState("loading");
    try {
      const raw = await carrierFinderTarget(lat, lon, zip);
      const norm = normalizeCarrierFinder(raw);
      if (!norm) {
        setState("empty");
      } else {
        setData(norm);
        setState("done");
      }
    } catch {
      setState("error");
    }
  }, [lat, lon, zip, state]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && state === "idle") load();
  };

  if (!target) {
    return <div className="px-3 py-3 text-xs text-muted-foreground border-r border-border last:border-r-0">—</div>;
  }

  return (
    <div className="px-3 py-3 border-r border-border last:border-r-0 text-sm">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 font-semibold text-foreground hover:text-orange-700 dark:hover:text-orange-300"
      >
        <span className="flex items-center gap-1.5">
          <Waypoints className="w-4 h-4 text-orange-600" />
          {COLS[colIdx]} Connectivity
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {state === "loading" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pulling fiber &amp; telco…
            </div>
          )}
          {state === "empty" && (
            <div className="text-xs text-muted-foreground">No CarrierFinder data for this location.</div>
          )}
          {state === "error" && (
            <div className="text-xs text-amber-700 dark:text-amber-300">Connectivity lookup unavailable.</div>
          )}

          {state === "done" && data && (
            <>
              {data.serving_office && (
                <div className="rounded-md border border-emerald-400/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300 text-xs">
                    <Building2 className="w-3.5 h-3.5" /> Serving Central Office
                  </div>
                  <div className="text-sm text-foreground font-medium">{data.serving_office.telco}</div>
                  {data.serving_office.parent && (
                    <div className="text-xs text-muted-foreground">Parent: {data.serving_office.parent}</div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {data.serving_office.clli && <span>CLLI: <span className="font-mono text-foreground">{data.serving_office.clli}</span></span>}
                    {data.serving_office.lata && <span>LATA: {data.serving_office.lata}</span>}
                    {data.serving_office.npanxx && <span>NPA-NXX: {data.serving_office.npanxx}</span>}
                  </div>
                  {data.serving_office.co_address && (
                    <div className="text-[11px] text-muted-foreground">CO: {data.serving_office.co_address}</div>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-foreground mb-1.5">
                  Backhaul Carriers
                  <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                    ({data.backhaul.length} of {data.total_carriers} in ZIP)
                  </span>
                </div>
                {data.backhaul.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.backhaul.map((c, i) => <CarrierBadge key={i} c={c} />)}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    No fixed-wireless / DLEC / datacenter carriers listed{data.total_carriers ? ` (${data.total_carriers} total carriers in ZIP)` : ""}.
                  </div>
                )}
              </div>

              <div className="text-[10px] text-muted-foreground/70 pt-0.5">Source: CarrierFinder</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConnectivityPanel({ targets = [] }) {
  const hasAny = targets.some(Boolean);
  if (!hasAny) return null;

  return (
    <div className="border-t border-border">
      <div
        className="grid"
        style={{ gridTemplateColumns: "200px repeat(3, minmax(220px, 1fr))" }}
      >
        <div
          className="px-4 py-3 font-bold text-white border-r border-border text-sm flex items-center gap-1.5"
          style={{ backgroundColor: HEADER_GREEN }}
        >
          <Waypoints className="w-4 h-4" /> Connectivity
        </div>
        {[0, 1, 2].map((colIdx) => (
          <TargetConnCard key={colIdx} colIdx={colIdx} target={targets[colIdx]} />
        ))}
      </div>
    </div>
  );
}
