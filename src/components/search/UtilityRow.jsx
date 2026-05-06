import { Zap, ExternalLink } from "lucide-react";

const TYPE_STYLES = {
  "INVESTOR OWNED":     { label: "IOU",          color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  "MUNICIPAL":          { label: "Municipal",    color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  "COOPERATIVE":        { label: "Co-op",        color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  "POLITICAL SUBDIVISION": { label: "Political", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  "FEDERAL":            { label: "Federal",      color: "bg-red-500/10 text-red-500 border-red-500/20" },
  "STATE":              { label: "State",        color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
};

function fmtCustomers(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function UtilityRow({ result }) {
  if (!result.power_utility) return null;

  const typeMeta = TYPE_STYLES[result.utility_type] || null;
  const customers = fmtCustomers(result.utility_customers);
  const showHolding = result.utility_holding_company && result.utility_holding_company !== result.power_utility;

  return (
    <div className="sm:col-span-2">
      <div className="flex items-start gap-2">
        <Zap className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Electric Utility:</span>
            <span className="text-foreground font-semibold">{result.power_utility}</span>
            {typeMeta && (
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wide ${typeMeta.color}`}>
                {typeMeta.label}
              </span>
            )}
            {result.utility_control_area && (
              <span className="px-1.5 py-0.5 rounded border border-border bg-secondary/60 text-[10px] font-mono text-muted-foreground">
                {result.utility_control_area}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
            {showHolding && <span>Parent: <span className="text-foreground/80 font-medium">{result.utility_holding_company}</span></span>}
            {customers && <span>{customers} customers</span>}
            {result.utility_phone && <span className="text-foreground/80">{result.utility_phone}</span>}
            {result.utility_website && (
              <a
                href={result.utility_website.startsWith("http") ? result.utility_website : `http://${result.utility_website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Website <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {result.utility_overlapping?.length > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Also serviced by: {result.utility_overlapping.map(o => o.name).join(", ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}