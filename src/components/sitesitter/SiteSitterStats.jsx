import { Card, CardContent } from "@/components/ui/card";
import { formatFt } from "@/lib/siteSitterFeasibility";

// Four headline counters across the rolled-up SiteSitter™ feasibility results.
export default function SiteSitterStats({ summary }) {
  const cells = [
    { label: "Active sites scored", value: String(summary.total) },
    { label: "Buildable (feasible)", value: String(summary.feasible) },
    { label: "Ejected", value: String(summary.ejected) },
    { label: "Best allowable height", value: formatFt(summary.best_height_ft) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-heading text-2xl text-foreground">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}