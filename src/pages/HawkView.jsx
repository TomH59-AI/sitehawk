/**
 * HawkView — Standalone Viewshed Analysis for an ad-hoc Target A coordinate.
 * Aerial ring + tower waypoint, then N/S/E/W tree-line viewshed maps with
 * transparent RF cones and USGS elevation profiles. Same engine as the SCIP
 * Step 5 viewshed (scipViewshed) so the look matches the printed SCIP.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, MapPin, Compass, Loader2 } from "lucide-react";
import { scipViewshed } from "@/functions/scipViewshed";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import HawkIcon from "@/components/HawkIcon";
import ScipViewshedPage from "@/components/skywave/ScipViewshedPage";

export default function HawkView() {
  const { state } = useLocation();
  const incoming = state?.candidate || null;

  const [lat, setLat] = useState(incoming?.latitude ?? "");
  const [lon, setLon] = useState(incoming?.longitude ?? "");
  const [siteName] = useState(incoming?.site_name || incoming?.parcel_address || "Target A");
  const [busy, setBusy] = useState(false);
  const [viewshed, setViewshed] = useState(null);

  useEffect(() => {
    if (lat === "" || lon === "") {
      try {
        const cached = sessionStorage.getItem("hawk-view-target");
        if (cached) {
          const t = JSON.parse(cached);
          if (t.lat) setLat(t.lat);
          if (t.lon) setLon(t.lon);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (lat !== "" && lon !== "") {
      try { sessionStorage.setItem("hawk-view-target", JSON.stringify({ lat, lon })); } catch {}
    }
  }, [lat, lon]);

  async function generate() {
    const latN = parseFloat(lat), lonN = parseFloat(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      toast.error("Enter valid Target A coordinates first.");
      return;
    }
    setBusy(true);
    try {
      const res = await scipViewshed({ lat: latN, lon: lonN, ring_miles: 0.25, tower_height_ft: 199 });
      const vs = res.data?.viewshed;
      if (!vs) throw new Error("no viewshed");
      setViewshed(vs);
      toast.success("Viewshed generated");
    } catch {
      toast.error("Viewshed generation failed — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent border border-cyan-500/30 px-5 py-4 flex items-center gap-4">
        <HawkIcon size={42} />
        <div className="flex-1">
          <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em]">HAWK VIEW · TREE-LINE VIEWSHED</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">
            Four-Direction Obstruction Survey
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Aerial ring + N/E/S/W viewshed maps with transparent RF cones and USGS elevation profiles for <strong>{siteName}</strong>.
          </p>
        </div>
        <Eye className="w-10 h-10 text-cyan-600 opacity-80" />
      </div>

      {/* Target A coordinate input */}
      <div className="rounded-xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-primary" />
          <div className="font-heading font-semibold text-sm text-foreground">Target A Coordinates</div>
          <Compass className="w-4 h-4 text-muted-foreground ml-auto" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="hv-lat" className="text-xs">Latitude</Label>
            <Input id="hv-lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 27.8434" className="font-mono" />
          </div>
          <div>
            <Label htmlFor="hv-lon" className="text-xs">Longitude</Label>
            <Input id="hv-lon" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="e.g. -82.2871" className="font-mono" />
          </div>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          {viewshed ? "Refresh Viewshed" : "Generate Viewshed"}
        </button>
        <p className="text-[11px] text-muted-foreground mt-2">
          Tip: open a SCIP and click "Hawk View" to auto-load Target A's coordinates here.
        </p>
      </div>

      {/* Viewshed output */}
      {viewshed && (
        <div className="rounded-xl bg-white border border-border p-4">
          <ScipViewshedPage viewshed={viewshed} siteName={siteName} />
        </div>
      )}
    </div>
  );
}