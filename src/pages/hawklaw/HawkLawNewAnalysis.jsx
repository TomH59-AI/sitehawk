import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Upload, AlertTriangle, CheckCircle2, Scale, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HAWK_LAW_HEADER } from "../HawkLaw";
import { useBilling } from "@/lib/useBilling";
import UpgradeModal from "@/components/billing/UpgradeModal";

const HAWK_LAW_EDGE_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/hawk-law";
const DISCLAIMER_KEY = "hawklaw_disclaimer_acked";

// Extract text from uploaded file using FileReader + pdfjs/mammoth via base44
async function extractTextFromFile(file) {
  // For TXT files, read directly
  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
  // For DOCX, read as ArrayBuffer and use mammoth
  if (file.name.endsWith(".docx") || file.name.endsWith(".doc")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  // For PDF, use pdfjs-dist
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
  }
  throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
}

function DisclaimerModal({ onAck }) {
  const [checked, setChecked] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-2xl">⚖️</div>
          <h2 className="font-heading font-bold text-xl text-foreground">Welcome to Hawk Law</h2>
        </div>
        <div className="space-y-3 text-sm text-foreground leading-relaxed">
          <p>Hawk Law is an <strong>AI-powered lease analysis tool</strong> built on Anthropic Law, the open-source legal AI framework from Anthropic.</p>
          <p className="text-destructive font-medium">⚠ This is NOT legal advice.</p>
          <p>Hawk Law analyzes lease documents to help you understand key terms, identify red flags, and prepare negotiation positions. It does not replace the advice of a licensed attorney.</p>
          <p>You <strong>must consult a licensed attorney</strong> before executing any agreement.</p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer bg-secondary/30 rounded-xl p-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary shrink-0"
          />
          <span className="text-sm text-foreground">I understand that Hawk Law is an informational tool and that I will consult a licensed attorney before executing any agreement.</span>
        </label>
        <Button onClick={onAck} disabled={!checked} className="w-full">
          <CheckCircle2 className="w-4 h-4 mr-2" /> Acknowledge and Continue
        </Button>
      </div>
    </div>
  );
}

function TriageResultCard({ data }) {
  const triageColor = {
    green: "border-emerald-500/30 bg-emerald-500/5",
    yellow: "border-amber-500/30 bg-amber-500/5",
    red: "border-red-500/30 bg-red-500/5",
  };
  const badge = {
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    yellow: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "bg-red-500/10 text-red-700 dark:text-red-400",
  };
  const label = { green: "✓ Green — Low Risk", yellow: "⚠ Yellow — Moderate Risk", red: "⛔ Red — High Risk" };
  const triage = data.triage_result || data.triage;

  const concerns = data.key_concerns || data.triage_reasons || [];
  const negotiation = data.what_to_negotiate || data.negotiation_items || [];

  return (
    <div className={`border-2 rounded-xl p-5 space-y-4 ${triageColor[triage] || "border-border bg-card"}`}>
      <div className="flex items-center gap-3">
        <span className={`px-4 py-1.5 rounded-full font-bold text-sm ${badge[triage]}`}>
          {label[triage] || triage}
        </span>
        {data.vendor_detected && data.vendor_detected !== "Unknown" && (
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            Vendor: {data.vendor_detected}
          </span>
        )}
      </div>

      {data.triage_summary && (
        <p className="text-sm text-foreground leading-relaxed">{data.triage_summary}</p>
      )}

      {concerns.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Concerns</div>
          <ul className="space-y-1.5">
            {concerns.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-destructive mt-0.5 shrink-0">⚠</span>
                <span className="text-foreground">{typeof c === "string" ? c : c.concern || c.reason || JSON.stringify(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {negotiation.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">What to Negotiate</div>
          <ul className="space-y-1.5">
            {negotiation.map((n, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary mt-0.5 shrink-0">→</span>
                <span className="text-foreground">{typeof n === "string" ? n : n.item || JSON.stringify(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-muted-foreground border-t border-border/50 pt-3">
        {HAWK_LAW_HEADER}
      </div>
    </div>
  );
}

export default function HawkLawNewAnalysis() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillSiteId = searchParams.get("site_id");
  const prefillSiteName = searchParams.get("site_name");

  const [showDisclaimer, setShowDisclaimer] = useState(() => !localStorage.getItem(DISCLAIMER_KEY));
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // null | "extracting" | "uploading" | "analyzing" | "done" | "error"
  const [error, setError] = useState(null);
  const [triageData, setTriageData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [upgradeModal, setUpgradeModal] = useState(null);
  const [inputMode, setInputMode] = useState("upload"); // "upload" | "paste"
  const [pasteText, setPasteText] = useState("");

  const { checkHawkLaw, admin, loading: billingLoading } = useBilling();

  const handleAck = () => {
    localStorage.setItem(DISCLAIMER_KEY, "1");
    setShowDisclaimer(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (inputMode === "upload" && !file) return;
    if (inputMode === "paste" && (!pasteText || pasteText.trim().length < 50)) return;
    setError(null);
    setTriageData(null);

    // Gate: free triage preview or full Hawk Law access
    if (!billingLoading && !admin) {
      const gate = checkHawkLaw(true);
      if (!gate.allowed) {
        setUpgradeModal(gate);
        return;
      }
    }

    try {
      let leaseText = "";
      let fileUrl = null;
      let fileName = "";

      if (inputMode === "paste") {
        // Paste mode — no file extraction or upload needed
        setStatus("analyzing");
        leaseText = pasteText.trim();
        fileName = "Pasted Lease Text";
      } else {
        // 1. Extract text
        setStatus("extracting");
        leaseText = await extractTextFromFile(file);

        if (!leaseText || leaseText.trim().length < 50) {
          throw new Error("Could not extract meaningful text from this file. Please try a different file.");
        }

        // 2. Upload file to storage
        setStatus("uploading");
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        fileUrl = file_url;
        fileName = file.name;
      }

      const user = await base44.auth.me();

      // 3. Create session record
      const now = new Date().toISOString();
      const session = await base44.entities.HawkLawSession.create({
        file_name: fileName,
        uploaded_lease_file: fileUrl || null,
        disclaimer_acknowledged_at: now,
        hawklease_site_id: prefillSiteId || undefined,
        vendor_detected: "Unknown",
        triage_result: null,
      });
      setSessionId(session.id);

      // 4. Call Supabase Edge Function for triage
      setStatus("analyzing");
      const resp = await fetch(HAWK_LAW_EDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool_name: "hawk-triage",
          lease_text: leaseText,
          session_id: session.id,
          user_id: user?.email || "unknown",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Analysis failed: ${resp.status} ${errText}`);
      }

      const result = await resp.json();
      const data = result.data || result;

      // 5. Update session with triage results
      const updatePayload = {
        triage_result: data.triage_result || data.triage || null,
        triage_summary: data.triage_summary || data.summary || null,
        vendor_detected: data.vendor_detected || "Unknown",
        triage_reasons: data.key_concerns || data.triage_reasons || [],
      };
      await base44.entities.HawkLawSession.update(session.id, updatePayload);

      // Mark free triage used if this was the free preview
      if (!admin && !user?.hawk_law_free_triage_used) {
        const gate = checkHawkLaw(true);
        if (gate.isFreePreview) {
          await base44.auth.updateMe({ hawk_law_free_triage_used: true });
        }
      }

      setTriageData(data);
      setStatus("done");
    } catch (err) {
      setError(err.message || "Analysis failed.");
      setStatus("error");
    }
  };

  const statusMessages = {
    extracting: "Extracting text from document…",
    uploading: "Uploading document…",
    analyzing: "Hawk Law is analyzing your lease…",
  };

  return (
    <div className="max-w-2xl space-y-6">
      {showDisclaimer && <DisclaimerModal onAck={handleAck} />}
      {upgradeModal && (
        <UpgradeModal
          open={!!upgradeModal}
          onClose={() => setUpgradeModal(null)}
          gate={upgradeModal.gate}
          message={upgradeModal.message}
          upgradeTo={upgradeModal.upgradeTo}
          currentTier={upgradeModal.currentTierKey}
        />
      )}

      {/* Analysis Header */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        {HAWK_LAW_HEADER}
      </div>

      {prefillSiteName && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary flex items-center gap-2">
          <Scale className="w-4 h-4 shrink-0" />
          Analyzing lease for: <strong>{prefillSiteName}</strong>
        </div>
      )}

      {/* Upload Form */}
      {status !== "done" && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-heading font-semibold text-foreground mb-1">Analyze Lease Document</h2>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-secondary/40 rounded-lg p-1 mb-5 w-fit">
            <button
              type="button"
              onClick={() => { setInputMode("upload"); setPasteText(""); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                inputMode === "upload"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📂 Upload File
            </button>
            <button
              type="button"
              onClick={() => { setInputMode("paste"); setFile(null); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                inputMode === "paste"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              📋 Paste Text
            </button>
          </div>

          {inputMode === "upload" && (
            <p className="text-sm text-muted-foreground mb-5">
              Upload a lease PDF, DOCX, or TXT document to begin AI-powered triage.
            </p>
          )}
          {inputMode === "paste" && (
            <p className="text-sm text-muted-foreground mb-5">
              Paste any lease language — full document, a single clause, or landlord redlines — to get instant AI analysis.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {inputMode === "upload" && (
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => !status && document.getElementById("lease-file-input").click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <FileText className="w-5 h-5" />
                    <span className="font-medium text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground">Click to select a lease document</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, or TXT — up to 10MB</p>
                  </>
                )}
                <input
                  id="lease-file-input"
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={e => { setFile(e.target.files[0] || null); setStatus(null); setError(null); }}
                />
              </div>
            )}

            {inputMode === "paste" && (
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste lease language here — full document, a single clause, or landlord redlines…"
                className="w-full min-h-[180px] rounded-xl border border-border bg-secondary/20 p-4 text-sm text-foreground placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            )}

            {/* Loading state */}
            {status && status !== "error" && (
              <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                <span className="text-sm text-primary font-medium">{statusMessages[status] || "Processing…"}</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={
                (inputMode === "upload" && (!file || (status && status !== "error"))) ||
                (inputMode === "paste" && (!pasteText || pasteText.trim().length < 50 || (status && status !== "error")))
              }
              className="w-full"
            >
              {status && status !== "error" && status !== "done"
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing…</>
                : "Start Hawk Law Analysis →"
              }
            </Button>
          </form>
        </div>
      )}

      {/* Triage Result */}
      {triageData && status === "done" && (
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-foreground">Triage Complete</h3>
          <TriageResultCard data={triageData} />
          <div className="flex gap-3">
            <Button onClick={() => navigate(`/hawk-law/sessions/${sessionId}`)} className="flex-1">
              Open Full Session →
            </Button>
            <Button variant="outline" onClick={() => { setFile(null); setStatus(null); setTriageData(null); setError(null); }}>
              Analyze Another
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}