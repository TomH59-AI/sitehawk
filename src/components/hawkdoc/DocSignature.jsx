import { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { PenTool, Type, Eraser, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// E-signature block: draw on a canvas OR type your name. Saves to the document.
export default function DocSignature({ document, onSigned }) {
  const [mode, setMode] = useState("drawn");
  const [typedName, setTypedName] = useState(document.signed_by || "");
  const [signerName, setSignerName] = useState(document.signed_by || "");
  const [saving, setSaving] = useState(false);
  const signed = document.status === "signed" && document.applicant_signature;

  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "drawn") return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0C1B2E";

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    };
    const start = (e) => { drawing.current = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
    const move = (e) => { if (!drawing.current) return; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); hasInk.current = true; e.preventDefault(); };
    const end = () => { drawing.current = false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [mode]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  async function sign() {
    let signature = "";
    let name = "";
    if (mode === "drawn") {
      if (!hasInk.current) { toast.error("Please draw your signature first."); return; }
      if (!signerName.trim()) { toast.error("Enter the signer's printed name."); return; }
      signature = canvasRef.current.toDataURL("image/png");
      name = signerName.trim();
    } else {
      if (!typedName.trim()) { toast.error("Type your full name to sign."); return; }
      signature = typedName.trim();
      name = typedName.trim();
    }

    setSaving(true);
    try {
      const patch = {
        applicant_signature: signature,
        signature_mode: mode,
        signed_by: name,
        signed_at: new Date().toISOString(),
        status: "signed",
      };
      await base44.entities.HawkDocument.update(document.id, patch);
      toast.success("Application signed.");
      onSigned?.({ ...document, ...patch });
    } catch (err) {
      toast.error(err.message || "Could not save signature");
    } finally {
      setSaving(false);
    }
  }

  if (signed) {
    return (
      <div className="bg-card rounded-xl border border-green-500/40 p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <h3 className="font-heading font-semibold">Signed</h3>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {document.signature_mode === "drawn" ? (
            <img src={document.applicant_signature} alt="signature" className="h-16 bg-white rounded border border-border px-2" />
          ) : (
            <span className="text-2xl text-foreground" style={{ fontFamily: "'Brush Script MT', cursive" }}>{document.applicant_signature}</span>
          )}
          <div className="text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{document.signed_by}</div>
            {document.signed_at && <div>{new Date(document.signed_at).toLocaleString()}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 mb-4">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <PenTool className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold">Sign this application</h3>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
          <button onClick={() => setMode("drawn")} className={`px-3 py-1.5 flex items-center gap-1.5 ${mode === "drawn" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            <PenTool className="w-3.5 h-3.5" /> Draw
          </button>
          <button onClick={() => setMode("typed")} className={`px-3 py-1.5 flex items-center gap-1.5 ${mode === "typed" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            <Type className="w-3.5 h-3.5" /> Type
          </button>
        </div>
      </div>

      {mode === "drawn" ? (
        <div className="space-y-3">
          <div className="relative rounded-lg border-2 border-dashed border-border bg-white">
            <canvas ref={canvasRef} width={560} height={150} className="w-full touch-none cursor-crosshair" style={{ height: 150 }} />
            <button onClick={clearCanvas} className="absolute top-2 right-2 inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 bg-white/80 px-2 py-1 rounded">
              <Eraser className="w-3 h-3" /> Clear
            </button>
          </div>
          <div>
            <Label className="mb-1.5 block">Printed name</Label>
            <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full legal name" />
          </div>
        </div>
      ) : (
        <div>
          <Label className="mb-1.5 block">Type your full name to sign</Label>
          <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Full legal name" className="text-lg" />
          {typedName.trim() && (
            <p className="mt-2 text-2xl text-foreground" style={{ fontFamily: "'Brush Script MT', cursive" }}>{typedName}</p>
          )}
        </div>
      )}

      <Button onClick={sign} disabled={saving} className="w-full mt-4">
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PenTool className="w-4 h-4 mr-2" />}
        Sign Application
      </Button>
      <p className="text-[11px] text-muted-foreground mt-2 text-center">
        By signing you affirm the information in this application is accurate to the best of your knowledge.
      </p>
    </div>
  );
}