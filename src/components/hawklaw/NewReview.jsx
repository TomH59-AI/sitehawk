import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { UploadCloud, Loader2, ArrowLeft, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { extractLeaseText } from "@/lib/leaseTextExtract";
import { HL } from "./hawklawConst";

// Upload + name. Extracts text client-side, creates the record, hands leaseText up.
export default function NewReview({ onBack, onReady }) {
  const [leaseName, setLeaseName] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [leaseText, setLeaseText] = useState("");

  async function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setExtracted(false);
    setBusy(true);
    try {
      const text = await extractLeaseText(f);
      if (!text || text.trim().length < 50) throw new Error("Could not read enough text from this file.");
      setLeaseText(text);
      setExtracted(true);
      toast.success("Lease text extracted");
    } catch (err) {
      toast.error(err.message || "Extraction failed");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleContinue() {
    if (!leaseName.trim()) return toast.error("Enter a lease name");
    if (!extracted) return toast.error("Upload a lease document first");
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const rec = await base44.entities.HawkLawReview.create({
        lease_name: leaseName.trim(),
        source_file_url: file_url,
        source_file_name: file.name,
        status: "uploaded",
      });
      onReady(rec, leaseText);
    } catch (err) {
      toast.error(err.message || "Failed to create review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> My Reviews
      </button>
      <Card className="p-6 max-w-xl" style={{ borderTop: `3px solid ${HL.blue}` }}>
        <h2 className="text-xl font-bold mb-1">New Lease Review</h2>
        <p className="text-sm text-muted-foreground mb-6">Upload a PDF or DOCX telecom ground lease.</p>

        <div className="space-y-2 mb-5">
          <Label htmlFor="lease_name">Lease Name</Label>
          <Input id="lease_name" value={leaseName} onChange={(e) => setLeaseName(e.target.value)}
            placeholder="e.g. Boyer Ground Lease — Marion Samson 75" />
        </div>

        <label className="block mb-6">
          <div className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/40 transition-colors">
            {busy && !extracted ? (
              <Loader2 className="w-7 h-7 animate-spin" style={{ color: HL.blue }} />
            ) : extracted ? (
              <FileCheck2 className="w-7 h-7" style={{ color: HL.green }} />
            ) : (
              <UploadCloud className="w-7 h-7 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground">
              {extracted ? `${file?.name} — text extracted` : "Click to upload PDF or DOCX"}
            </span>
            <input type="file" accept=".pdf,.docx" className="hidden" onChange={handleFile} disabled={busy} />
          </div>
        </label>

        <Button onClick={handleContinue} disabled={busy || !extracted}
          style={{ background: HL.gold, color: "#1a1a1a" }} className="w-full font-semibold">
          {busy && extracted ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          Continue to Side Selection
        </Button>
      </Card>
    </div>
  );
}