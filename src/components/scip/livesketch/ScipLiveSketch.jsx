import { useEffect, useMemo, useRef, useState } from "react";
import { PencilRuler, Play, RotateCcw, Gauge, Volume2, VolumeX, Zap, SkipForward, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { computeExhibit } from "@/lib/towerFitExhibit";
import { resolveScipActiveTarget } from "@/lib/scipTarget";
import { mountLiveSketch } from "./liveSketchEngine";
import { resolveDrawnHeight } from "./maxAllowableHeight";
import SketchHeightControl from "./SketchHeightControl";
import { downloadLiveSketchPdf } from "./downloadLiveSketchPdf";
import { base44 } from "@/api/base44Client";

/**
 * ScipLiveSketch — "The Reveal": the SCIP finale that freehand-draws the active
 * Target A to scale (boundary, setbacks, compound, fall zone, tower) and stamps
 * the Talon FT verdict, with a PE-letter toggle that re-draws the engineered
 * fall zone live. Geometry + verdicts come from @/lib/towerFitExhibit — the same
 * engine as the static Tower Fit Exhibit. Client-side only; no API calls.
 */

const FT_PER_DEG_LAT = 364000; // ≈ 69 mi — concept-exhibit precision

// GeoJSON (Feature/FeatureCollection/Polygon/MultiPolygon) → outer ring [ [lng,lat], ... ]
function extractRing(geom) {
  if (!geom) return null;
  try {
    let g = geom;
    if (typeof g === "string") g = JSON.parse(g);
    if (g.type === "FeatureCollection") g = g.features?.[0]?.geometry || null;
    if (g && g.type === "Feature") g = g.geometry;
    if (!g) return null;
    if (g.type === "Polygon") return g.coordinates?.[0] || null;
    if (g.type === "MultiPolygon") {
      let best = null, bestLen = 0;
      for (const poly of g.coordinates || []) {
        const ring = poly?.[0];
        if (ring && ring.length > bestLen) { best = ring; bestLen = ring.length; }
      }
      return best;
    }
  } catch { /* fall through */ }
  return null;
}

// [lng,lat] ring → feet, y = north (TRUE N up), bbox-normalized to 0,0.
function projectRingToFeet(ring) {
  const lats = ring.map((p) => p[1]);
  const lat0 = lats.reduce((a, b) => a + b, 0) / lats.length;
  const cos0 = Math.cos((lat0 * Math.PI) / 180);
  let pts = ring.map(([lng, lat]) => [lng * cos0 * FT_PER_DEG_LAT, lat * FT_PER_DEG_LAT]);
  // drop closing vertex if duplicated
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (Math.abs(fx - lx) < 0.5 && Math.abs(fy - ly) < 0.5) pts = pts.slice(0, -1);
  const minX = Math.min(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => [x - minX, y - minY]);
}

// Douglas-Peucker on a closed ring, iterating tolerance until <= maxPts.
function simplifyRing(pts, maxPts = 26) {
  if (pts.length <= maxPts) return pts;
  const perpDist = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const dp = (arr, tol) => {
    if (arr.length <= 2) return arr;
    let maxD = 0, idx = 0;
    for (let i = 1; i < arr.length - 1; i++) {
      const d = perpDist(arr[i], arr[0], arr[arr.length - 1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= tol) return [arr[0], arr[arr.length - 1]];
    const left = dp(arr.slice(0, idx + 1), tol), right = dp(arr.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  };
  let tol = 2, out = pts;
  for (let i = 0; i < 12 && out.length > maxPts; i++) {
    const closed = pts.concat([pts[0]]);
    out = dp(closed, tol).slice(0, -1);
    tol *= 1.8;
  }
  return out.length >= 3 ? out : pts;
}

export default function ScipLiveSketch({ record, pipelineMode = false, zoningData = null, utilities = [] }) {
  const svgRef = useRef(null);
  const ctrlRef = useRef(null);
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [peOn, setPeOn] = useState(false);
  const [heightFt, setHeightFt] = useState(() => Number(record?.sarf_height) || 199);
  const [speed, setSpeed] = useState(1);
  const [sound, setSound] = useState(true);
  const [caption, setCaption] = useState("SCIP compiled. Ready to draft the site concept.");
  const [chips, setChips] = useState([]);
  const [lit, setLit] = useState(() => new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    setHeightFt(Number(record?.sarf_height) || 199);
  }, [record?.sarf_height]);

  const built = useMemo(() => {
    const ctx = resolveScipActiveTarget(record || {});
    const zr = record?.zoning_report || {};
    const fzText = String(zr?.tower_specifics?.fall_zone_requirements?.value || "");
    const peText = `${fzText} ${String(zr?.tower_specifics?.pe_letter?.value || "")}`;
    const peAccepted = /\b(PE|engineer|certif|yield|collapse|structural)\b/i.test(peText) &&
      /\b(accept|allow|permit|may|reduc|less)\b/i.test(peText);
    const rule = /110\s*%/.test(fzText) ? "110" : "100";
    const jurisdiction = zr?.zoning_overview?.zoning_jurisdiction?.value || "";
    // Ordinance max height from the zoning report — flag (never silently redraw)
    const maxHM = String(zr?.tower_specifics?.maximum_tower_height?.value || "").match(/(\d{2,4})/);
    const maxHeightFt = maxHM ? Number(maxHM[1]) : null;
    const heightExceeds = !!(maxHeightFt && heightFt > maxHeightFt);

    let shape = "rectangle", widthFt = 360, depthFt = 420, polygonText = "", sourceNote;
    const ring = extractRing(ctx.parcel_geometry);
    if (ring && ring.length >= 3) {
      const pts = simplifyRing(projectRingToFeet(ring));
      polygonText = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("\n");
      shape = "polygon";
      sourceNote = `Parcel boundary from ${ctx.target_label} geometry — drawn to scale, true north up.`;
    } else if (ctx.acreage && ctx.acreage > 0) {
      const side = Math.sqrt(ctx.acreage * 43560);
      widthFt = side; depthFt = side;
      sourceNote = `${ctx.target_label} has no boundary geometry yet — drawn as an acreage-equivalent square (${ctx.acreage} ac). Fetch the Parcel Boundary Map to sketch the real shape.`;
    } else {
      sourceNote = "No Target A parcel geometry or acreage on this record — a concept parcel is shown. Run 'Find 3 Best Parcels' to sketch the real site.";
    }

    const cfgRequested = {
      siteName: record?.site_name || ctx.parcel_address || "Tower Site",
      preparedFor: ctx.owner_name || "",
      jurisdiction,
      date: record?.submittal_date || "",
      shape, widthFt, depthFt, polygonText,
      tower: { heightFt, type: "Monopole", location: "auto", customX: "", customY: "" },
      compound: { widthFt: 100, depthFt: 100 },
      setbacks: { front: 50, rear: 50, left: 25, right: 25 },
      fallZone: { rule, customFt: "" },
      easement: { enabled: shape === "rectangle", widthFt: 30, from: "south" },
      notes: "",
    };
    // Grader, not bouncer: draw the tower at the height this site actually
    // allows, so the sketch matches what TalonFit reports.
    const fit = resolveDrawnHeight(cfgRequested, heightFt, maxHeightFt);
    const drawnHeightFt = fit.drawnHeightFt;
    const cfg = { ...cfgRequested, tower: { ...cfgRequested.tower, heightFt: drawnHeightFt } };

    const baseModel = computeExhibit(cfg);
    const peRadius = Math.round(drawnHeightFt * 0.5);
    const peModel = computeExhibit({ ...cfg, fallZone: { rule: "custom", customFt: String(peRadius) } });
    const peInfo = { available: true, accepted: peAccepted, ruleLabel: "50% H", radiusFt: peRadius };
    const dateLabel = (record?.submittal_date || new Date().toISOString().slice(0, 10)).toUpperCase();
    const heightNote = fit.limitedBy ? "MAX ALLOWABLE" : null;
    return { ctx, cfg, baseModel, peModel, peInfo, sourceNote, dateLabel, maxHeightFt, heightExceeds, fit, drawnHeightFt, heightNote };
  }, [record, heightFt]);

  // Remount the engine only when the drawn geometry actually changes.
  const cfgKey = useMemo(() => JSON.stringify({ cfg: built.cfg, utilities }), [built, utilities]);

  useEffect(() => {
    if (!svgRef.current) return undefined;
    setStarted(false); setDone(false); setRunning(false); setPeOn(false);
    setLit(new Set());
    setCaption("SCIP compiled. Ready to draft the site concept.");
    const ctrl = mountLiveSketch(svgRef.current, {
      base: built.baseModel,
      pe: built.peModel,
      peInfo: built.peInfo,
      utilities,
      meta: { siteName: built.cfg.siteName, dateLabel: built.dateLabel, heightNote: built.heightNote },
      onCaption: setCaption,
      onChip: (k) => setLit((s) => { const n = new Set(s); n.add(k); return n; }),
      onState: (st) => { setRunning(st.running); setDone(st.done); setPeOn(st.peOn); },
      onDone: () => {},
    });
    ctrlRef.current = ctrl;
    setChips(ctrl.chips);
    return () => { ctrl.destroy(); ctrlRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey]);

  const ctrl = () => ctrlRef.current;
  const handleStart = () => { setStarted(true); ctrl()?.start(); };
  const handleReplay = () => { setLit(new Set()); setStarted(true); ctrl()?.replay(); };
  const handleClear = () => {
    setLit(new Set());
    setStarted(false);
    setDone(false);
    setPeOn(false);
    setCaption("Site sketch cleared. Adjust the height or draw it again.");
    ctrl()?.clear();
  };
  const handleSkip = () => ctrl()?.skip();
  const handlePE = () => { if (peOn) ctrl()?.revertPE(); else ctrl()?.applyPE(); };
  const handleSpeed = () => { const m = speed === 1 ? 2 : 1; setSpeed(m); ctrl()?.setSpeed(m); };
  const handleSound = () => { const v = !sound; setSound(v); ctrl()?.setSound(v); };
  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const preparedBy = await base44.auth.me();
      await downloadLiveSketchPdf({
        svg: svgRef.current,
        record,
        zoningData,
        heightFt: built.drawnHeightFt,
        sourceNote: built.sourceNote,
        preparedBy,
      });
    } catch (error) {
      setDownloadError(error?.message || "PDF download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const verdictIsFits = built.baseModel.verdict === "FITS";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <PencilRuler className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-heading font-bold text-foreground">Live Site Sketch — The Reveal</div>
            <div className="text-xs text-muted-foreground">
              Draws the active {built.ctx.target_label}{built.ctx.parcel_address ? ` — ${built.ctx.parcel_address}` : ""} to scale from its saved parcel geometry, with the fall-zone rule and PE acceptance read from this record's zoning report. Talon FT engine.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SketchHeightControl value={heightFt} onChange={setHeightFt} disabled={running || downloading} />
          <Button size="sm" onClick={handleDownload} disabled={!done || running || downloading} aria-label="Download Live Site Sketch PDF">
            {downloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleClear} disabled={!started || running || downloading}>
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
          <Button size="sm" variant="outline" onClick={handleReplay} disabled={!done || running}>
            <RotateCcw className="w-4 h-4 mr-1" /> Replay
          </Button>
          {pipelineMode ? (
            <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground">
              <Zap className="w-4 h-4 text-primary" />
              PE letter
              <Switch checked={peOn} onCheckedChange={handlePE} disabled={!done || running} aria-label="Toggle PE letter fall-zone relief" />
            </label>
          ) : (
            <Button size="sm" variant={peOn ? "default" : "outline"} onClick={handlePE}
              disabled={!done || running}
              className={!verdictIsFits && done && !running && !peOn ? "animate-pulse" : ""}>
              <Zap className="w-4 h-4 mr-1" /> {peOn ? "PE letter: ON" : "Apply PE letter"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleSpeed}>
            <Gauge className="w-4 h-4 mr-1" /> {speed}×
          </Button>
          <Button size="sm" variant="outline" onClick={handleSound}>
            {sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={handleSkip} disabled={!started || done}>
            <SkipForward className="w-4 h-4 mr-1" /> Skip
          </Button>
        </div>
      </div>

      <div className="border-t border-border p-4 space-y-3">
        {downloadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-semibold text-destructive">
            {downloadError}
          </div>
        )}
        <div className="text-sm italic text-muted-foreground min-h-[22px]">
          <span className="text-primary not-italic font-bold mr-1.5">▸</span>{caption}
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border shadow-sm">
          <svg ref={svgRef} className="block w-full h-auto bg-white" viewBox="0 0 1044 620" preserveAspectRatio="xMidYMid meet" aria-label="Hand-drawn live site sketch" />
          {!started && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/70 backdrop-blur-[2px]">
              <div className="text-white font-heading font-bold text-lg text-center px-4">Your site concept is ready to draw</div>
              <p className="text-xs text-slate-300 max-w-md text-center px-6">
                SiteHawk sketches the parcel, setbacks, compound, fall zone and tower — freehand, to scale, from the Talon FT geometry — then stamps the verdict.
              </p>
              <Button onClick={handleStart} size="lg" className="rounded-full font-bold">
                <Play className="w-4 h-4 mr-2" /> Draw Sketch
              </Button>
            </div>
          )}
        </div>

        {built.fit.limitedBy && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600">
            ⚠ Requested {built.fit.requestedFt}′ does not fit this site. Drawn at the maximum allowable {built.drawnHeightFt}′ —
            {built.fit.limitedBy === "ordinance"
              ? ` capped by the ${built.maxHeightFt}′ ordinance maximum on this record's zoning report. A taller tower needs a variance/waiver.`
              : ` the tallest height whose fall zone stays on the parcel under the ${built.cfg.fallZone.rule === "110" ? "110%" : "100%"}-of-height rule.`}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.key}
              className={`text-[11px] font-semibold rounded-full px-3 py-1.5 border transition-all ${
                lit.has(c.key)
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground bg-muted/30"
              }`}>
              {lit.has(c.key) ? "✓ " : ""}{c.label}
            </span>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {built.sourceNote} Setbacks shown are concept defaults (F50′/R50′/S25′) unless ordinance data specifies otherwise; the PE toggle
          redraws the fall zone at the engineered 50%-of-height radius and re-stamps the verdict{built.peInfo.accepted ? " (ordinance record indicates PE certification is accepted)" : " — verify PE-letter acceptance with the jurisdiction"}.
        </p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
          Concept sketch — NOT a boundary survey or stamped engineering drawing. Same Talon FT math as the Tower Fit Exhibit.
        </p>
      </div>
    </div>
  );
}