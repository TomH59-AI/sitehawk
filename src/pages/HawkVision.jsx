import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Image as ImageIcon, Sparkles, Download } from "lucide-react";
import { toast } from "sonner";

const TOWER_TYPES = [
  { value: "monopole", label: "Monopole" },
  { value: "lattice", label: "Lattice / Self-Support" },
  { value: "guyed", label: "Guyed" },
  { value: "stealth", label: "Stealth / Concealed" },
];
const COMPOUND_SIZES = ["50x50", "75x75", "100x100"];
const BUFFERS = [10, 25, 50];
const SCENES = [
  { value: "drone", label: "Drone / High-angle" },
  { value: "eye-level", label: "Eye-level from property line" },
  { value: "street", label: "Street-level" },
];

const inputCls = "bg-secondary border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function HawkVision() {
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [result, setResult] = useState(null);
  const [params, setParams] = useState({
    tower_height: 199,
    tower_type: "monopole",
    compound_size: "75x75",
    buffer_ft: 25,
    scene: "drone",
  });

  const onUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error("Upload returned no file URL");
      setPhotoUrl(file_url);
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const render = async () => {
    if (!photoUrl) { toast.error("Upload a parcel photo first"); return; }
    setRendering(true);
    setResult(null);
    try {
      const out = await base44.functions.invoke("hawkVisionPhotoRender", params);
      const data = out?.data ?? out;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      toast.error(e.message || "Render failed");
    } finally {
      setRendering(false);
    }
  };

  const set = (k, v) => setParams((p) => ({ ...p, [k]: v }));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <div className="text-[10px] font-mono tracking-[0.3em] text-muted-foreground">HAWKVISION · PHOTO RENDER</div>
        <h1 className="font-heading font-bold text-2xl">HawkVision — Photo-to-Render</h1>
        <p className="text-sm text-muted-foreground">
          Upload a photo of the parcel. HawkVision composites the to-scale tower, fenced compound, and landscaped buffer right into your photo — keep the existing 3D Exhibit and text-prompt renders too.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upload + params */}
        <div className="space-y-5 rounded-xl border border-border bg-card p-5">
          <div className="space-y-2">
            <Label>Parcel photo</Label>
            <label className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/50 px-4 py-8 cursor-pointer hover:border-primary/40 transition-colors">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
              {uploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Upload className="w-6 h-6 text-primary" />}
              <span className="text-sm text-muted-foreground">{photoUrl ? "Replace photo" : "Click to upload a parcel photo"}</span>
            </label>
            {photoUrl && <img src={photoUrl} alt="parcel upload" className="rounded-lg border border-border max-h-48 w-full object-cover" />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="th">Tower height (ft)</Label>
              <Input id="th" type="number" value={params.tower_height} onChange={(e) => set("tower_height", Number(e.target.value))} className={inputCls} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tt">Tower type</Label>
              <select id="tt" value={params.tower_type} onChange={(e) => set("tower_type", e.target.value)} className={inputCls}>
                {TOWER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs">Compound size</Label>
              <select id="cs" value={params.compound_size} onChange={(e) => set("compound_size", e.target.value)} className={inputCls}>
                {COMPOUND_SIZES.map((s) => <option key={s} value={s}>{s} ft</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bf">Landscaped buffer (ft)</Label>
              <select id="bf" value={params.buffer_ft} onChange={(e) => set("buffer_ft", Number(e.target.value))} className={inputCls}>
                {BUFFERS.map((b) => <option key={b} value={b}>{b} ft</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label htmlFor="sc">Camera perspective</Label>
              <select id="sc" value={params.scene} onChange={(e) => set("scene", e.target.value)} className={inputCls}>
                {SCENES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <Button onClick={render} disabled={rendering || uploading || !photoUrl} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white border-0">
            {rendering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {rendering ? "Rendering…" : "Render tower into photo"}
          </Button>
        </div>

        {/* Result */}
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-base">Rendered result</h2>
            {result?.render_url && (
              <a href={result.render_url} download="hawkvision-render.webp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Download className="w-3.5 h-3.5" /> Download
              </a>
            )}
          </div>
          {rendering ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Compositing tower, compound & landscaping into your photo…</p>
            </div>
          ) : result?.render_url ? (
            <img src={result.render_url} alt="HawkVision render" className="rounded-lg border border-border w-full" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground text-center">
              <ImageIcon className="w-8 h-8 opacity-50" />
              <p className="text-sm">Your rendered image will appear here.</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Illustrative concept — not a survey. Tower height and compound are shown to scale; final placement is set after a site walk and engineering review.</p>
    </div>
  );
}