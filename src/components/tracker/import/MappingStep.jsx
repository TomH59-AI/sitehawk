import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TARGET_FIELDS } from "@/lib/trackerImport";

// Step 2 — column mapping. Auto-matched columns are pre-selected with a
// confidence badge; user can re-map any column, append it to Notes, or ignore it.
export default function MappingStep({ headers, rows, mapping, confidence, onChange }) {
  const sampleFor = (i) => {
    for (const r of rows) {
      const v = String(r[i] ?? "").trim();
      if (v) return v;
    }
    return "";
  };
  const usedFields = new Set(Object.values(mapping).filter((f) => f && f !== "notes_append" && f !== "ignore"));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Match your spreadsheet columns to Hawk Tracker fields. Unmapped columns can be appended to Notes so nothing is lost.
      </p>
      <div className="rounded-lg border border-border divide-y divide-border max-h-[50vh] overflow-auto">
        {headers.map((h, i) => {
          const val = mapping[i] || "ignore";
          const conf = confidence[i];
          return (
            <div key={i} className="px-3 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{h || `Column ${i + 1}`}</div>
                <div className="text-[11px] text-muted-foreground truncate">e.g. "{sampleFor(i) || "—"}"</div>
              </div>
              {val !== "ignore" && val !== "notes_append" && conf && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${conf === "high" ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-amber-50 text-amber-700 border-amber-300"}`}>
                  {conf === "high" ? "auto" : "check"}
                </span>
              )}
              <Select value={val} onValueChange={(v) => onChange(i, v)}>
                <SelectTrigger className="w-52 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignore">— Ignore —</SelectItem>
                  <SelectItem value="notes_append">Append to Notes</SelectItem>
                  {TARGET_FIELDS.map((f) => (
                    <SelectItem key={f.key} value={f.key} disabled={usedFields.has(f.key) && mapping[i] !== f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </div>
  );
}