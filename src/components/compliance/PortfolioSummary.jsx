import { HC } from "./complianceConst";

// Summary cards across all compliance records.
export default function PortfolioSummary({ records }) {
  const stats = {
    total: records.length,
    catex: records.filter((r) => r.nepaDetermination === "CatEx Eligible").length,
    ea: records.filter((r) => r.nepaDetermination === "EA Required").length,
    cleared: records.filter((r) => r.nepaDetermination === "Complete").length,
    adverse: records.filter((r) => (r.shpoRecords || []).some((s) => s.determination === "Adverse Effect")).length,
    action: records.filter((r) =>
      (r.shpoRecords || []).some((s) => s.determination === "Insufficient Information") ||
      (r.thpoRecords || []).some((t) => t.status === "Objection Received")
    ).length,
  };

  const cards = [
    { label: "Total Sites", value: stats.total, color: HC.green },
    { label: "CatEx", value: stats.catex, color: HC.ok },
    { label: "EA Required", value: stats.ea, color: HC.amber },
    { label: "Cleared", value: stats.cleared, color: HC.green },
    { label: "Adverse Effect", value: stats.adverse, color: HC.red },
    { label: "Action Required", value: stats.action, color: HC.orange },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card p-4">
          <div className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{c.label}</div>
        </div>
      ))}
    </div>
  );
}