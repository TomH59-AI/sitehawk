import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Upload, Eye, AlertTriangle, CheckCircle, Info, Loader2, MapPin, Map } from "lucide-react";
import HawkIcon from "@/components/HawkIcon";
import { aiVisionAnalyze } from "@/functions/aiVisionAnalyze";
import { runRFAnalysis } from "@/functions/runRFAnalysis";
import SARFMapInline from "@/components/ai-vision/SARFMapInline";
import RFProximityMaps from "@/components/ai-vision/RFProximityMaps";
import { RADIUS_OPTIONS } from "@/components/search/constants";

const ANALYSIS_TYPES = [
  { id: "aerial",      label: "Aerial / Satellite",    icon: "🛰️", desc: "Analyze aerial or satellite imagery for tower placement zones and obstructions" },
  { id: "blueprint",   label: "Blueprint / Floor Plan", icon: "📐", desc: "Analyze structural blueprints for DAS or small cell antenna mounting points" },
  { id: "obstruction", label: "Obstruction Analysis",   icon: "🏗️", desc: "Identify RF obstructions and calculate required tower height to clear them" },
];

const SEVERITY_CONFIG = {
  positive: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/20", icon: CheckCircle },
  neutral:  { color: "text-blue-400",  bg: "bg-blue-500/10 border-blue-500/20",   icon: Info },
  warning:  { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
  critical: { color: "text-red-400",   bg: "bg-red-500/10 border-red-500/20",     icon: AlertTriangle },
};

function ScoreGauge({ score }) {
  const color = score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626";
  const label = score >= 70 ? "Excellent" : score >= 40 ? "Good" : "Poor";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${(score / 100) * 263.9} 263.9`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white font-mono">{score}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">/ 100</span>
        </div>
      </div>
      <span style={{ color }} className="text-sm font-bold">{label}</span>
    </div>
  );
}

export default function AIVisionAnalyzer() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  // Step 1 — site data form
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [towerHeight, setTowerHeight] = useState("199");
  const [radius, setRadius] = useState(0.5);
  const [sarfCoords, setSarfCoords] = useState(null);

  // RF proximity analysis (closest airport + closest cell tower)
  const [rfResult, setRfResult] = useState(null);
  const [rfLoading, setRfLoading] = useState(false);
  const [rfError, setRfError] = useState(null);

  // Step 2 — AI Vision
  const [analysisType, setAnalysisType] = useState("aerial");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerateMap = async (e) => {
    e.preventDefault();
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      toast({ title: "Invalid coordinates", description: "Please enter valid latitude and longitude.", variant: "destructive" });
      return;
    }
    setSarfCoords({ lat: parsedLat, lon: parsedLon, radius });
    setResult(null);

    // Run RF proximity analysis (closest airport + closest cell tower).
    setRfResult(null);
    setRfError(null);
    setRfLoading(true);
    try {
      const res = await runRFAnalysis({
        lat: parsedLat,
        lon: parsedLon,
        radius_miles: radius,
        heights_ft: [Number(towerHeight)],
        force_refresh: true,
      });
      // A 404 (no cell tower) still carries usable airport data — treat as success.
      const data = res.data || {};
      if (data.error && !data.airport && !data.tower) throw new Error(data.error);
      setRfResult(data);
    } catch (err) {
      setRfError(err.message || "RF analysis failed.");
    } finally {
      setRfLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    setImageFile(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange({ target: { files: [file] } });
  };

  const handleAnalyze = async () => {
    if (!imageFile) {
      toast({ title: "No image", description: "Please upload an image first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: imageFile });
      setUploading(false);
      const res = await aiVisionAnalyze({
        image_url: file_url,
        analysis_type: analysisType,
        lat: sarfCoords?.lat,
        lon: sarfCoords?.lon,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setResult(res.data.analysis);
    } catch (err) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Eye className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">AI Vision Analyzer</h1>
          <p className="text-muted-foreground text-sm">Enter site coordinates to generate your SARF map, then upload imagery for AI analysis</p>
        </div>
      </div>

      {/* ── STEP 1: Site Data + SARF Map ── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</span>
          <h3 className="font-heading font-semibold text-foreground">Site Location & Search Radius</h3>
        </div>

        <form onSubmit={handleGenerateMap} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Latitude</label>
              <input
                type="number" step="any" placeholder="e.g. 35.2271"
                value={lat} onChange={(e) => setLat(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Longitude</label>
              <input
                type="number" step="any" placeholder="e.g. -80.8431"
                value={lon} onChange={(e) => setLon(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tower Height (ft AGL)</label>
              <input
                type="number" step="1" placeholder="e.g. 199"
                value={towerHeight} onChange={(e) => setTowerHeight(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search Radius</label>
            <div className="inline-flex rounded-lg overflow-hidden border border-border">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  type="button" key={opt.value}
                  onClick={() => setRadius(opt.value)}
                  className={`px-5 py-2 text-sm font-semibold transition-all ${
                    radius === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/70"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="gap-2 font-heading font-semibold" disabled={!lat || !lon}>
            <MapPin className="w-4 h-4" />
            Generate SARF Map
          </Button>
        </form>
      </div>

      {/* SARF Map — only renders after button click */}
      {sarfCoords && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 bg-card border-b border-border">
            <div className="text-[10px] font-mono text-cyan-600 tracking-[0.3em] mb-0.5">SARF MAP</div>
            <div className="font-heading font-bold text-foreground">
              {sarfCoords.lat.toFixed(6)}, {sarfCoords.lon.toFixed(6)} — {sarfCoords.radius} mile radius
            </div>
          </div>
          <SARFMapInline lat={sarfCoords.lat} lon={sarfCoords.lon} radius={sarfCoords.radius} />
        </div>
      )}

      {/* RF Proximity — Closest Airport + Closest Cell Tower */}
      {sarfCoords && rfLoading && (
        <div className="rounded-xl border border-border bg-card flex flex-col items-center justify-center p-12 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="font-heading font-semibold text-foreground">Analyzing proximity — airport & cell tower…</p>
        </div>
      )}
      {sarfCoords && !rfLoading && rfError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">Proximity analysis failed: {rfError}</div>
            <Button onClick={handleGenerateMap} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              Retry
            </Button>
          </div>
        </div>
      )}
      {sarfCoords && !rfLoading && rfResult && (
        <RFProximityMaps site={sarfCoords} result={rfResult} />
      )}

      {/* ── STEP 2: AI Vision Analysis (only visible after map is generated) ── */}
      {sarfCoords && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</span>
            <h3 className="font-heading font-semibold text-foreground">
              AI Vision Analysis <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left — Upload & Config */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analysis Type</h4>
                {ANALYSIS_TYPES.map((type) => (
                  <button
                    key={type.id} onClick={() => setAnalysisType(type.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      analysisType === type.id ? "border-primary bg-primary/5" : "border-border bg-card/50 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{type.icon}</span>
                      <div>
                        <div className="font-semibold text-sm text-foreground">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div
                onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-card/50 transition-all cursor-pointer p-6 text-center space-y-3"
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                {imagePreview ? (
                  <div className="space-y-2">
                    <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain border border-border" />
                    <p className="text-xs text-muted-foreground">{imageFile?.name} — click to change</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Drop image here or click to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, WebP supported</p>
                    </div>
                  </>
                )}
              </div>

              <Button onClick={handleAnalyze} disabled={loading || !imageFile} className="w-full gap-2 font-heading font-semibold">
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{uploading ? "Uploading image..." : "Analyzing with AI..."}</>
                ) : (
                  <><HawkIcon size={18} />Analyze Image</>
                )}
              </Button>
            </div>

            {/* Right — Results */}
            <div>
              {!result && !loading && (
                <div className="h-full rounded-xl border border-dashed border-border bg-card/30 flex flex-col items-center justify-center p-12 text-center">
                  <Eye className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="font-heading font-semibold text-muted-foreground">Analysis results will appear here</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Upload an image and click Analyze</p>
                </div>
              )}
              {loading && (
                <div className="h-full rounded-xl border border-border bg-card flex flex-col items-center justify-center p-12 text-center space-y-3">
                  <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="font-heading font-semibold text-foreground">{uploading ? "Uploading image..." : "AI analyzing imagery..."}</p>
                  <p className="text-xs text-muted-foreground">This may take 15–30 seconds</p>
                </div>
              )}
              {result && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-start gap-5">
                      <ScoreGauge score={result.overall_score || 0} />
                      <div className="flex-1">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {result.access_feasibility && (
                            <span className="px-2 py-0.5 rounded-full text-xs border border-border bg-secondary text-muted-foreground">
                              Access: {result.access_feasibility}
                            </span>
                          )}
                          {result.estimated_tower_height_ft && (
                            <span className="px-2 py-0.5 rounded-full text-xs border border-primary/30 bg-primary/10 text-primary">
                              ↕ {result.estimated_tower_height_ft}ft rec.
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
                      </div>
                    </div>
                  </div>
                  {result.findings?.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-muted-foreground">Findings</h4>
                      {result.findings.map((f, i) => {
                        const cfg = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.neutral;
                        const Icon = cfg.icon;
                        return (
                          <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${cfg.bg}`}>
                            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                            <div>
                              <span className={`text-xs font-bold ${cfg.color}`}>{f.category}</span>
                              <p className="text-xs text-muted-foreground mt-0.5">{f.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {result.recommendations?.length > 0 && (
                    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                      <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-muted-foreground">Recommendations</h4>
                      {result.recommendations.map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-primary text-xs font-bold mt-0.5">{i + 1}.</span>
                          <p className="text-xs text-muted-foreground">{r}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}