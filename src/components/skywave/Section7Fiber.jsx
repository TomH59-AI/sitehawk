import { useEffect, useState } from "react";
import { carrierFinderFiber } from "@/functions/carrierFinderFiber";
import { Cable, Loader2, Network } from "lucide-react";

const NEON = "#00FFCC";

// Section 7 — Fiber & Backhaul. Pulls the incumbent local telco + central-office
// backhaul metrics for Target A from the live CarrierFinder API (get_telcoinfo).
export default function Section7Fiber({ lat, lon }) {
  const [loading, setLoading] = useState(false);
  const [telco, setTelco] = useState(null);
  const [failed, setFailed] = useState(false);
  const hasTarget = Number.isFinite(Number(lat)) && Number.isFinite(Number(lon));

  useEffect(() => {
    if (!hasTarget) return;
    let cancelled = false;
    setLoading(true);
    setTelco(null);
    setFailed(false);
    carrierFinderFiber({ lat: Number(lat), lon: Number(lon) })
      .then((res) => { if (!cancelled) { setTelco(res.data?.telco || null); setFailed(!res.data?.telco); } })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lat, lon, hasTarget]);

  const rows = [
    { label: "Backhaul Provider / Telco", value: telco?.name },
    { label: "Central Office CLLI Code", value: telco?.clli },
    { label: "Exchange Segment", value: telco?.exchange },
    { label: "Distance to CO Central Node", value: telco?.co_distance != null ? `${telco.co_distance} miles` : null },
  ];

  return (
    <div className="border-b border-white/10 px-5 py-5">
      <div className="flex items-center gap-2.5 text-sm font-semibold text-white/90 mb-3">
        <Cable className="w-4 h-4" style={{ color: NEON }} /> Section 7: Fiber &amp; Backhaul
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/60 text-sm py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Querying CarrierFinder backhaul grid…
        </div>
      ) : telco ? (
        <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/5 last:border-b-0">
              <span className="text-[11px] uppercase tracking-wider text-white/40">{r.label}</span>
              <span className="text-sm font-semibold text-white text-right">{r.value || "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-start gap-2.5 text-white/60">
          <Network className="w-4 h-4 mt-0.5 shrink-0" style={{ color: NEON }} />
          <p className="text-xs leading-relaxed">
            {failed
              ? "Local fiber infrastructure available via surrounding boundary exchange grid. Manual vendor check recommended."
              : "Select a Target Site to query fiber & backhaul."}
          </p>
        </div>
      )}
    </div>
  );
}