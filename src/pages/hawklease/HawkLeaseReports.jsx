import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Download, FileText, Calendar, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";

function exportCSV(rows, filename, headers, getRow) {
  const lines = [headers.join(","), ...rows.map(r => getRow(r).map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function HawkLeaseReports() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.HawkLeaseSite.list("-lease_execution_date", 500).then(data => {
      setSites(Array.isArray(data) ? data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const executed = sites.filter(s => s.status === "Executed" || s.status === "Active");
  const activeRent = executed.filter(s => s.base_monthly_rent > 0);
  const totalMonthly = activeRent.reduce((sum, s) => sum + (s.base_monthly_rent || 0), 0);

  const exportExecuted = () => exportCSV(executed, "executed_leases.csv",
    ["Site Name", "Address", "City", "State", "Carrier", "Execution Date", "$/Mo", "Term (yrs)", "Escalation"],
    s => [s.site_name, s.property_address, s.city, s.state, s.carrier, s.lease_execution_date ? new Date(s.lease_execution_date).toLocaleDateString() : "", s.base_monthly_rent || "", s.initial_term_years || "", `${s.escalation_value || ""}% ${s.escalation_frequency || ""}`]
  );

  const now = new Date();
  const in180 = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
  const optionSites = sites.filter(s => s.next_option_date && new Date(s.next_option_date) >= now && new Date(s.next_option_date) <= in180);

  const exportOptions = () => exportCSV(optionSites, "option_schedule.csv",
    ["Site Name", "Carrier", "State", "Next Option Date", "$/Mo", "Renewal Term (yrs)"],
    s => [s.site_name, s.carrier, s.state, s.next_option_date ? new Date(s.next_option_date).toLocaleDateString() : "", s.base_monthly_rent || "", s.renewal_term_years || ""]
  );

  const exportRentRoll = () => exportCSV(activeRent, "rent_roll.csv",
    ["Site Name", "Address", "City", "State", "Carrier", "Status", "Base Monthly Rent", "Annual Rent", "Escalation", "Esc Freq", "Landlord"],
    s => [s.site_name, s.property_address, s.city, s.state, s.carrier, s.status, s.base_monthly_rent || 0, (s.base_monthly_rent || 0) * 12, `${s.escalation_value || ""}%`, s.escalation_frequency || "", s.landlord_name || ""]
  );

  const cards = [
    {
      icon: FileText,
      title: "Executed Leases",
      desc: `${executed.length} executed/active lease records`,
      action: exportExecuted,
      label: "Export CSV",
      color: "text-emerald-600",
    },
    {
      icon: Calendar,
      title: "Option Schedule",
      desc: `${optionSites.length} options due in next 180 days`,
      action: exportOptions,
      label: "Export CSV",
      color: "text-amber-600",
    },
    {
      icon: DollarSign,
      title: "Rent Roll",
      desc: `${activeRent.length} sites · $${totalMonthly.toLocaleString()}/mo total`,
      action: exportRentRoll,
      label: "Export CSV",
      color: "text-blue-600",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-semibold text-foreground mb-1">Reports & Exports</h2>
        <p className="text-sm text-muted-foreground">Export executed leases, option schedules, and rent roll to CSV.</p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {cards.map(card => (
            <div key={card.title} className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className={`w-10 h-10 rounded-lg bg-secondary flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div>
                <div className="font-heading font-semibold text-foreground">{card.title}</div>
                <div className="text-sm text-muted-foreground mt-0.5">{card.desc}</div>
              </div>
              <Button size="sm" variant="outline" onClick={card.action} className="w-full">
                <Download className="w-4 h-4 mr-1" /> {card.label}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
        <strong>Note:</strong> Reports export all records accessible to your account. Data reflects the current state of HawkLeaseSite records.
      </div>
    </div>
  );
}