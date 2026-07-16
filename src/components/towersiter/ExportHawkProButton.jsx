/**
 * Export HawkPro Package (.zip) — Turtle Up build.
 *
 * Ships DARK: renders nothing unless HAWKPRO_EXPORT is flipped on in
 * src/lib/featureFlags.js. Reads ONLY from Tower Siter state already on the
 * page (parcel, result, controls, rules). No new APIs, no server calls.
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { HAWKPRO_EXPORT } from "@/lib/featureFlags";
import {
  buildHawkProLayers, buildReadme, buildAndDownloadZip,
  resolveFallPct, DEFAULT_BP_FRAC,
} from "@/lib/hawkProPackage";

export default function ExportHawkProButton({ parcel, result, controls, rules }) {
  const [open, setOpen] = useState(false);
  const [bpFrac, setBpFrac] = useState(String(DEFAULT_BP_FRAC));
  const [busy, setBusy] = useState(false);

  // Review flag OFF → ship dark. Also require a valid, non-collapsed siting.
  if (!HAWKPRO_EXPORT) return null;
  if (!result || result.collapsed || !parcel?.geometry) return null;

  const H = Number(controls?.heightFt) || 0;
  const compoundFt = Number(controls?.compoundW) || 100;
  const { source: fallSource } = resolveFallPct(rules, H);

  const handleExport = async () => {
    setBusy(true);
    try {
      const me = await base44.auth.me().catch(() => null);
      const agentName = me?.full_name || me?.email || "SiteHawk user";
      const bp = Number(bpFrac);
      if (!Number.isFinite(bp) || bp <= 0 || bp >= 1) {
        toast.error("Breakpoint fraction must be between 0 and 1.");
        setBusy(false);
        return;
      }

      const { layers, manifest, meta } = buildHawkProLayers({
        parcelGeoJSON: result.parcel || parcel.geometry,
        towerLonLat: result.towerLonLat,
        heightFt: H,
        bpFrac: bp,
        compoundFt,
        rules,
      });

      const readme = buildReadme({
        siteLabel: parcel.addressFull || parcel.apn || "Tower Siter scenario",
        parcelId: parcel.apn || null,
        jurisdiction: parcel.jurisdiction || null,
        manifest,
        meta,
        agentName,
      });

      const fname = await buildAndDownloadZip({ layers, readme, parcelId: parcel.apn });
      toast.success(`Exported ${fname}`);
      setOpen(false);
    } catch (e) {
      console.error("HawkPro export failed:", e);
      toast.error(e.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="w-full border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
        onClick={() => setOpen(true)}
      >
        <Package className="w-3.5 h-3.5 mr-1" /> Export HawkPro Package (.zip)
      </Button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export HawkPro Package</DialogTitle>
            <DialogDescription>
              Packages this scenario into 8 GeoJSON layers (WGS84) + README for the desktop
              HawkPro Bridge. Concept exhibit — not a survey.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-2">
                <div className="text-xs text-muted-foreground">Tower height (H)</div>
                <div className="font-semibold">{H} ft</div>
              </div>
              <div className="rounded-lg border p-2">
                <div className="text-xs text-muted-foreground">Compound side</div>
                <div className="font-semibold">{compoundFt} ft</div>
              </div>
            </div>

            <div>
              <Label htmlFor="bpFrac">Breakpoint fraction (BP_FRAC)</Label>
              <Input
                id="bpFrac"
                type="number"
                step="0.05"
                min="0.05"
                max="0.95"
                value={bpFrac}
                onChange={(e) => setBpFrac(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Default 0.80. Controls the breakpoint envelope/fall-radius layers.</p>
            </div>

            <div className="rounded-lg bg-muted/50 p-2 text-xs">
              Fall-zone factor:{" "}
              <b>{fallSource === "ordinance-derived" ? "ordinance-derived" : "default (110% of H)"}</b>
              {fallSource === "ordinance-derived" && rules?.jurisdiction ? ` · ${rules.jurisdiction}` : ""}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleExport} disabled={busy}>
              {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Building…</> : <><Package className="w-4 h-4 mr-1" /> Export .zip</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}