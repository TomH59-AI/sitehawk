import { PencilRuler } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function ScipSketchSelector({ records, selectedId, onChange }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <PencilRuler className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-heading font-bold text-base">Choose a SCIP site</h2>
          <p className="text-xs text-muted-foreground">The sketch uses that SCIP’s saved Target A parcel geometry and zoning data.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sketch-scip">SCIP record</Label>
        <select
          id="sketch-scip"
          value={selectedId}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.site_name || "Unnamed SCIP"} · {record.submittal_date || "No date"}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}