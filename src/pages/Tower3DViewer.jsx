/**
 * Tower3DViewer — standalone page that generates an AI site illustration.
 * Route: /tower-3d-viewer
 * Accepts live result data via router state from Generate3DImageButton.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertTriangle, ImageIcon, ArrowLeft, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

function buildPrompt(render) {
  const heightFt = render.tower_height_ft || 199;
  const cwFt = render.compound_width_ft || 100;
  const cdFt = render.compound_depth_ft || 100;
  const towerType = render.tower_type || "monopole";
  const address = render.property_address || render.site_name || "rural property";
  const acreage = render.parcel_acres ? `${render.parcel_acres}-acre` : "large";
  const terrain = render.terrain_description || "flat to gently rolling terrain with natural grass and trees";

  const towerDesc = towerType === "lattice"
    ? `steel lattice self-support tower ${heightFt} feet tall`
    : towerType === "guyed"
    ? `guyed wire tower ${heightFt} feet tall with guy wires extending outward`
    : `galvanized steel monopole tower ${heightFt} feet tall`;

  return `Photorealistic architectural site illustration of a wireless telecommunications tower installation on a ${acreage} property. The scene shows:

- A ${towerDesc} with 3 sector panel antennas mounted near the top, standing on ${terrain}
- A ${cwFt} ft x ${cdFt} ft security compound at the base: gravel pad, chain-link fence with privacy slats, equipment shelters (gray metal cabinets), utility conduit runs
- Perimeter arborvitae privacy screening and native grass buffer around the compound fence
- The property boundary visible in the background with the surrounding natural landscape
- Clear blue sky with soft natural lighting, late afternoon sun angle casting realistic shadows from the tower and compound
- Ground-level perspective from just outside the compound fence, slightly elevated, looking toward the tower at a 30-degree angle
- Realistic depth of field — tower sharp in foreground, background property softly visible
- No text, no labels, no people, photorealistic rendering style similar to a construction visualization or architectural rendering

Property context: ${address}`;
}

export default function Tower3DViewer() {
  const location = useLocation();
  const routerState = location.state || {};
  const liveResult = routerState.liveResult || null;

  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [render, setRender] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { init(); }, []);

  async function init() {
    setStatus("loading");
    try {
      let rec;
      if (liveResult) {
        rec = {
          property_address: liveResult.propertyAddress || "Target A",
          site_name: liveResult.propertyAddress || "Target A",
          parcel_id: liveResult.parcelId || null,
          parcel_acres: liveResult.parcelAcres || null,
          tower_type: liveResult.towerType || "monopole",
          tower_height_ft: liveResult.towerHeightFt || 199,
          compound_width_ft: liveResult.compoundWidthFt || 100,
          compound_depth_ft: liveResult.compoundDepthFt || 100,
          terrain_description: liveResult.terrainDescription || null,
        };
      } else {
        // Fallback to most recent TowerSitingRun
        const runs = await base44.entities.TowerSitingRun.list("-created_date", 5);
        const run = runs.find(r => r.feasible) || runs[0];
        if (!run) throw new Error("No siting run found. Use the Tower Siter first.");
        rec = {
          property_address: run.property_address || "Target A",
          site_name: run.property_address || "Target A",
          parcel_id: run.parcel_id || null,
          tower_type: run.tower_type || "monopole",
          tower_height_ft: run.tower_height_ft || 199,
          compound_width_ft: run.compound_width_ft || 100,
          compound_depth_ft: run.compound_depth_ft || 100,
        };
      }
      setRender(rec);
      setStatus("ready");
    } catch (e) {
      setErrorMsg(e.message || "Unknown error");
      setStatus("error");
    }
  }

  async function generate() {
    if (!render) return;
    setGenerating(true);
    setImageUrl(null);
    try {
      const prompt = buildPrompt(render);
      const result = await base44.integrations.Core.GenerateImage({ prompt });
      if (!result?.url) throw new Error("No image returned");
      setImageUrl(result.url);
    } catch (e) {
      setErrorMsg(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `tower-site-illustration-${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  }

  return (
    <div className="min-h-screen bg-background p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to="/tower-siter">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Tower Siter
          </Button>
        </Link>
      </div>

      <h1 className="font-heading font-bold text-2xl text-foreground mb-1 flex items-center gap-2">
        <ImageIcon className="w-6 h-6 text-indigo-500" /> Tower Site Illustration
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        AI-generated realistic illustration of how this tower will look on the property — for landowner conversations.
      </p>

      {status === "loading" && (
        <div className="flex items-center gap-3 text-muted-foreground py-12">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading site data…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-destructive mb-1">Could not load site data</div>
            <div className="text-sm text-muted-foreground">{errorMsg}</div>
          </div>
        </div>
      )}

      {status === "ready" && render && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
            <div className="font-semibold text-foreground">{render.property_address || render.site_name}</div>
            {render.parcel_id && <div className="text-muted-foreground">Parcel: {render.parcel_id}</div>}
            <div className="text-muted-foreground">
              Tower: <b className="text-foreground">{render.tower_height_ft} ft AGL</b>
              {" · "}Compound: <b className="text-foreground">{render.compound_width_ft}×{render.compound_depth_ft} ft</b>
              {" · "}Type: <b className="text-foreground">{render.tower_type}</b>
            </div>
          </div>

          {!imageUrl && !generating && (
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold gap-2"
              onClick={generate}
            >
              <ImageIcon className="w-4 h-4" /> Generate Site Illustration
            </Button>
          )}

          {generating && (
            <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="font-semibold text-foreground">Generating illustration…</p>
              <p className="text-muted-foreground text-sm">Building a realistic view of this tower on the property — takes about 10–15 seconds.</p>
            </div>
          )}

          {imageUrl && (
            <div className="space-y-3">
              <img
                src={imageUrl}
                alt="AI tower site illustration"
                className="w-full rounded-xl border border-border shadow-lg object-cover"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={generate} disabled={generating}>
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </Button>
                <Button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white gap-2" onClick={handleDownload}>
                  <Download className="w-4 h-4" /> Download
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                AI-generated illustrative rendering — not a survey, stamped drawing, or final tower location
              </p>
            </div>
          )}

          {errorMsg && !generating && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}