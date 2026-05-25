/**
 * SiteParametersForm — Stage 0 of the SCIP workflow.
 *
 * The operator enters all Site Parameters (coordinates, tower height,
 * compound dimensions, setbacks, search radius) up-front. Only after
 * they click "Scan" do we kick off the Zoning + Permit report (which
 * pulls from the Notion Master Zoning folder + state subfolders).
 *
 * Pure UI. Owns its own local state and calls onScan(params) once.
 */

import { useState } from "react";
import { Crosshair, Antenna, Ruler, Compass, Search, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Field({ icon: Icon, label, children, hint }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1.5 text-slate-700">
        {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
        {label}
      </Label>
      {children}
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function SiteParametersForm({ initial = {}, onScan, scanning }) {
  const [lat, setLat] = useState(initial.lat ?? "");
  const [lon, setLon] = useState(initial.lon ?? "");
  const [towerHeightFt, setTowerHeightFt] = useState(initial.tower_height_ft ?? 199);
  const [compoundWidthFt, setCompoundWidthFt] = useState(initial.compound_width_ft ?? 100);
  const [compoundDepthFt, setCompoundDepthFt] = useState(initial.compound_depth_ft ?? 100);
  const [setbackFt, setSetbackFt] = useState(initial.setback_ft ?? 50);
  const [radiusMiles, setRadiusMiles] = useState(initial.radius_miles ?? 1.0);
  const [error, setError] = useState(null);

  function handleScan() {
    setError(null);
    const latNum = Number(lat);
    const lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      setError("Enter valid latitude and longitude before scanning.");
      return;
    }
    onScan({
      lat: latNum,
      lon: lonNum,
      tower_height_ft: Number(towerHeightFt) || 0,
      compound_width_ft: Number(compoundWidthFt) || 0,
      compound_depth_ft: Number(compoundDepthFt) || 0,
      setback_ft: Number(setbackFt) || 0,
      radius_miles: Number(radiusMiles) || 1.0,
    });
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="bg-slate-700 text-white px-4 py-2.5 flex items-center gap-2">
        <Compass className="w-4 h-4 text-amber-400" />
        <h3 className="font-heading font-semibold text-sm tracking-wide">
          STEP 1 — SITE PARAMETERS
        </h3>
        <span className="text-[10px] font-mono text-slate-300 ml-auto tracking-wider">
          ENTER ALL FIELDS · THEN CLICK SCAN
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field icon={Crosshair} label="Latitude">
          <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 27.9506" inputMode="decimal" />
        </Field>
        <Field icon={Crosshair} label="Longitude">
          <Input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="e.g. -82.4572" inputMode="decimal" />
        </Field>
        <Field icon={Antenna} label="Tower Height (ft AGL)">
          <Input type="number" min={20} max={1500} value={towerHeightFt} onChange={(e) => setTowerHeightFt(e.target.value)} />
        </Field>
        <Field icon={Ruler} label="Compound Width (ft)">
          <Input type="number" min={20} value={compoundWidthFt} onChange={(e) => setCompoundWidthFt(e.target.value)} />
        </Field>
        <Field icon={Ruler} label="Compound Depth (ft)">
          <Input type="number" min={20} value={compoundDepthFt} onChange={(e) => setCompoundDepthFt(e.target.value)} />
        </Field>
        <Field icon={Shield} label="Setback (ft)" hint="Distance from property line">
          <Input type="number" min={0} value={setbackFt} onChange={(e) => setSetbackFt(e.target.value)} />
        </Field>
        <Field icon={Search} label="Search Radius (miles)" hint="SARF / parcel scan ring">
          <Input type="number" min={0.25} max={10} step={0.25} value={radiusMiles} onChange={(e) => setRadiusMiles(e.target.value)} />
        </Field>
      </div>

      {error && (
        <div className="mx-4 mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="border-t border-border bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Scan will auto-populate the full Zoning + Permit report from the Notion Master Zoning folder & state subfolder.
        </div>
        <Button
          onClick={handleScan}
          disabled={scanning}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Search className="w-4 h-4 mr-2" />
          {scanning ? "Scanning…" : "Scan"}
        </Button>
      </div>
    </div>
  );
}