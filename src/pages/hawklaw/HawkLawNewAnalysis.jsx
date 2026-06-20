import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Upload, AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HAWK_LAW_HEADER } from "../HawkLaw";

const DISCLAIMER_TEXT = "Hawk Law is an AI-powered legal analysis tool built on Anthropic Law. It is NOT legal advice. You must consult a licensed attorney before executing any agreement.";

export default function HawkLawNewAnalysis() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillSiteId = searchParams.get("site_id");
  const prefillSiteName = searchParams.get("site_name");

  const [disclaimerOpen, setDisclaimerOpen] = useState(true);
  const [disclaimerAcked, setDisclaimerAcked] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleAcknowledge = () => {
    setAcknowledged(true);
    setDisclaimerOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const now = new Date().toISOString();
      const session = await base44.entities.HawkLawSession.create({
        file_name: file.name,
        uploaded_lease_file: file_url,
        disclaimer_acknowledged_at: now,
        hawklease_site_id: prefillSiteId || undefined,
        vendor_detected: "Unknown",
        triage_result: null,
      });
      navigate(`/hawk-law/sessions/${session.id}`);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Disclaimer Modal */}
      {disclaimerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="font-heading font-bold text-lg text-foreground">Important Disclaimer</h2>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{DISCLAIMER_TEXT}</p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={disclaimerAcked}
                onChange={e => setDisclaimerAcked(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary"
              />
              <span className="text-sm text-foreground">I understand this is not legal advice and I will consult a licensed attorney.</span>
            </label>
            <Button
              onClick={handleAcknowledge}
              disabled={!disclaimerAcked}
              className="w-full"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" /> Acknowledge and Continue
            </Button>
          </div>
        </div>
      )}

      {/* Analysis Header */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        {HAWK_LAW_HEADER}
      </div>

      {prefillSiteName && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
          <Scale className="w-4 h-4 inline mr-2" />
          Analyzing lease for: <strong>{prefillSiteName}</strong>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-heading font-semibold text-foreground mb-1">Upload Lease Document</h2>
        <p className="text-sm text-muted-foreground mb-5">Upload a lease PDF or Word document to begin AI-powered triage and clause extraction.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Lease File (PDF or DOCX)</label>
            <div
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => document.getElementById("lease-file-input").click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium text-sm">{file.name}</span>
                  <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Click to select a PDF or DOCX file</p>
                </>
              )}
              <input
                id="lease-file-input"
                type="file"
                accept=".pdf,.docx,.doc"
                className="hidden"
                onChange={e => setFile(e.target.files[0] || null)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={!file || uploading || !acknowledged} className="w-full">
            {uploading ? "Uploading…" : "Start Hawk Law Analysis →"}
          </Button>
        </form>
      </div>

      {!acknowledged && (
        <p className="text-xs text-muted-foreground text-center">You must acknowledge the disclaimer above before uploading.</p>
      )}
    </div>
  );
}