/**
 * ThreeTower3DViewer — AI-generated photorealistic tower site illustration.
 * Uses GenerateImage with a detailed prompt built from real site data.
 * Replaces the old geometric Three.js viewer.
 */
import { useState, useEffect } from "react";
import { X, Download, RefreshCw, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

function buildPrompt(render) {
  const heightFt = render.tower_height_ft || 199;
  const cwFt = render.compound_width_ft || 100;
  const cdFt = render.compound_depth_ft || 100;
  const towerType = render.tower_type || "monopole";
  const address = render.property_address || render.site_name || "rural property";
  const acreage = render.parcel_acres ? `${render.parcel_acres}-acre` : "large";
  const terrain = render.terrain_description || "flat to gently rolling terrain with natural grass and trees";
  const landscaping = render.landscape_description || "perimeter arborvitae privacy screening and native grass buffer around the compound fence";

  const towerDesc = towerType === "lattice"
    ? `steel lattice self-support tower ${heightFt} feet tall`
    : towerType === "guyed"
    ? `guyed wire tower ${heightFt} feet tall with guy wires extending outward`
    : `galvanized steel monopole tower ${heightFt} feet tall`;

  return `Photorealistic architectural site illustration of a wireless telecommunications tower installation on a ${acreage} property. The scene shows:

- A ${towerDesc} with 3 sector panel antennas mounted near the top, standing on ${terrain}
- A ${cwFt} ft x ${cdFt} ft security compound at the base: gravel pad, chain-link fence with privacy slats, equipment shelters (gray metal cabinets), utility conduit runs
- ${landscaping}
- The property boundary visible in the background with the surrounding natural landscape
- Clear blue sky with soft natural lighting, late afternoon sun angle casting realistic shadows from the tower and compound
- Ground-level perspective from just outside the compound fence, slightly elevated, looking toward the tower at a 30-degree angle
- Realistic depth of field — tower sharp in foreground, background property softly visible
- No text, no labels, no people, photorealistic rendering style similar to a construction visualization or architectural rendering

Property context: ${address}`;
}

export default function ThreeTower3DViewer({ render, onClose, onSnapshot }) {
  const [status, setStatus] = useState("idle"); // idle | generating | done | error
  const [imageUrl, setImageUrl] = useState(render?.snapshot_image_url || null);
  const [errorMsg, setErrorMsg] = useState("");

  // Auto-generate on open if no image yet
  useEffect(() => {
    if (!imageUrl) generate();
  }, []);

  async function generate() {
    setStatus("generating");
    setErrorMsg("");
    try {
      const prompt = buildPrompt(render);
      const result = await base44.integrations.Core.GenerateImage({ prompt });
      const url = result?.url;
      if (!url) throw new Error("No image URL returned");

      setImageUrl(url);
      setStatus("done");

      // Persist to DB record if we have an id
      if (render?.id) {
        await base44.entities.Tower3DRender.update(render.id, {
          snapshot_image_url: url,
        }).catch(() => {});
      }

      if (onSnapshot) onSnapshot({ file_url: url });
    } catch (e) {
      console.error("AI image generation failed:", e);
      setErrorMsg(e.message || "Generation failed");
      setStatus("error");
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
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">Tower Site Illustration</span>
          <span className="text-xs text-slate-400 font-normal ml-1">
            {render?.tower_height_ft}′ {render?.tower_type} · {render?.compound_width_ft}×{render?.compound_depth_ft}′ compound
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "done" && (
            <>
              <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white gap-1.5" onClick={generate}>
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate
              </Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5" onClick={handleDownload}>
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="text-slate-300 hover:text-white" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {(status === "idle" || status === "generating") && (
          <div className="flex flex-col items-center gap-4 text-white/60">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
            <div className="text-center">
              <p className="font-semibold text-white text-base">Generating site illustration…</p>
              <p className="text-sm mt-1 text-white/50 max-w-xs text-center">
                Building a realistic view of this tower on the property using site data — takes about 10–15 seconds.
              </p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <p className="text-red-400 font-semibold">Generation failed</p>
            <p className="text-white/50 text-sm">{errorMsg}</p>
            <Button onClick={generate} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
              <RefreshCw className="w-4 h-4" /> Try again
            </Button>
          </div>
        )}

        {status === "done" && imageUrl && (
          <img
            src={imageUrl}
            alt="AI-generated tower site illustration"
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
          />
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-500 py-1.5 bg-slate-900/80 shrink-0">
        AI-generated illustrative rendering only — not a survey, stamped drawing, or final tower location
      </div>
    </div>
  );
}