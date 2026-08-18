/**
 * HawkFill — AI-powered document field-fill workflow.
 * Calls the Supabase edge function hawkfill-engine with the user's bearer token.
 */
import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { FileText, Upload, CheckCircle2, Download, AlertTriangle, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import HawkFillSitePicker from "@/components/hawkfill/HawkFillSitePicker";
import HawkFillMappingReview from "@/components/hawkfill/HawkFillMappingReview";

const ENGINE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/hawkfill-engine";

const ACCEPTED = ".xlsx,.docx,.pdf";
const ACCEPT_LABEL = "XLSX (enabled), DOCX / PDF (Phase 2)";

function FileDrop({ file, setFile }) {
  const inputRef = useRef();
  const [dragging, setDragging] = useState(false);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
      {file ? (
        <p className="text-sm font-semibold text-foreground">{file.name}</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-foreground">Drop a file or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">{ACCEPT_LABEL}</p>
        </>
      )}
    </div>
  );
}

export default function HawkFill() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not authed
  const [file, setFile] = useState(null);
  const [selectedSite, setSelectedSite] = useState(null); // { site_id, site_data }
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // engine JSON response
  const [fieldMap, setFieldMap] = useState({}); // possibly edited mapping
  const [phase, setPhase] = useState("upload"); // upload | mapping | done

  // Load current user once
  useState(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <LogIn className="w-10 h-10 text-muted-foreground" />
        <h2 className="font-heading font-bold text-xl">Sign In Required</h2>
        <p className="text-muted-foreground text-sm">Please sign in to use HawkFill.</p>
        <Button onClick={() => window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`)}>Sign In</Button>
      </div>
    );
  }

  const token = appParams?.token;

  const handleSubmit = async (overrideMap) => {
    if (!file) { toast.error("Please select a file."); return; }
    if (!token) { toast.error("No auth token found — please sign in again."); return; }

    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (selectedSite?.site_id) form.append("site_id", selectedSite.site_id);
      if (selectedSite?.site_data) form.append("site_data", JSON.stringify(selectedSite.site_data));
      form.append("save_template", saveTemplate ? "true" : "false");
      if (saveTemplate && templateName.trim()) form.append("template_name", templateName.trim());
      if (overrideMap && Object.keys(overrideMap).length) {
        form.append("field_map", JSON.stringify(overrideMap));
      }

      const res = await fetch(ENGINE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `Engine returned ${res.status}`);

      setResult(json);
      setFieldMap(json.field_map || {});

      if (json.unmapped?.length) {
        setPhase("mapping");
      } else {
        setPhase("done");
        toast.success(`Filled ${json.filled_count} of ${json.total_fields} fields.`);
      }
    } catch (e) {
      toast.error(e.message || "HawkFill failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleMappingConfirm = (resolvedMap) => {
    setFieldMap(resolvedMap);
    handleSubmit(resolvedMap);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" /> HawkFill
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload the SCIP or form you want filled and HawkFill populates it with your site data automatically. Heads up: SiteHawk's engine is built to industry-standard fields — we may not be able to complete your document fully. We fill every field that matches your SCIP data; anything we can't confidently match is left blank for your review rather than guessed. For the most complete package every time, use the SiteHawk SCIP.
        </p>
      </div>

      {/* ── UPLOAD PHASE ── */}
      {phase === "upload" && (
        <div className="space-y-5">
          {/* File */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-heading font-semibold text-base">1. Upload Document</h2>
            <FileDrop file={file} setFile={setFile} />
            {file?.name?.match(/\.(docx|pdf)$/i) && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>DOCX and PDF support is in Phase 2 — the engine may return a phase-2 status message for this file type.</span>
              </div>
            )}
          </div>

          {/* Site picker */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-heading font-semibold text-base">2. Select Site (optional)</h2>
            <p className="text-xs text-muted-foreground">Choose a SCIP record, deal, or parcel to pre-populate site data.</p>
            <HawkFillSitePicker onSelect={setSelectedSite} selected={selectedSite} />
          </div>

          {/* Template options */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-heading font-semibold text-base">3. Template Settings</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={saveTemplate}
                onChange={(e) => setSaveTemplate(e.target.checked)}
                className="accent-primary w-4 h-4"
              />
              <span className="text-sm">Save field mapping as a reusable template</span>
            </label>
            {saveTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name (e.g. AT&T SCIP Packet)"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>

          <Button
            onClick={() => handleSubmit(null)}
            disabled={!file || loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Processing…" : "Run HawkFill"}
          </Button>
        </div>
      )}

      {/* ── MAPPING REVIEW PHASE ── */}
      {phase === "mapping" && result && (
        <HawkFillMappingReview
          unmapped={result.unmapped || []}
          fieldMap={fieldMap}
          onConfirm={handleMappingConfirm}
          onBack={() => setPhase("upload")}
          loading={loading}
        />
      )}

      {/* ── DONE PHASE ── */}
      {phase === "done" && result && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-500 shrink-0" />
            <div>
              <h2 className="font-heading font-bold text-lg">Document Filled</h2>
              <p className="text-sm text-muted-foreground">
                {result.filled_count} of {result.total_fields} fields populated
                {result.template_reused && " · Template reused ✓"}
              </p>
            </div>
          </div>

          {result.template_reused && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Existing field-map template was reused — no manual mapping needed.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs">Fields filled</p>
              <p className="font-heading font-bold text-xl text-emerald-600">{result.filled_count}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs">Total fields</p>
              <p className="font-heading font-bold text-xl">{result.total_fields}</p>
            </div>
          </div>

          {result.signed_download_url && (
            <a href={result.signed_download_url} target="_blank" rel="noopener noreferrer">
              <Button className="w-full gap-2" size="lg">
                <Download className="w-4 h-4" /> Download Filled Document
              </Button>
            </a>
          )}

          <Button variant="outline" className="w-full" onClick={() => { setPhase("upload"); setResult(null); setFile(null); }}>
            Fill Another Document
          </Button>
        </div>
      )}
    </div>
  );
}