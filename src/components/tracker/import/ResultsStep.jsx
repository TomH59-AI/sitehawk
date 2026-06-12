import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadRowsCsv } from "@/lib/trackerImport";
import { TRACKER_GREEN } from "@/lib/hawkTracker";

// Step 4 — results summary with one-click download of skipped/warning rows.
export default function ResultsStep({ results }) {
  const { created, updated, skipped, warnings } = results;
  const issueRows = [
    ...skipped,
    ...warnings.map((w) => ({ rowNum: w.rowNum, reason: w.warnings.join("; "), data: w.data, raw: [] })),
  ];

  return (
    <div className="space-y-4 text-center py-4">
      <CheckCircle2 className="w-12 h-12 mx-auto" style={{ color: TRACKER_GREEN }} />
      <div className="font-heading font-bold text-lg text-foreground">
        {created} site{created !== 1 ? "s" : ""} imported · {skipped.length} duplicate{skipped.length !== 1 ? "s" : ""} skipped · {warnings.length} row{warnings.length !== 1 ? "s" : ""} with warnings
      </div>
      {updated > 0 && <div className="text-sm text-muted-foreground">{updated} existing site{updated !== 1 ? "s" : ""} updated.</div>}

      {issueRows.length > 0 && (
        <>
          <div className="rounded-lg border border-border bg-muted/30 p-2 max-h-40 overflow-auto text-left">
            {issueRows.map((s, i) => (
              <div key={i} className="text-[11px] text-muted-foreground">
                Row {s.rowNum}: {s.reason}{s.data?.site_name ? ` — "${s.data.site_name}"` : ""}
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => downloadRowsCsv(issueRows)}>
            <Download className="w-4 h-4 mr-1" /> Download skipped/warning rows as CSV
          </Button>
        </>
      )}
    </div>
  );
}