import { useState } from "react";
import { Radio, Loader2, Sparkles } from "lucide-react";
import { cloudRFSpectrum } from "@/functions/cloudRFSpectrum";

export default function SCIPSpectrumSection({ candidate }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const lat = candidate?.latitude;
  const lon = candidate?.longitude;

  const run = async () => {
    if (!lat || !lon) return;
    setLoading(true);
    setError(null);
    try {
      const res = await cloudRFSpectrum({ lat, lon, radius_mi: 5, frequency_mhz: 700 });
      if (res.data?.success) setResult(res.data);
      else setError(res.data?.error || "Spectrum simulation failed");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  if (!lat || !lon) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#0C1B2E] to-[#1e3a5f] text-white hover:from-[#13294a] hover:to-[#264a7a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Section</span>
          <Radio className="w-4 h-4 text-amber-400" />
          <span className="font-heading font-bold">Spectrum Survey — Surrounding Frequency Activity</span>
        </div>
        <span className="text-amber-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Heatmap of <span className="font-semibold text-foreground">700 MHz interference / noise floor</span> in a 5-mile radius
            via CloudRF <code className="bg-secondary/50 px-1 rounded">/interference</code>.
          </p>

          {!result && !loading && (
            <button
              onClick={run}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-pink-600 hover:from-amber-500 hover:to-pink-500 text-white font-heading font-bold text-sm shadow-lg shadow-amber-500/30 transition-all hover:scale-[1.02]"
            >
              <Sparkles className="w-4 h-4" /> Run Spectrum Survey
            </button>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-3 py-12 rounded-xl bg-secondary/50 border border-dashed border-border">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              <div className="font-heading font-semibold text-foreground text-sm">Surveying surrounding spectrum…</div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600">{error}</div>
          )}

          {result?.png_url && (
            <div className="rounded-lg overflow-hidden border border-border bg-[#0a0e17]">
              <img src={result.png_url} alt="Spectrum heatmap" className="w-full h-auto" style={{ maxHeight: 500, objectFit: "contain" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}