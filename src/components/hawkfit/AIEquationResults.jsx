import { COLOR_HEX, AI_EQUATION_NOTICE, ftToMiles } from "@/lib/aiEquation";
import { CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";

const COLOR_LABEL = { green: "COMPLIANT", yellow: "REVIEW REQUIRED", red: "NOT FEASIBLE" };

function List({ icon: Icon, tone, items }) {
  if (!items?.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((r, i) => (
        <li key={i} className={`flex items-start gap-2 text-xs ${tone}`}>
          <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

// Live AI Equation results panel — one evaluation of the current cursor point.
export default function AIEquationResults({ evalResult, siteTarget, overlayStats }) {
  if (!evalResult) return null;
  const e = evalResult;
  const hex = COLOR_HEX[e.color];
  const miles = (ft) => (ft == null ? "—" : `${Math.round(ft).toLocaleString()} ft (${ftToMiles(ft).toFixed(2)} mi)`);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-heading font-bold text-foreground">AI Equation Results</div>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold text-white" style={{ background: hex }}>
          {COLOR_LABEL[e.color]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="text-muted-foreground">Parcel</div>
        <div className="text-foreground font-medium truncate">{siteTarget?.parcel_id || siteTarget?.address || "—"}</div>
        <div className="text-muted-foreground">Requested height</div>
        <div className="text-foreground font-medium">{Math.round(e.requestedHeightFt)} ft</div>
        <div className="text-muted-foreground">Max allowed at cursor</div>
        <div className="font-bold" style={{ color: hex }}>{e.maxAllowedHeightFt == null ? "Unknown" : `${Math.round(e.maxAllowedHeightFt)} ft`}</div>
        <div className="text-muted-foreground">Nearest boundary</div>
        <div className="text-foreground font-medium">{e.edgeDistanceFt == null ? "—" : `${Math.round(e.edgeDistanceFt)} ft`}</div>
        <div className="text-muted-foreground">From carrier center</div>
        <div className="text-foreground font-medium">{miles(e.distFromCarrierFt)}</div>
        <div className="text-muted-foreground">From Target A</div>
        <div className="text-foreground font-medium">{miles(e.distFromTargetAFt)}</div>
        <div className="text-muted-foreground">Approval type</div>
        <div className="text-foreground font-medium">{e.approvalType || "Unknown"}</div>
        <div className="text-muted-foreground">Calculated</div>
        <div className="text-foreground font-medium">{e.calculatedAt?.toLocaleTimeString?.() || "—"}</div>
      </div>

      <List icon={XCircle} tone="text-red-600 dark:text-red-400" items={e.failing} />
      <List icon={AlertTriangle} tone="text-amber-600 dark:text-amber-400" items={e.conditional} />
      <List icon={HelpCircle} tone="text-amber-600 dark:text-amber-400" items={e.missing} />
      <List icon={CheckCircle2} tone="text-emerald-600 dark:text-emerald-400" items={e.passing} />

      {e.peScenario && (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-0.5">
          <div className="font-semibold text-foreground">PE Letter Scenario (not auto-applied)</div>
          <div className="text-muted-foreground">Standard compliance: <b className={e.color === "green" ? "text-emerald-600" : "text-red-600"}>{e.color === "green" ? "Pass" : "Fail"}</b></div>
          <div className="text-muted-foreground">
            Potential compliance with PE letter: <b className={e.peScenario.result === "pass" ? "text-emerald-600" : "text-red-600"}>{e.peScenario.result === "pass" ? "Pass" : "Fail"}</b>
          </div>
          <div className="text-muted-foreground">{e.peScenario.detail}</div>
        </div>
      )}

      {overlayStats && (
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-0.5">
          <div className="font-semibold text-foreground">Buildable Area</div>
          <div className="text-muted-foreground">Parcel: {overlayStats.parcelAcres.toFixed(2)} ac · Buildable: {overlayStats.buildableAcres.toFixed(2)} ac ({overlayStats.buildablePct.toFixed(0)}%)</div>
          {overlayStats.bestPoint && (
            <div className="text-muted-foreground">
              Best base point: {overlayStats.bestPoint.lat.toFixed(6)}, {overlayStats.bestPoint.lon.toFixed(6)} — max {overlayStats.bestPoint.maxHeightFt} ft, {overlayStats.bestPoint.edgeDistanceFt} ft to nearest restriction.
            </div>
          )}
          {overlayStats.conditional && <div className="text-amber-600 dark:text-amber-400">Overlay shown yellow — ordinance data incomplete; manual review required.</div>}
        </div>
      )}

      {!!e.citations?.length && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div className="font-semibold text-foreground text-xs">Ordinance Sources</div>
          {e.citations.filter((c) => c.citation || c.url).map((c, i) => (
            <div key={i}>
              {c.rule}: {c.citation || "—"}{" "}
              {c.url && <a href={c.url} target="_blank" rel="noreferrer" className="text-primary underline">source</a>}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed border-t border-border pt-2">{AI_EQUATION_NOTICE}</p>
    </div>
  );
}