import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { UploadCloud, Loader2, ArrowLeft, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { extractLeaseText } from "@/lib/leaseTextExtract";
import { HL } from "../hawklawConst";

// Upload BOTH the carrier original and the landlord redline, extract text
// client-side, create the RedlineReview record, hand both texts up to analyze.
export default function NewRedline({ onBack, onReady }) {
  const [reviewName, setReviewName] = useState("");
  const [orig, setOrig] = useState({ file: null, text: "", busy: false, done: false });
  const [redline, setRedline] = useState({ file: null, text: "", busy: false, done: false });
  const [creating, setCreating] = useState(false);

  async function handleFile(e, which) {
    const f = e.target.files?.[0];
    if (!f) return;
    const setter = which === "orig" ? setOrig : setRedline;
    setter((s) => ({ ...s, file: f, done: false, busy: true }));
    try {
      const text = await extractLeaseText(f);
      if (!text || text.trim().length < 50) throw new Error("Could not read enough text from this file.");
      setter((s) => ({ ...s, text, done: true, busy: false }));
      toast.success(`${which === "orig" ? "Original" : "Redline"} text extracted`);
    } catch (err) {
      toast.error(err.message || "Extraction failed");
      setter({ file: null, text: "", busy: false, done: false });
    }
  }

  async function handleContinue() {
    if (!reviewName.trim()) return toast.error("Enter a name");
    if (!orig.done) return toast.error("Upload your original lease");
    if (!redline.done) return toast.error("Upload the landlord's redlined lease");
    setCreating(true);
    try {
      const [{ file_url: ou }, { file_url: ru }] = await Promise.all([
        base44.integrations.Core.UploadFile({ file: orig.file }),
        base44.integrations.Core.UploadFile({ file: redline.file }),
      ]);
      const rec = await base44.entities.RedlineReview.create({
        review_name: reviewName.trim(),
        original_file_url: ou,
        original_file_name: orig.file.name,
        redlined_file_url: ru,
        redlined_file_name: redline.file.name,
        status: "uploaded",
      });
      onReady(rec, orig.text, redline.text);
    } catch (err) {
      toast.error(err.message || "Failed to create redline review");
    } finally {
      setCreating(false);
    }
  }

  const Drop = ({ state, which, label }) => (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5 flex flex-col items-center justify-center gap-2 p-5 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary/40 transition-colors">
        {state.busy ? (
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: HL.blue }} />
        ) : state.done ? (
          <FileCheck2 className="w-6 h-6" style={{ color: HL.green }} />
        ) : (
          <UploadCloud className="w-6 h-6 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground text-center">
          {state.done ? `${state.file?.name} — extracted` : "Click to upload PDF or DOCX"}
        </span>
        <input type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => handleFile(e, which)} disabled={state.busy} />
      </div>
    </label>
  );

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> Redline Counter
      </button>
      <Card className="p-6 max-w-2xl" style={{ borderTop: `3px solid ${HL.blue}` }}>
        <h2 className="text-xl font-bold mb-1">New Redline Comparison</h2>
        <p className="text-sm text-muted-foreground mb-6">Upload your original lease and the landlord attorney's redlined version. We compare them and suggest accept / reject / counter for each change — from the carrier's side.</p>

        <div className="space-y-2 mb-5">
          <Label htmlFor="redline_name">Comparison Name</Label>
          <Input id="redline_name" value={reviewName} onChange={(e) => setReviewName(e.target.value)}
            placeholder="e.g. Marion Samson 75 — Landlord Redline R1" />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Drop state={orig} which="orig" label="① Your Original Lease" />
          <Drop state={redline} which="redline" label="② Landlord's Redlined Lease" />
        </div>

        <Button onClick={handleContinue} disabled={creating || !orig.done || !redline.done}
          style={{ background: HL.gold, color: "#1a1a1a" }} className="w-full font-semibold">
          {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          Compare & Get Suggestions
        </Button>
      </Card>
    </div>
  );
}