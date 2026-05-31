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
import { Lock, Network, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "./HawkFlightSpinner";
import InfraToolbar from "./section7/InfraToolbar";
import { loadPublicConfig } from "@/lib/publicConfig";
import { section7Infrastructure } from "@/functions/section7Infrastructure";
import {
  renderInfrastructure, STREETS_STYLE, SAT_STYLE, BRAND_GREEN,
} from "@/lib/section7Infrastructure";

export default function Section7Infrastructure({
  unlocked, active, targetA, radiusMiles = 0.5, onRun,
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [utility, setUtility] = useState(null);
  const [counts, setCounts] = useState({ power: 0, fiber: 0 });
  const [powerOn, setPowerOn] = useState(true);
  const [fiberOn, setFiberOn] = useState(true);
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
    setLoading(true);
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
      setCounts({ power: data.power?.count || 0, fiber: data.fiber?.count || 0 });
      // Reset interactive controls to defaults: both layers ON, Streets view.
      setPowerOn(true); setFiberOn(true); setBase("streets");
      setDone(true);
      toast.success(`Infrastructure map generated for Target A — ${data.power?.count || 0} power · ${data.fiber?.count || 0} fiber.`);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "Infrastructure map failed.");
    } finally {
      setLoading(false);
    }
  }, [targetA, radiusMiles]);

  // The Run button also arms the section (pipelineStep → "infrastructure").
  const beginAndRun = () => { if (!active) onRun?.(); run(); };

  // ── interactive toolbar handlers ──
  const togglePower = () => { const v = !powerOn; setPowerOn(v); ctrl.current?.toggleLayer("power", v); };
  const toggleFiber = () => { const v = !fiberOn; setFiberOn(v); ctrl.current?.toggleLayer("fiber", v); };
  const switchBase = (b) => {
    setBase(b);
    ctrl.current?.setBaseStyle(b === "satellite" ? SAT_STYLE : STREETS_STYLE);
    // Re-apply current visibility after the style swap settles.
    setTimeout(() => {
      ctrl.current?.toggleLayer("power", powerOn);
      ctrl.current?.toggleLayer("fiber", fiberOn);
    }, 400);
  };

  // ── LOCKED — Section 6 not complete / no Target A ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 7 · LOCKED</div>
            <h2 className="font-heading font-bold text-lg leading-tight">Hawk Infrastructure Vision — Target A</h2>
          </div>
        </div>
        <div className="px-4 py-6 text-sm text-muted-foreground">
          Complete all three maps in Section 6 to unlock the Target A infrastructure map.
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
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · SECTION 7 · INFRASTRUCTURE</div>
            <h2 className="font-heading font-bold text-lg leading-tight">HAWK INFRASTRUCTURE VISION — TARGET A</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">
              Power poles &amp; transformers · fiber runs &amp; splice points{ownerLabel ? ` · ${ownerLabel}` : ""}
            </div>
          </div>
        </div>
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

      {/* Utility-to-contact banner */}
      {done && utility && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-sm flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground">Utility to contact:</span>
          <span className="font-mono">{utility.name}</span>
          {utility.phone && <span className="font-mono text-muted-foreground">· 📞 {utility.phone}</span>}
          <span className="ml-auto text-[11px] font-mono text-muted-foreground">
            {counts.power} power · {counts.fiber} fiber assets
          </span>
        </div>
      )}

      {loading && <HawkFlightSpinner label="Loading power & fiber infrastructure for Target A…" />}

      {!loading && !done && (
        <div className="px-4 py-6 text-sm text-muted-foreground">
          One interactive map for Target A — power poles &amp; transformers and fiber runs within the search radius.
          Click <span className="font-semibold text-foreground">Run Infrastructure Map</span> to load, then drive it with the toolbar.
        </div>
      )}

      {/* Map stays mounted once generated so interaction persists. */}
      <div style={{ display: done && !loading ? "block" : "none" }}>
        <div className="relative w-full bg-[#0C1B2E]" style={{ height: 600 }}>
          <div ref={mapRef} className="absolute inset-0" />

          {/* Floating interactive toolbar */}
          <InfraToolbar
            powerOn={powerOn} fiberOn={fiberOn} base={base}
            onTogglePower={togglePower} onToggleFiber={toggleFiber}
            onSwitchBase={switchBase}
            onZoomIn={() => ctrl.current?.zoomIn?.()}
            onZoomOut={() => ctrl.current?.zoomOut?.()}
            onReset={() => ctrl.current?.resetView?.()}
          />

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-10 px-2.5 py-2 rounded-lg bg-black/60 backdrop-blur text-white text-[11px] font-mono leading-tight space-y-1">
            <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#E60000" }} /> power (pole / transformer)</div>
            <div className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5" style={{ background: "#FF8C00" }} /> fiber run</div>
          </div>
        </div>
      </div>
    </div>
  );
}