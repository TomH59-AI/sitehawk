import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Trees, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { resolveActiveTargetA } from "@/lib/hawkfitTargetResolver";
import NlcdLandCoverMap from "@/components/nlcd/NlcdLandCoverMap";

// NLCD Land Cover + Impervious Surface — pipeline-embedded section mounted
// immediately AFTER HawkFit Map. Centers on the SAME active Target A HawkFit
// resolves (same resolver + priority order), with two independent USGS/MRLC
// WMS overlays (both off by default) and one shared opacity slider.
export default function NlcdLandCoverSection({ unlocked, targetA }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [siteTarget, setSiteTarget] = useState(null);
  const [layers, setLayers] = useState({ landcover: false, impervious: false });
  const [opacity, setOpacity] = useState(0.7);

  const targetKey = targetA ? `${targetA.latitude},${targetA.longitude}` : "none";
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    (async () => {
      setResolving(true);
      const res = await resolveActiveTargetA({ pipelineTarget: targetA });
      if (cancelled) return;
      setSiteTarget(res?.target || null);
      setResolving(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, targetKey]);

  if (!unlocked) return null;

  const hasCoords =
    siteTarget && Number.isFinite(Number(siteTarget.latitude)) && Number.isFinite(Number(siteTarget.longitude));
  const targetLabel = siteTarget?.address || siteTarget?.parcel_id || null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Trees className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-heading font-bold text-foreground">NLCD Land Cover + Impervious Surface</div>
            <div className="text-xs text-muted-foreground">
              USGS / MRLC Annual NLCD (2019) land cover &amp; impervious-surface overlays on the active Target A.
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? "Collapse" : "Open NLCD"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {resolving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Resolving active Target A…
            </div>
          )}

          {!resolving && !hasCoords && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              No active Target A found in the pipeline. Run Section 3 (Targets) or load a parcel above.
            </div>
          )}

          {hasCoords && (
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              <div className="space-y-4">
                {targetLabel && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Active Target A</div>
                    <div className="font-heading font-bold text-foreground break-words">{targetLabel}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {Number(siteTarget.latitude).toFixed(6)}, {Number(siteTarget.longitude).toFixed(6)}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-border p-3 space-y-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Overlays</div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="nlcd-landcover-toggle" className="text-sm text-foreground">NLCD Land Cover (2019)</Label>
                    <Switch
                      id="nlcd-landcover-toggle"
                      checked={layers.landcover}
                      onCheckedChange={(v) => setLayers((l) => ({ ...l, landcover: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="nlcd-impervious-toggle" className="text-sm text-foreground">NLCD Impervious Surface (2019)</Label>
                    <Switch
                      id="nlcd-impervious-toggle"
                      checked={layers.impervious}
                      onCheckedChange={(v) => setLayers((l) => ({ ...l, impervious: v }))}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground">Overlay opacity</Label>
                    <span className="text-xs font-mono text-muted-foreground">{Math.round(opacity * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[opacity]}
                    onValueChange={(v) => setOpacity(v[0])}
                  />
                </div>

                <p className="text-[10px] text-muted-foreground">Source: USGS / MRLC Annual NLCD</p>
              </div>

              <div className="min-h-[480px] lg:h-[640px]">
                <NlcdLandCoverMap
                  latitude={Number(siteTarget.latitude)}
                  longitude={Number(siteTarget.longitude)}
                  layers={layers}
                  opacity={opacity}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}