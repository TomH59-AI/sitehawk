import { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MappingStep from "./MappingStep";
import PreviewStep from "./PreviewStep";
import ResultsStep from "./ResultsStep";
import SiteHawkTemplateCard from "./SiteHawkTemplateCard";
import { parseImportFile, autoMapHeaders, buildImportPlan, buildBackfillRows, MAX_ROWS } from "@/lib/trackerImport";
import { TRACKER_GREEN } from "@/lib/hawkTracker";

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));

// Hawk Tracker CSV/XLSX import wizard — Upload → Map → Preview → Confirm/Results.
// Nothing writes before the Confirm click; every skipped row is reported.
export default function ImportWizard({ existingSites, onClose, onDone }) {
  const [step, setStep] = useState("upload");
  const [parsed, setParsed] = useState(null);          // { headers, rows, sheetName, truncated, multiSheet }
  const [mapping, setMapping] = useState({});           // { colIndex: fieldKey | "notes_append" | "ignore" }
  const [confidence, setConfidence] = useState({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const p = await parseImportFile(file);
      if (!p.headers.length || !p.rows.length) {
        toast.error("No data rows found in that file.");
        return;
      }
      const auto = autoMapHeaders(p.headers);
      const m = {}, c = {};
      Object.entries(auto).forEach(([i, v]) => { m[i] = v.field; c[i] = v.confidence; });
      setParsed(p);
      setMapping(m);
      setConfidence(c);
      setStep("map");
    } catch (err) {
      console.error(err);
      toast.error("Could not read that file — make sure it's a valid .csv or .xlsx.");
    }
  };

  const plan = useMemo(() => {
    if (!parsed) return null;
    const fieldMapping = {}, notesCols = [];
    Object.entries(mapping).forEach(([i, v]) => {
      if (v === "notes_append") notesCols.push(Number(i));
      else if (v && v !== "ignore") fieldMapping[i] = v;
    });
    return buildImportPlan({
      headers: parsed.headers, rows: parsed.rows, mapping: fieldMapping,
      notesCols, existingSites, updateExisting,
    });
  }, [parsed, mapping, existingSites, updateExisting]);

  const hasSiteName = Object.values(mapping).includes("site_name");

  const runImport = async () => {
    setImporting(true);
    try {
      let created = 0, updated = 0;
      const warnings = [...plan.creates, ...plan.updates].filter((r) => r.warnings.length);

      // Create sites in small parallel batches, then backfill milestones in bulk.
      const allMilestones = [];
      for (const batch of chunk(plan.creates, 10)) {
        const sites = await Promise.all(batch.map((r) => {
          const data = { ...r.data };
          if (!data.target_on_air) delete data.target_on_air;
          if (data.latitude == null) { delete data.latitude; delete data.longitude; }
          return base44.entities.HawkTrackerSite.create(data);
        }));
        sites.forEach((site, i) => {
          allMilestones.push(...buildBackfillRows(site.id, batch[i].data.current_status));
        });
        created += sites.length;
      }
      for (const batch of chunk(allMilestones, 190)) {
        await base44.entities.HawkTrackerMilestone.bulkCreate(batch);
      }

      // Update existing sites (status/notes only — never silent overwrite of the rest).
      for (const u of plan.updates) {
        const patch = { current_status: u.data.current_status };
        if (u.data.notes) {
          patch.notes = [u.existing.notes, u.data.notes].filter(Boolean).join("\n");
        }
        if (u.data.is_blocked) { patch.is_blocked = true; patch.blocked_reason = u.data.blocked_reason; }
        await base44.entities.HawkTrackerSite.update(u.existing.id, patch);
        updated += 1;
      }

      setResults({ created, updated, skipped: plan.skipped, warnings });
      setStep("results");
      onDone?.();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Import failed — nothing partial was hidden; re-check and retry.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 flex items-center justify-between text-white sticky top-0 z-10" style={{ background: TRACKER_GREEN }}>
          <div className="font-heading font-bold text-sm">
            Import Sites — {step === "upload" ? "1. Upload" : step === "map" ? "2. Map Columns" : step === "preview" ? "3. Preview" : "4. Results"}
          </div>
          <button onClick={onClose} className="hover:opacity-70"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4">
          {step === "upload" && (
            <>
            <div
              className="rounded-xl border-2 border-dashed border-border p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
            >
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <div className="font-semibold text-foreground text-sm">Drop your tracking spreadsheet here, or click to browse</div>
              <div className="text-xs text-muted-foreground mt-1">.csv or .xlsx · first row = headers · max {MAX_ROWS} rows</div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            </div>
            <SiteHawkTemplateCard />
            </>
          )}

          {step === "map" && parsed && (
            <>
              {(parsed.multiSheet || parsed.truncated) && (
                <div className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1">
                  {parsed.multiSheet ? `Multi-sheet file — importing sheet "${parsed.sheetName}" only. ` : ""}
                  {parsed.truncated ? `File exceeds ${MAX_ROWS} rows — only the first ${MAX_ROWS} were loaded.` : ""}
                </div>
              )}
              <MappingStep
                headers={parsed.headers} rows={parsed.rows}
                mapping={mapping} confidence={confidence}
                onChange={(i, v) => setMapping((p) => ({ ...p, [i]: v }))}
              />
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" onClick={() => setStep("upload")}>Back</Button>
                <Button size="sm" style={{ background: TRACKER_GREEN }} disabled={!hasSiteName} onClick={() => setStep("preview")}>
                  {hasSiteName ? "Preview Import" : "Map a Site Name column first"}
                </Button>
              </div>
            </>
          )}

          {step === "preview" && plan && (
            <>
              <PreviewStep plan={plan} updateExisting={updateExisting} onToggleUpdate={(v) => setUpdateExisting(!!v)} />
              <div className="flex justify-between mt-4">
                <Button variant="outline" size="sm" onClick={() => setStep("map")}>Back</Button>
                <Button size="sm" style={{ background: TRACKER_GREEN }} disabled={importing || (plan.creates.length + plan.updates.length === 0)} onClick={runImport}>
                  {importing ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4 mr-1" /> Import {plan.creates.length + plan.updates.length} Sites</>}
                </Button>
              </div>
            </>
          )}

          {step === "results" && results && (
            <>
              <ResultsStep results={results} />
              <div className="flex justify-end mt-2">
                <Button size="sm" style={{ background: TRACKER_GREEN }} onClick={onClose}>Done</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}