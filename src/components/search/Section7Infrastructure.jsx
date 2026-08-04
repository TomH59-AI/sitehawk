/**
 * Section7Infrastructure — SiteHawk pipeline step 7 ("HAWK INFRASTRUCTURE
 * VISION"). ONE interactive map (not sub-buttons) the user drives with toggles.
 * Target A only. Strict gating (mirrors Sections 1–6):
 *  - LOCKED until Section 6 (all three maps) is complete AND Target A is resolved.
 *  - A single "Run Infrastructure Map" button advances pipelineStep → "infrastructure"
 *    and fires the power + fiber data load. Hawk-flying spinner only while in flight.
 *  - On success: render the map (both layers ON, Streets view) for free interaction.
 *  - Regenerate button for one-off retries. No auto-advance.
 *
 * Reuses the existing working sources via the section7Infrastructure backend
 * function (infrastructureAssets power poles/transformers + fiber, plus
 * electricProviderContact for the utility company to contact).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Lock, Network, Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "./HawkFlightSpinner";
import InfraToolbar from "./section7/InfraToolbar";
import SectionClearButton from "./SectionClearButton";
import { loadPublicConfig } from "@/lib/publicConfig";
import { section7Infrastructure } from "@/functions/section7Infrastructure";
import {
  renderInfrastructure, STREETS_STYLE, SAT_STYLE, BRAND_GREEN,
} from "@/lib/section7Infrastructure";

export default function Section7Infrastructure({
  unlocked, active, targetA, radiusMiles = 0.5, onRun, onData, onClear,
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [utility, setUtility] = useState(null);
  const [fccCoverage, setFccCoverage] = useState(null);
  const [counts, setCounts] = useState({ power: 0, fiber: 0, carriers: 0 });
  const [powerOn, setPowerOn] = useState(true);
  const [carriersOn, setCarriersOn] = useState(true);
  const [base, setBase] = useState("streets");

  const mapRef = useRef(null);
  const ctrl = useRef(null);

  useEffect(() => () => { ctrl.current?.destroy?.(); ctrl.current = null; }, []);

  const run = useCallback(async () => {
    if (!targetA || !Number.isFinite(Number(targetA.latitude)) || !Number.isFinite(Number(targetA.longitude))) {
      toast.error("Target A coordinates not resolved — re-run Section 3.");
      return;
    }
    const lat = Number(targetA.latitude);
    const lon = Number(targetA.longitude);
    setError(null);
    setLoading(true);
    // 20s watchdog — never spin forever.
    const watchdog = setTimeout(() => {
      setLoading((cur) => {
        if (cur) setError("Infrastructure load timed out after 20s — try Regenerate.");
        return false;
      });
    }, 20000);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg.mapboxAccessToken;
      if (!token) { toast.error("Mapbox token unavailable."); setLoading(false); return; }

      const res = await section7Infrastructure({ lat, lon, radius_miles: radiusMiles });
      const data = res.data;
      if (data?.error) throw new Error(data.error);

      ctrl.current?.destroy?.();
      ctrl.current = null;
      await new Promise((r) => requestAnimationFrame(r));

      const controller = await renderInfrastructure(mapRef.current, targetA, data, token);
      ctrl.current = controller;
      setUtility(data.utility || null);
      setFccCoverage(data.carriers?.coverage || null);
      setCounts({ power: data.power?.count || 0, fiber: data.fiber?.count || 0, carriers: data.carriers?.count || 0 });
      // Emit fiber + carriers to the bus (Fiber/backhaul scorecard factor).
      // NOTE: §7's utility (electricProviderContact = nearest provider office) is
      // intentionally NOT emitted as the Power factor — Power canonical is HIFLD
      // electricUtilityLookup (whose-territory-you're-in). §7 utility stays a map banner only.
      onData?.({
        fiber: { count: data.fiber?.count || 0 },
        carriers: {
          telco: data.carriers?.telco || null,
          count: data.carriers?.count || 0,
          lit_buildings: data.carriers?.lit_buildings || [],
        },
      });
      // Reset interactive controls to defaults: all layers ON, Streets view.
      setPowerOn(true); setCarriersOn(true); setBase("streets");
      setDone(true);
      toast.success(`Infrastructure map generated for Target A — ${data.power?.count || 0} power features · ${data.carriers?.count || 0} FCC-reported fiber providers.`);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Infrastructure map failed.");
      toast.error(err?.message || "Infrastructure map failed.");
    } finally {
      clearTimeout(watchdog);
      setLoading(false);
    }
  }, [targetA, radiusMiles]);

  // The Run button also arms the section (pipelineStep → "infrastructure").
  const beginAndRun = () => { if (!active) onRun?.(); run(); };

  // ── interactive toolbar handlers ──
  const togglePower = () => { const v = !powerOn; setPowerOn(v); ctrl.current?.toggleLayer("power", v); };
  const toggleCarriers = () => { const v = !carriersOn; setCarriersOn(v); ctrl.current?.toggleLayer("carriers", v); };
  const switchBase = (b) => {
    setBase(b);
    ctrl.current?.setBaseStyle(b === "satellite" ? SAT_STYLE : STREETS_STYLE);
    // Re-apply current visibility after the style swap settles.
    setTimeout(() => {
      ctrl.current?.toggleLayer("power", powerOn);
      ctrl.current?.toggleLayer("carriers", carriersOn);
    }, 400);
  };

  // ── LOCKED — no Target A resolved yet ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 11 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Infrastructure Vision — Target A</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Select Target A in Section 3 to unlock the Target A infrastructure map.
        </div>
      </div>
    );
  }

  const ownerLabel = targetA?.owner || targetA?.parcel_address || "";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-white" style={{ background: BRAND_GREEN }}>
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 11 · INFRASTRUCTURE</div>
            <h2 className="font-heading font-bold text-lg leading-tight">HAWK INFRASTRUCTURE VISION — TARGET A</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">
              Power transmission · FCC fiber availability{ownerLabel ? ` · ${ownerLabel}` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {active && onClear && <SectionClearButton onClear={onClear} />}
          {!done ? (
            <Button onClick={beginAndRun} disabled={loading} className="bg-white hover:bg-white/90 font-semibold shadow" style={{ color: BRAND_GREEN }}>
              <Sparkles className="w-4 h-4 mr-2" /> Run Infrastructure Map
            </Button>
          ) : (
            <Button onClick={beginAndRun} disabled={loading} variant="outline" className="bg-white/10 border-white/40 text-white hover:bg-white/20 font-semibold">
              <RefreshCw className="w-4 h-4 mr-2" /> Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Utility-to-contact banner */}
      {done && utility && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-sm flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground">Utility to contact:</span>
          <span className="font-mono">{utility.name}</span>
          {utility.phone && <span className="font-mono text-muted-foreground">· 📞 {utility.phone}</span>}
          <span className="ml-auto text-[11px] font-mono text-muted-foreground">
            {counts.power} power · {counts.carriers} FCC fiber providers
          </span>
        </div>
      )}

      {/* FCC BDC availability summary — area-level, never presented as a parcel service confirmation. */}
      {done && fccCoverage && (
        <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <span className="font-semibold text-primary">FCC fiber availability:</span>
          <span className="font-mono">{fccCoverage.coverage?.fiber?.servedPct ?? "No data"}% served BSLs</span>
          <span className="font-mono text-muted-foreground">· {fccCoverage.provider_count ?? "No data"} provider(s) reported in the block group</span>
          <span className="ml-auto text-[11px] text-muted-foreground">Area summary only · confirm parcel service directly</span>
        </div>
      )}

      {loading && <HawkFlightSpinner label="Loading power & fiber infrastructure for Target A…" />}

      {/* Error surface — no silent forever-spinner. */}
      {error && !loading && (
        <div className="px-4 py-4 bg-destructive/5 border-y border-destructive/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-destructive">Infrastructure map failed: {error}</div>
            <Button onClick={beginAndRun} size="sm" variant="outline" className="mt-2 border-destructive/40 text-destructive hover:bg-destructive/10">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        </div>
      )}

      {!loading && !done && !error && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          One interactive map for Target A — public power infrastructure plus official FCC block-group fiber availability.
          Click <span className="font-semibold text-foreground">Run Infrastructure Map</span> to load, then drive it with the toolbar.
        </div>
      )}

      {/* Map stays mounted once generated so interaction persists. It must be
          visible & sized BEFORE renderInfrastructure runs — Mapbox GL cannot
          measure a display:none (0×0) container, so it would never paint tiles
          or the power/fiber data layers. Keep it rendered whenever loading||done. */}
      <div style={{ display: (loading || done) ? "block" : "none" }}>
        <div className="relative w-full bg-[#0C1B2E]" style={{ height: 600 }}>
          <div ref={mapRef} className="absolute inset-0" />

          {/* Floating interactive toolbar */}
          <InfraToolbar
            powerOn={powerOn} carriersOn={carriersOn} base={base}
            onTogglePower={togglePower} onToggleCarriers={toggleCarriers}
            onSwitchBase={switchBase}
            onZoomIn={() => ctrl.current?.zoomIn?.()}
            onZoomOut={() => ctrl.current?.zoomOut?.()}
            onReset={() => ctrl.current?.resetView?.()}
          />

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 px-2.5 py-2 rounded-lg bg-black/60 backdrop-blur text-white text-[11px] font-mono leading-tight space-y-1">
            <div className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#E60000" }} /> power pole / tower</div>
            <div className="flex items-center gap-1.5"><span className="inline-block w-3.5 h-3.5 rounded-full" style={{ background: "#E60000" }} /> transformer / substation</div>
            <div className="text-[10px] text-white/70">FCC coverage is area-level; no private route or lit-building points are inferred.</div>
          </div>
        </div>
      </div>
    </div>
  );
}