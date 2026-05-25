/**
 * Instant3DZoningSimulator — On-Air Zoning & Simulation panel.
 *
 * Lets the operator enter tower height, parcel dimensions, setback/fall-zone,
 * residential separation, and PE-letter eligibility, then fires the
 * `replicateFluxRender` backend to generate two photorealistic Flux.1
 * renders (drone + eye-level) for leasing & zoning presentations.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Antenna, Ruler, Shield, Home, BadgeCheck, AlertTriangle, Download } from "lucide-react";
import { replicateFluxRender } from "@/functions/replicateFluxRender";

export default function Instant3DZoningSimulator({
  defaultTowerHeight = 120,
  defaultDimensions = "200x200",
  defaultSetbacks = 50,
  defaultSeparation = 200,
}) {
  const [towerHeight, setTowerHeight] = useState(defaultTowerHeight);
  const [dimensions, setDimensions] = useState(defaultDimensions);
  const [setbacks, setSetbacks] = useState(defaultSetbacks);
  const [separation, setSeparation] = useState(defaultSeparation);
  const [peAllowed, setPeAllowed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await replicateFluxRender({
        tower_height: Number(towerHeight),
        dimensions,
        setbacks: Number(setbacks),
        separation: Number(separation),
        pe_letter_allowed: peAllowed,
      });
      const data = resp.data;
      if (!data?.drone_url || !data?.eye_level_url) {
        throw new Error("Replicate did not return both renders.");
      }
      setResult(data);
      toast.success("3D site simulation layouts generated.");
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.message || "Render failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500/20 via-purple-500/15 to-transparent border-b border-border px-5 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-indigo-500" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-mono text-indigo-700 tracking-[0.3em]">INSTANT 3D ZONING SIMULATOR</div>
          <h3 className="font-heading font-bold text-lg text-foreground leading-tight">
            On-Air Zoning &amp; Simulation
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate landlord-ready 3D presentation renders from your zoning specs in seconds.
          </p>
        </div>
      </div>

      {/* Inputs */}
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Antenna className="w-3.5 h-3.5 text-indigo-500" /> Tower Height (ft)
          </Label>
          <Input
            type="number"
            min={20}
            max={500}
            value={towerHeight}
            onChange={(e) => setTowerHeight(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-indigo-500" /> Parcel Dimensions (ft)
          </Label>
          <Input
            type="text"
            placeholder="e.g. 200x200"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            className="h-9 font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-500" /> Required Setbacks &amp; Fall Zones (ft)
          </Label>
          <Input
            type="number"
            min={0}
            max={500}
            value={setbacks}
            onChange={(e) => setSetbacks(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5">
            <Home className="w-3.5 h-3.5 text-indigo-500" /> Separation from Residential (ft)
          </Label>
          <Input
            type="number"
            min={0}
            max={2000}
            value={separation}
            onChange={(e) => setSeparation(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="md:col-span-2 flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2.5">
          <Checkbox
            id="pe-letter"
            checked={peAllowed}
            onCheckedChange={(v) => setPeAllowed(!!v)}
            className="mt-0.5"
          />
          <Label htmlFor="pe-letter" className="text-xs leading-snug cursor-pointer">
            <span className="font-semibold text-foreground">Jurisdiction Allows PE Letter?</span>
            <span className="block text-muted-foreground mt-0.5">
              Check if a Professional Engineer structural certification can be submitted in lieu of a full zoning hearing.
            </span>
          </Label>
        </div>
      </div>

      {/* Generate button */}
      <div className="px-5 pb-5">
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full h-11 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rendering 3D Layouts…</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" />Generate 3D Site Simulation Layouts</>
          )}
        </Button>
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mt-3">
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && <SimulationResults result={result} />}
    </div>
  );
}

function SimulationResults({ result }) {
  const { drone_url, eye_level_url, pe_letter_allowed } = result;
  return (
    <div className="border-t border-border bg-muted/20 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="font-heading font-bold text-base text-foreground">
          Leasing &amp; Zoning Presentation Assets
        </h4>
        {pe_letter_allowed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800 border border-green-300">
            <BadgeCheck className="w-3.5 h-3.5" />
            Zoning Fast-Track: PE Structural Certification Eligible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Full Zoning Hearing &amp; Fall Zone Review Required
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RenderCard
          title="Drone / Aerial Perspective"
          subtitle="High-angle compound overview"
          url={drone_url}
        />
        <RenderCard
          title="Eye-Level / Landlord Perspective"
          subtitle="Property-line view, golden hour"
          url={eye_level_url}
        />
      </div>
    </div>
  );
}

function RenderCard({ title, subtitle, url }) {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
      <div className="aspect-video bg-muted relative">
        <img src={url} alt={title} className="w-full h-full object-cover" />
      </div>
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-heading font-semibold text-sm text-foreground truncate">{title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        </div>
        <a
          href={url}
          download
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold shrink-0"
        >
          <Download className="w-3.5 h-3.5" /> Save
        </a>
      </div>
    </div>
  );
}