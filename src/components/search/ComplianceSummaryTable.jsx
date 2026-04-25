import { CheckCircle2, XCircle, AlertTriangle, HelpCircle } from "lucide-react";

const statusStyles = {
  permitted: {
    label: "Permitted",
    icon: CheckCircle2,
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  prohibited: {
    label: "Prohibited",
    icon: XCircle,
    className: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  conditional: {
    label: "Conditional",
    icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  },
  not_addressed: {
    label: "Not addressed",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
  },
};

export default function ComplianceSummaryTable({ summary }) {
  if (!Array.isArray(summary) || summary.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-background/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-card/70">
        <h4 className="font-heading font-semibold text-sm text-foreground">Compliance Summary</h4>
        <p className="text-xs text-muted-foreground mt-0.5">Simplified tower-type guidance from the extracted ordinance text.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="text-left font-semibold px-4 py-2 min-w-[150px]">Tower Type</th>
              <th className="text-left font-semibold px-4 py-2 min-w-[120px]">Status</th>
              <th className="text-left font-semibold px-4 py-2 min-w-[180px]">Where / Context</th>
              <th className="text-left font-semibold px-4 py-2 min-w-[180px]">Approval Path</th>
              <th className="text-left font-semibold px-4 py-2 min-w-[220px]">Key Limits</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row, index) => {
              const style = statusStyles[row.status] || statusStyles.not_addressed;
              const Icon = style.icon;
              return (
                <tr key={`${row.tower_type || "row"}-${index}`} className="border-t border-border/70 align-top">
                  <td className="px-4 py-3 font-semibold text-foreground">{row.tower_type || "Unknown"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-semibold ${style.className}`}>
                      <Icon className="w-3 h-3" />
                      {style.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.zones_or_context || "N/A"}</td>
                  <td className="px-4 py-3 text-foreground">{row.permit_path || "N/A"}</td>
                  <td className="px-4 py-3 text-foreground">
                    <div>{row.key_limits || row.user_summary || "N/A"}</div>
                    {row.source_ref && <div className="mt-1 text-[11px] text-muted-foreground">Source: {row.source_ref}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}