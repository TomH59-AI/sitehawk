import { COLOR_HEX, ftToMiles } from "@/lib/aiEquation";

// Candidate comparison table — saved AI Equation candidates vs Target A.
export default function AIEquationComparison({ candidates, targetA }) {
  if (!candidates?.length) return null;

  const green = candidates.filter((c) => c.color === "green").sort((a, b) => (b.maxHeightFt || 0) - (a.maxHeightFt || 0));
  const yellow = candidates.filter((c) => c.color === "yellow").sort((a, b) => (b.maxHeightFt || 0) - (a.maxHeightFt || 0));
  const bestCompliantId = green[0]?.id;
  const bestConditionalId = yellow[0]?.id;

  const rows = [
    targetA && {
      id: "__targetA", name: "Target A (SiteHawk recommendation)", parcelId: targetA.apn || "—",
      lat: targetA.latitude, lon: targetA.longitude, isTargetA: true,
    },
    ...candidates,
  ].filter(Boolean);

  const mi = (ft) => (ft == null ? "—" : `${ftToMiles(ft).toFixed(2)} mi`);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="text-sm font-heading font-bold text-foreground">Candidate Comparison</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-3">Candidate</th>
              <th className="py-1.5 pr-3">Parcel ID</th>
              <th className="py-1.5 pr-3">Base coords</th>
              <th className="py-1.5 pr-3">Req. ht</th>
              <th className="py-1.5 pr-3">Max ht</th>
              <th className="py-1.5 pr-3">Status</th>
              <th className="py-1.5 pr-3">Approval</th>
              <th className="py-1.5 pr-3">PE letter</th>
              <th className="py-1.5 pr-3">From carrier</th>
              <th className="py-1.5 pr-3">From Target A</th>
              <th className="py-1.5">Failures / missing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-border/50 align-top">
                <td className="py-1.5 pr-3 font-medium text-foreground whitespace-nowrap">
                  {c.name}
                  {c.id === bestCompliantId && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 font-bold">Best compliant</span>}
                  {c.id === bestConditionalId && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-bold">Best conditional</span>}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">{c.parcelId || "—"}</td>
                <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">{Number.isFinite(c.lat) ? `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}` : "—"}</td>
                <td className="py-1.5 pr-3">{c.requestedHeightFt ? `${Math.round(c.requestedHeightFt)} ft` : "—"}</td>
                <td className="py-1.5 pr-3">{c.maxHeightFt != null ? `${Math.round(c.maxHeightFt)} ft` : "—"}</td>
                <td className="py-1.5 pr-3">
                  {c.isTargetA ? (
                    <span className="text-primary font-bold">Target A</span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-bold text-white" style={{ background: COLOR_HEX[c.color] }}>
                      {c.color === "red" ? "Not currently feasible" : c.color === "yellow" ? "Review" : "Compliant"}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">{c.approvalType || "—"}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{c.peResult ? (c.peResult === "pass" ? "Pass w/ PE" : "Fail w/ PE") : "—"}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{mi(c.distFromCarrierFt)}</td>
                <td className="py-1.5 pr-3 text-muted-foreground">{c.isTargetA ? "0.00 mi" : mi(c.distFromTargetAFt)}</td>
                <td className="py-1.5 text-muted-foreground max-w-[260px]">
                  {[...(c.failing || []), ...(c.missing || [])].slice(0, 2).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}