/**
 * SiteEvaluate — /dashboard/evaluate
 *
 * Final SiteHawk evaluation page. Accepts coordinates + tower height,
 * and a Generate button that routes the operator into the existing
 * SCIPPreview pipeline as a candidate. Intentionally minimal — this is
 * the entry-point placeholder for the Aviation & Land Intel workflow.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, Crosshair, Antenna, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SiteEvaluate() {
  const navigate = useNavigate();
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [towerHeightFt, setTowerHeightFt] = useState("199");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function handleGenerate() {
    setError(null);
    const latNum = Number(lat);
    const lonNum = Number(lon);
    const heightNum = Number(towerHeightFt);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      setError("Enter valid latitude and longitude.");
      return;
    }
    if (!Number.isFinite(heightNum) || heightNum <= 0) {
      setError("Enter a valid tower height in feet.");
      return;
    }
    setSubmitting(true);
    navigate("/scip", {
      state: {
        candidate: {
          site_name: `Manual Evaluation @ ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`,
          latitude: latNum,
          longitude: lonNum,
        },
        searchCenter: { lat: latNum, lon: lonNum },
        searchParams: { tower_height_ft: heightNum },
      },
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="rounded-xl bg-gradient-to-r from-sky-500/15 via-transparent to-transparent border border-sky-500/30 px-5 py-4 flex items-center gap-4">
        <Plane className="w-10 h-10 text-sky-500" />
        <div className="flex-1">
          <div className="text-[10px] font-mono text-sky-700 tracking-[0.3em]">AVIATION & LAND INTEL</div>
          <h1 className="font-heading font-bold text-2xl text-foreground leading-tight">
            Site Evaluation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Drop in coordinates and a proposed tower height to launch a full SCIP evaluation.
          </p>
        </div>
      </div>

      <div className="border border-border rounded-xl bg-card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" /> Latitude
            </Label>
            <Input
              placeholder="e.g. 27.9506"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Crosshair className="w-3.5 h-3.5" /> Longitude
            </Label>
            <Input
              placeholder="e.g. -82.4572"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              inputMode="decimal"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Antenna className="w-3.5 h-3.5" /> Tower Height (ft AGL)
          </Label>
          <Input
            type="number"
            min={20}
            max={1500}
            value={towerHeightFt}
            onChange={(e) => setTowerHeightFt(e.target.value)}
          />
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={submitting}
          className="w-full bg-sky-600 hover:bg-sky-700 text-white"
        >
          <Rocket className="w-4 h-4 mr-2" />
          Generate Site Evaluation
        </Button>
      </div>

      <div className="text-[10px] font-mono text-muted-foreground tracking-wider text-center pt-2">
        ROUTES INTO · SCIP PIPELINE · ZONING · RF · INFRASTRUCTURE · OWNER INTEL
      </div>
    </div>
  );
}