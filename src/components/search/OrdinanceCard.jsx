import { FileText, AlertCircle } from "lucide-react";

export default function OrdinanceCard({ ordinance }) {
  if (!ordinance) return null;

  const entries = Object.entries(ordinance).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h3 className="font-heading font-semibold text-foreground text-sm">Local Ordinance Data</h3>
          <p className="text-xs text-muted-foreground">Zoning & regulatory context for this area</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-lg bg-background/40 border border-border/50 px-3 py-2">
            <p className="text-xs text-muted-foreground capitalize mb-0.5">{key.replace(/_/g, " ")}</p>
            <p className="text-xs font-medium text-foreground break-words">{String(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}