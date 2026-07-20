import { Landmark, Droplets, Waves, AlertTriangle, ShieldCheck } from "lucide-react";

// Summary stat cards for the Compliance Dashboard. `stats` computed by the page.
export default function ComplianceDashboardStats({ stats, activeFilter, onFilter }) {
  const CARDS = [
    { key: "all", label: "Tracked Sites", value: stats.total, icon: ShieldCheck, color: "text-primary", bg: "bg-primary/10" },
    { key: "tribal", label: "Tribal Land Flags", value: stats.tribal, icon: Landmark, color: "text-amber-600", bg: "bg-amber-500/10" },
    { key: "wetlands", label: "Wetland Flags", value: stats.wetlands, icon: Droplets, color: "text-sky-600", bg: "bg-sky-500/10" },
    { key: "floodplain", label: "Floodplain Flags", value: stats.floodplain, icon: Waves, color: "text-indigo-600", bg: "bg-indigo-500/10" },
    { key: "flagged", label: "Any NEPA Trigger", value: stats.flagged, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {CARDS.map((c) => (
        <button
          key={c.key}
          onClick={() => onFilter(c.key)}
          className={`rounded-xl border p-4 text-left transition-all ${
            activeFilter === c.key ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
          }`}
        >
          <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
            <c.icon className={`w-4 h-4 ${c.color}`} />
          </div>
          <div className="font-heading font-bold text-2xl text-foreground">{c.value}</div>
          <div className="text-xs text-muted-foreground">{c.label}</div>
        </button>
      ))}
    </div>
  );
}