import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Tier 2 — plat/survey image upload → Claude-vision extraction of boundary
// calls (metes & bounds) or simple rectangle dimensions. JSON ONLY response.
const VISION_PROMPT = `You are reading a property plat, survey, or deed sketch image to extract the parcel boundary.
Return JSON ONLY — no prose. If the image shows bearing/distance boundary calls, return:
{"method":"calls","units":"ft","calls":[{"bearing":"N 89°51′ E","distance_ft":300.00}, ...]}
listing every call in order around the boundary. Bearings in quadrant form (N/S degrees°minutes′ E/W). Distances in feet.
If only overall dimensions are legible (simple rectangular lot), return:
{"method":"dimensions","shape":"rectangle","width_ft":<number>,"depth_ft":<number>}
If the boundary cannot be determined, return {"method":"none"}.`;

const SCHEMA = {
  type: "object",
  properties: {
    method: { type: "string", enum: ["calls", "dimensions", "none"] },
    units: { type: "string" },
    calls: {
      type: "array",
      items: {
        type: "object",
        properties: { bearing: { type: "string" }, distance_ft: { type: "number" } },
      },
    },
    shape: { type: "string" },
    width_ft: { type: "number" },
    depth_ft: { type: "number" },
  },
  required: ["method"],
};

export default function PlatUpload({ onParsed, disabled }) {
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const out = await base44.integrations.Core.InvokeLLM({
        prompt: VISION_PROMPT,
        file_urls: [file_url],
        response_json_schema: SCHEMA,
      });
      if (out?.method === "calls" && out.calls?.length >= 3) {
        onParsed({ method: "calls", calls: out.calls });
        toast.success(`Extracted ${out.calls.length} boundary calls — click the map to anchor the parcel.`);
      } else if (out?.method === "dimensions" && out.width_ft && out.depth_ft) {
        onParsed({ method: "dimensions", width_ft: out.width_ft, depth_ft: out.depth_ft });
        toast.success(`Read ${out.width_ft}′ × ${out.depth_ft}′ — click the map to anchor the parcel.`);
      } else {
        toast.error("Couldn't read a boundary from that image — try a clearer plat or use manual entry.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Plat reading failed — try again or use manual entry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} disabled={busy || disabled} />
      <Button asChild variant="outline" size="sm" className="w-full border-white/15 text-white/70 hover:text-white cursor-pointer">
        <span>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileImage className="w-4 h-4 mr-1" />}{busy ? "Reading plat…" : "Upload plat / survey image"}</span>
      </Button>
    </label>
  );
}