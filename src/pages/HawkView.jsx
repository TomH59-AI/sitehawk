/**
 * HawkView — Dedicated page with FOUR high-res viewshed maps (N / E / S / W)
 * over Target A, rendered with transparent conical RF beams in distinct colors
 * so the operator can spot tree-line obstructions.
 *
 * Engine: Mapbox satellite static images @2x (1280×1280) via ViewshedQuadGrid.
 * Operator can override Target A coordinates if needed.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, MapPin, Compass } from "lucide-react";
import SCIPViewshedSection from "../components/scip/SCIPViewshedSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import HawkIcon from "@/components/HawkIcon";

export default function HawkView() {
  const { state } = useLocation();
  const incoming = state?.candidate || null;

  const [lat, setLat] = useState(incoming?.latitude ?? "");
  const [lon, setLon] = useState(incoming?.longitude ?? "");
  const [siteName] = useState(incoming?.site_name || incoming?.parcel_address || "Target A");

  useEffect(() => {
    // If no nav-state target, fall back to last SCIP candidate persisted in sessionStorage.
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

  // Persist current target so the page survives a refresh.
  useEffect(() => {
    if (lat !== "" && lon !== "") {
      try { sessionStorage.setItem("hawk-view-target", JSON.stringify({ lat, lon })); } catch {}
    }
  }, [lat, lon]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent border border-cyan-500/30 px-5 py-4 flex items-center gap-4">
        <HawkIcon size={42} />
        <div className="flex-1">
          <div className="text-[10px] font-mono text-cyan-700 tracking-[0.3em]">HAWK VIEW · TREE-LINE VIEWSHED</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">
            Four-Direction Obstruction Survey
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            High-resolution Mapbox satellite imagery with transparent conical RF beams
            in <span className="text-cyan-600 font-semibold">N</span> ·{" "}
            <span className="text-pink-500 font-semibold">E</span> ·{" "}
            <span className="text-amber-500 font-semibold">S</span> ·{" "}
            <span className="text-emerald-500 font-semibold">W</span> for <strong>{siteName}</strong>.
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
            <Input
              id="hv-lat"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="e.g. 27.8434"
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="hv-lon" className="text-xs">Longitude</Label>
            <Input
              id="hv-lon"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="e.g. -82.2871"
              className="font-mono"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Tip: open a SCIP and click "Hawk View" to auto-load Target A's coordinates here.
        </p>
      </div>

      {/* The 4-up viewshed grid */}
      <SCIPViewshedSection
        candidate={{
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
          site_name: siteName,
        }}
      />

      <div className="text-center text-[10px] font-mono text-muted-foreground tracking-wider pt-2">
        MAPBOX SATELLITE @2x · 1280×1280 · ±22° BEAM · 0.6 MI REACH · CROSS-PROVIDER VIEWSHED
      </div>
    </div>
  );
}