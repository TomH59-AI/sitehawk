import { useState } from "react";
import { Loader2, Radar, Mountain } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cloudRFCoverage } from "@/functions/cloudRFCoverage";
import {
  addViewshedOverlay, removeViewshedOverlay,
  setTerrain3D, addTowerExtrusion, removeTowerExtrusion,
} from "@/lib/mapViewshed3d";

// Toggle bar attached to a live Mapbox GL map: CloudRF RF viewshed image overlay
// (generated from the tower's coordinates + height) and a 2D ⇆ 3D terrain tilt
// with the tower extruded at its location.
export default function ViewshedTerrainControls({ mapRef, lat, lon, heightFt = 199, label = "" }) {
  const [viewshedOn, setViewshedOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [on3D, setOn3D] = useState(false);

  const liveMap = () => {
    const m = mapRef?.current;
    return m && !m._removed && m.getStyle ? m : null;
  };

  const toggleViewshed = async (on) => {
    const map = liveMap();
    if (!map) { toast.error("This map is no longer interactive — regenerate it first."); return; }
    setViewshedOn(on);
    if (!on) { removeViewshedOverlay(map); return; }
    let d = data;
    if (!d) {
      setBusy(true);
      try {
        const res = await cloudRFCoverage({
          lat: Number(lat), lon: Number(lon),
          height_ft: Number(heightFt) || 199,
          radius_mi: 3,
          site_name: label || "SiteHawk Viewshed",
        });
        const body = res?.data;
        if (!body?.png_url || !body?.bounds) throw new Error(body?.error || "No RF viewshed returned.");
        d = { png_url: body.png_url, bounds: body.bounds };
        setData(d);
      } catch (e) {
        console.error("CloudRF viewshed failed:", e);
        toast.error(e?.response?.data?.error || e.message || "RF viewshed failed.");
        setViewshedOn(false);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    const m2 = liveMap();
    if (m2) addViewshedOverlay(m2, d);
  };

  const toggle3D = (on) => {
    const map = liveMap();
    if (!map) { toast.error("This map is no longer interactive — regenerate it first."); return; }
    setOn3D(on);
    try {
      setTerrain3D(map, on);
      if (on) addTowerExtrusion(map, Number(lon), Number(lat), Number(heightFt) || 199);
      else removeTowerExtrusion(map);
    } catch (e) {
      console.error("3D toggle failed:", e);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur shadow-lg p-3 space-y-2.5 w-60">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Radar className="w-4 h-4 text-primary" />}
          <Label className="text-xs font-semibold text-foreground">RF Viewshed (CloudRF)</Label>
        </div>
        <Switch checked={viewshedOn} onCheckedChange={toggleViewshed} disabled={busy} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-primary" />
          <Label className="text-xs font-semibold text-foreground">3D Terrain</Label>
        </div>
        <Switch checked={on3D} onCheckedChange={toggle3D} />
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        Coverage simulated from the tower at {Math.round(Number(heightFt) || 199)} ft · drag to rotate in 3D
      </p>
    </div>
  );
}