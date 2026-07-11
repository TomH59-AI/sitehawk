import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { extractLeaseText } from "@/lib/leaseTextExtract";
import { hawkDocAnalyze } from "@/functions/hawkDocAnalyze";
import { hawkFormImport } from "@/functions/hawkFormImport";
import { Loader2, Upload, FileText, ArrowLeft, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// New document screen: pick file (PDF/DOCX), name it, optionally link a SCIP/Target, analyze.
export default function DocUploader({ onBack, onReady, formImport = null }) {
  const [file, setFile] = useState(null);
  const [docName, setDocName] = useState("");
  const [scips, setScips] = useState([]);
  const [scipId, setScipId] = useState("none");
  const [targetIndex, setTargetIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  useEffect(() => {
    base44.entities.ScipRecord.list("-created_date", 100).then(setScips).catch(() => {});
  }, []);

  // Hawk Forms handoff: fetch the official form server-side (agency sites block
  // browser CORS), rebuild it as a File, and stage it so the user only has to
  // (optionally) link a SCIP for pre-fill and hit Analyze.
  useEffect(() => {
    if (!formImport?.importUrl) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setStage("Fetching the form from the agency site...");
      if (formImport.importName) setDocName(formImport.importName);
      try {
        const res = await hawkFormImport({ url: formImport.importUrl });
        const data = res?.data ?? res;
        if (data?.error) throw new Error(data.error);
        const bin = atob(data.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const f = new File([bytes], data.fileName || "form.pdf", { type: "application/pdf" });
        if (cancelled) return;
        setFile(f);
        toast.success("Form loaded. Link a SCIP to pre-fill (optional), then hit Analyze.");
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Couldn't fetch the form automatically - download it from the tab we opened and upload it here.");
        }
      } finally {
        if (!cancelled) { setBusy(false); setStage(""); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedScip = scips.find((s) => s.id === scipId) || null;
  const targets = selectedScip?.parcel_targets || [];

  function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const name = (f.name || "").toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
      toast.error("Upload a PDF or DOCX file.");
      return;
    }
    setFile(f);
    if (!docName) setDocName(f.name.replace(/\.(pdf|docx)$/i, ""));
  }

  async function analyze() {
    if (!file) { toast.error("Choose a PDF or DOCX file first."); return; }
    if (!docName.trim()) { toast.error("Give this document a name."); return; }
    setBusy(true);
    try {
      setStage("Reading the application…");
      const docText = await extractLeaseText(file);
      if (!docText || docText.trim().length < 40) {
        throw new Error("Couldn't read text — this looks like a scanned image. Upload a text-based PDF or DOCX.");
      }

      setStage("Uploading file…");
      const fileType = file.name.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const rec = await base44.entities.HawkDocument.create({
        doc_name: docName.trim(),
        source_file_url: file_url,
        source_file_name: file.name,
        source_file_type: fileType,
        status: "analyzing",
        linked_scip_id: scipId === "none" ? "" : scipId,
        linked_target_index: targetIndex,
      });

      setStage("Hawk is extracting & explaining every field…");
      const res = await hawkDocAnalyze({
        documentId: rec.id,
        docText,
        scipId: scipId === "none" ? "" : scipId,
        targetIndex,
      });
      const data = res?.data ?? res;
      if (data?.error) throw new Error(data.error);

      const fresh = await base44.entities.HawkDocument.get(rec.id);
      toast.success(`Extracted ${fresh.fields?.length || 0} fields.`);
      onReady(fresh);
    } catch (err) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold text-xl">New Application</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Upload a zoning or building-permit application (PDF or Word). Hawk reads it, explains every field, and pre-fills what it can from your SCIP.
        </p>

        <div className="space-y-5">
          <div>
            <Label className="mb-1.5 block">Application file (PDF or DOCX)</Label>
            <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-lg px-4 py-5 cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? <span className="text-foreground font-medium flex items-center gap-1.5"><FileText className="w-4 h-4" />{file.name}</span> : "Click to choose a file"}
              </span>
              <input type="file" accept=".pdf,.docx" className="hidden" onChange={onFile} disabled={busy} />
            </label>
          </div>

          <div>
            <Label htmlFor="docname" className="mb-1.5 block">Document name</Label>
            <Input id="docname" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="e.g. Hillsborough County Tower CUP Application" disabled={busy} />
          </div>

          <div>
            <Label className="mb-1.5 block">Pre-fill from SCIP (optional)</Label>
            <Select value={scipId} onValueChange={(v) => { setScipId(v); setTargetIndex(0); }} disabled={busy}>
              <SelectTrigger><SelectValue placeholder="Choose a SCIP record" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None — I'll fill everything myself</SelectItem>
                {scips.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.site_name || s.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targets.length > 0 && (
            <div>
              <Label className="mb-1.5 block">Target parcel</Label>
              <Select value={String(targetIndex)} onValueChange={(v) => setTargetIndex(Number(v))} disabled={busy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {targets.map((t, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {t.label || `Target ${String.fromCharCode(65 + i)}`}{t.owner_name ? ` — ${t.owner_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={analyze} disabled={busy} className="w-full">
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{stage || "Working…"}</> : <><ScanLine className="w-4 h-4 mr-2" />Analyze Application</>}
          </Button>
        </div>
      </div>
    </div>
  );
}