/**
 * HawkUtilitiesIntelligence — scaffold for Power + Fiber utility overlays.
 *
 * Modeled 1:1 on HawkAerialIntelligence so the print-page rhythm stays
 * consistent (Aerial → Topography → Wetlands → **Power → Fiber** → Viewsheds).
 *
 * Scaffold only — the two map renderers are placeholder panels. The actual
 * Mapbox layer wiring + Supabase fetch contract will be wired once the
 * upstream SQL/payload shape is confirmed. No backend calls are made here.
 */

import { useState } from "react";
import { Zap, Cable, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function PrintPage({ accent, badge, title, subtitle, children }) {
  return (
    <div
      className="rounded-xl border bg-card overflow-hidden break-inside-avoid print:break-before-page"
      style={{ borderColor: `${accent}55` }}
    >
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: `linear-gradient(90deg, ${accent}22 0%, transparent 100%)`, borderBottom: `1px solid ${accent}33` }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}22`, border: `1px solid ${accent}55` }}
        >
          {badge}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono font-bold tracking-[0.3em]" style={{ color: accent }}>
            SCIP · UTILITIES
          </div>
          <div className="font-heading font-bold text-foreground leading-tight">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PlaceholderCanvas({ accent, label, lat, lon }) {
  return (
    <div
      className="relative rounded-lg overflow-hidden flex items-center justify-center"
      style={{
        aspectRatio: "16/10",
        background:
          "repeating-linear-gradient(45deg, #0a0e17 0 12px, #0d1422 12px 24px)",
        border: `1px dashed ${accent}55`,
      }}
    >
      <div className="text-center px-4">
        <div
          className="inline-block px-3 py-1 rounded font-mono text-[10px] font-bold tracking-[0.25em] mb-3"
          style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}
        >
          {label}
        </div>
        <div className="text-slate-300 text-sm font-mono">
          {lat != null && lon != null ? `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}` : "Awaiting coordinates"}
        </div>
        <div className="text-slate-500 text-[11px] mt-2 font-mono">
          Map renderer not yet wired · scaffold only
        </div>
      </div>
    </div>
  );
}

export default function HawkUtilitiesIntelligence({ srcLat, srcLon }) {
  const [powerLoading, setPowerLoading] = useState(false);
  const [fiberLoading, setFiberLoading] = useState(false);
  const [powerGenerated, setPowerGenerated] = useState(false);
  const [fiberGenerated, setFiberGenerated] = useState(false);

  function handleGeneratePower() {
    if (srcLat == null || srcLon == null) return;
    setPowerLoading(true);
    // Placeholder — real Supabase fetch + Mapbox layer wiring lands here.
    setTimeout(() => {
      setPowerGenerated(true);
      setPowerLoading(false);
    }, 600);
  }

  function handleGenerateFiber() {
    if (srcLat == null || srcLon == null) return;
    setFiberLoading(true);
    setTimeout(() => {
      setFiberGenerated(true);
      setFiberLoading(false);
    }, 600);
  }

  return (
    <div className="space-y-3">
      {/* Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent px-4 py-3">
        <div className="text-[10px] font-mono font-bold tracking-[0.3em] text-amber-700">
          SCIP · UTILITIES INTELLIGENCE
        </div>
        <div className="font-heading font-bold text-lg text-foreground leading-tight">
          Power &amp; Fiber Overlays — Target A
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Generates two dedicated print pages: high-voltage transmission proximity (HIFLD) and
          fiber/broadband infrastructure (FCC). Scaffold — wiring pending schema confirmation.
        </div>
      </div>

      {/* Power page */}
      <PrintPage
        accent="#f59e0b"
        badge={<Zap className="w-4 h-4 text-amber-500" />}
        title="Hawk Power Intelligence"
        subtitle="HIFLD transmission lines · electric utility territory · substation proximity"
      >
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap no-print">
          <div className="text-[11px] font-mono text-muted-foreground">
            {powerGenerated ? "✓ Power overlay ready" : "Click Generate to render the Power map."}
          </div>
          <Button
            onClick={handleGeneratePower}
            disabled={powerLoading || srcLat == null || srcLon == null}
            className="bg-amber-500 hover:bg-amber-600 text-white font-semibold"
            size="sm"
          >
            {powerLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {powerGenerated ? "Regenerate Power" : "Generate Power"}</>
            )}
          </Button>
        </div>
        <PlaceholderCanvas accent="#f59e0b" label="POWER OVERLAY" lat={srcLat} lon={srcLon} />
      </PrintPage>

      {/* Fiber page */}
      <PrintPage
        accent="#06b6d4"
        badge={<Cable className="w-4 h-4 text-cyan-500" />}
        title="Hawk Fiber Intelligence"
        subtitle="FCC fiber/broadband providers · nearest OSM telecom infrastructure"
      >
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap no-print">
          <div className="text-[11px] font-mono text-muted-foreground">
            {fiberGenerated ? "✓ Fiber overlay ready" : "Click Generate to render the Fiber map."}
          </div>
          <Button
            onClick={handleGenerateFiber}
            disabled={fiberLoading || srcLat == null || srcLon == null}
            className="bg-cyan-500 hover:bg-cyan-600 text-white font-semibold"
            size="sm"
          >
            {fiberLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> {fiberGenerated ? "Regenerate Fiber" : "Generate Fiber"}</>
            )}
          </Button>
        </div>
        <PlaceholderCanvas accent="#06b6d4" label="FIBER OVERLAY" lat={srcLat} lon={srcLon} />
      </PrintPage>
    </div>
  );
}