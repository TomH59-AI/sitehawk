import { ExternalLink, ShieldQuestion, ShieldCheck } from "lucide-react";

const TYPE_LABEL = {
  cooperative: "Electric Co-op",
  municipal: "Municipal Utility",
  telco: "Rural Telco",
  regional_carrier: "Regional Carrier",
  data_center: "Data Center / Interconnect",
  unknown: "Unclassified",
};

const TYPE_CLASS = {
  cooperative: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  municipal: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  telco: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  regional_carrier: "bg-violet-500/10 text-violet-600 border-violet-500/30",
  data_center: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export default function FiberOperatorRow({ operator }) {
  const type = operator.operator_type || "unknown";
  const states = operator.states_served || [];
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-foreground">{operator.name}</span>
          {operator.verified ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" title="Verified" />
          ) : (
            <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-muted-foreground" title="Coverage & contact not yet verified" />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={`rounded-full border px-2 py-0.5 ${TYPE_CLASS[type]}`}>{TYPE_LABEL[type]}</span>
          {states.length > 0 ? (
            <span>{states.join(", ")}</span>
          ) : (
            <span className="italic">Coverage not verified</span>
          )}
          {operator.phone && <span>{operator.phone}</span>}
        </div>
        {operator.notes && <p className="mt-1.5 text-xs text-muted-foreground">{operator.notes}</p>}
      </div>
      {operator.website && (
        <a
          href={operator.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-secondary"
        >
          Website <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}