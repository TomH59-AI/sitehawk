import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Mountain, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { resolveActiveTargetA } from "@/lib/hawkfitTargetResolver";
import TerrainMap from "@/components/terrain/TerrainMap";

// Selectable basemap "looks" of the terrain.
const TERRAIN_STYLES = [
  { key: "satellite", label: "Satellite", url: "mapbox://styles/mapbox/satellite-v9" },
  { key: "hybrid", label: "Satellite + Streets", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { key: "outdoors", label: "Outdoors / Topo", url: "mapbox://styles/mapbox/outdoors-v12" },
  { key: "streets", label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  { key: "light", label: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { key: "dark", label: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
];

// Terrain Explorer — the LAST map in the pipeline. Centers on the SAME active
// Target A the rest of the pipeline resolves, with basemap-style toggles for
// different "looks" of the terrain plus an optional 3D terrain exaggeration.
export default function TerrainMapSection({ unlocked, targetA }) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [siteTarget, setSiteTarget] = useState(null);
  const [styleKey, setStyleKey] = useState("hybrid");
  const [terrain3D, setTerrain3D] = useState(false);
  const [exaggeration, setExaggeration] = useState(1.5);

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
  const activeStyle = TERRAIN_STYLES.find((s) => s.key === styleKey) || TERRAIN_STYLES[1];

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Mountain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <div className="font-heading font-bold text-foreground">Terrain Explorer</div>
            <div className="text-xs text-muted-foreground">
              Switch between different terrain looks (satellite, topo, streets, dark) and 3D terrain on the active Target A.
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {expanded ? "Collapse" : "Open Terrain"}
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

                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Terrain Look</div>
                  <div className="grid grid-cols-2 gap-2">
                    {TERRAIN_STYLES.map((s) => (
                      <Button
                        key={s.key}
                        size="sm"
                        variant={styleKey === s.key ? "default" : "outline"}
                        className="justify-start text-xs h-8"
                        onClick={() => setStyleKey(s.key)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="terrain-3d-toggle" className="text-sm text-foreground">3D Terrain</Label>
                    <Switch
                      id="terrain-3d-toggle"
                      checked={terrain3D}
                      onCheckedChange={setTerrain3D}
                    />
                  </div>
                  {terrain3D && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-foreground">Exaggeration</Label>
                        <span className="text-xs font-mono text-muted-foreground">{exaggeration.toFixed(1)}×</span>
                      </div>
                      <Slider
                        min={1}
                        max={4}
                        step={0.1}
                        value={[exaggeration]}
                        onValueChange={(v) => setExaggeration(v[0])}
                      />
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground">Basemaps &amp; terrain DEM: Mapbox</p>
              </div>

              <div className="min-h-[480px] lg:h-[640px]">
                <TerrainMap
                  latitude={Number(siteTarget.latitude)}
                  longitude={Number(siteTarget.longitude)}
                  styleUrl={activeStyle.url}
                  terrain3D={terrain3D}
                  exaggeration={exaggeration}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}