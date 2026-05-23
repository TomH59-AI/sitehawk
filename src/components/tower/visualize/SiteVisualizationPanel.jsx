/**
 * SiteVisualizationPanel — full GenerateSiteVisualization workflow:
 *   1) Form: address, compound size, tower height + aerial photo upload
 *   2) Realie auto-lookup → fills parcel geometry + zoning string
 *   3) Mapbox parcel preview → user clicks compound center
 *   4) "Generate Visualization" runs Notion zoning flags + Replicate inpaint
 *   5) Results: zoning checklist + render gallery (download / present)
 */

import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Wand2, MapPin, Image as ImageIcon, AlertCircle } from "lucide-react";
import { analyzePropertyAndVisualize } from "@/functions/analyzePropertyAndVisualize";
import ParcelMapPicker from "./ParcelMapPicker";
import ZoningChecklist from "./ZoningChecklist";
import RenderGallery from "./RenderGallery";

export default function SiteVisualizationPanel({ initialParcel }) {
  const [propertyAddress, setPropertyAddress] = useState(initialParcel?.parcel_address || "");
  const [compoundSize, setCompoundSize] = useState("100x100");
  const [towerHeight, setTowerHeight] = useState("199 monopole");
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Parcel geometry can come from the initialParcel (already-scanned SearchResult)
  // or be discovered later inside analyzePropertyAndVisualize via Realie.
  const [parcelGeometry, setParcelGeometry] = useState(initialParcel?.parcel_geometry || null);
  const [centroid, setCentroid] = useState(
    initialParcel?.latitude && initialParcel?.longitude
      ? { lat: initialParcel.latitude, lon: initialParcel.longitude }
      : null
  );

  // Click on map → compound center
  const [pick, setPick] = useState(null);
  // Click position on the uploaded image (defaults to center 50/50)
  const [clickXNorm, setClickXNorm] = useState(0.5);
  const [clickYNorm, setClickYNorm] = useState(0.5);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setSourceImageUrl(file_url);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // Click on the preview image → records normalized 0..1 coords so the backend
  // mask is centered on what the user pointed at.
  function handleImageClick(ev) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    setClickXNorm(Math.max(0.05, Math.min(0.95, x)));
    setClickYNorm(Math.max(0.05, Math.min(0.95, y)));
  }

  async function handleGenerate() {
    if (!propertyAddress) { setError("Enter a property address."); return; }
    if (!sourceImageUrl) { setError("Upload a base aerial / drone photo first."); return; }
    setError(null);
    setRunning(true);
    setResult(null);
    try {
      const res = await analyzePropertyAndVisualize({
        propertyAddress,
        compoundSize,
        towerHeight,
        sourceImageUrl,
        clickedLat: pick?.lat ?? null,
        clickedLon: pick?.lon ?? null,
        clickXNorm,
        clickYNorm,
        parcelId: initialParcel?.id || "",
      });
      const data = res?.data || res;
      setResult(data);
      // Adopt Realie geometry if we didn't have one to start with
      if (!parcelGeometry && data?.realie?.parcel_geometry) {
        setParcelGeometry(data.realie.parcel_geometry);
      }
      if (!centroid && data?.realie?.centroid_lat) {
        setCentroid({ lat: data.realie.centroid_lat, lon: data.realie.centroid_lon });
      }
    } catch (err) {
      setError(err.message || "Visualization failed");
    } finally {
      setRunning(false);
    }
  }

  const flags = result
    ? {
        jurisdiction: result?.visualization?.notion_jurisdiction || result?.flags?.jurisdiction,
        requires_cup: result?.visualization?.requires_cup ?? result?.flags?.requires_cup,
        requires_pe_letter: result?.visualization?.requires_pe_letter ?? result?.flags?.requires_pe_letter,
        evidence: result?.visualization?.zoning_flag_evidence || result?.flags?.evidence,
      }
    : null;

  return (
    <div className="space-y-5">
      {/* Step 1 — Inputs */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h3 className="font-heading font-semibold text-base text-foreground flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" /> Generate Site Visualization
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Upload an aerial photo, drop the compound center, and we'll paint a photoreal tower onto the property.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <Label htmlFor="addr" className="text-xs">Property Address</Label>
            <Input
              id="addr"
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              placeholder="123 Main St, Tampa, FL 33601"
            />
          </div>
          <div>
            <Label htmlFor="comp" className="text-xs">Compound Size</Label>
            <Input id="comp" value={compoundSize} onChange={(e) => setCompoundSize(e.target.value)} placeholder="100x100" />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="tower" className="text-xs">Tower Height &amp; Type</Label>
            <Input id="tower" value={towerHeight} onChange={(e) => setTowerHeight(e.target.value)} placeholder="199 monopole" />
          </div>
        </div>

        {/* Upload */}
        <div>
          <Label className="text-xs">Base Aerial / Drone Photo</Label>
          <div className="mt-1.5 flex items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-sm">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Uploading…" : sourceImageUrl ? "Replace photo" : "Upload photo"}
              <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </label>
            {sourceImageUrl && <span className="text-[11px] text-emerald-600 font-mono">✓ uploaded</span>}
          </div>
        </div>

        {/* Image click preview */}
        {sourceImageUrl && (
          <div>
            <Label className="text-xs">Click your photo to mark where the compound goes</Label>
            <div
              onClick={handleImageClick}
              className="relative mt-1.5 rounded-lg overflow-hidden border border-border cursor-crosshair"
            >
              <img src={sourceImageUrl} alt="Source aerial" className="w-full h-auto block select-none pointer-events-none" />
              <div
                className="absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-2 border-orange-500 bg-orange-500/30 pointer-events-none"
                style={{ left: `${clickXNorm * 100}%`, top: `${clickYNorm * 100}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-red-600 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5" /> {error}
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={running || uploading}
          className="w-full"
        >
          {running ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing parcel &amp; rendering…</>
          ) : (
            <><Wand2 className="w-4 h-4 mr-2" /> Generate Visualization</>
          )}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          Realie parcel · Notion zoning flags · Replicate Flux.1 Inpaint render · 30–90s typical.
        </p>
      </div>

      {/* Step 2 — Parcel map */}
      {(parcelGeometry || centroid) && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Parcel Boundary &amp; Drop Point
          </h3>
          <ParcelMapPicker
            parcelGeometry={parcelGeometry}
            centroid={centroid}
            onPick={setPick}
          />
        </div>
      )}

      {/* Step 3 — Zoning checklist */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="font-heading font-semibold text-sm text-foreground">Zoning Compliance Checklist</h3>
        <ZoningChecklist flags={flags} loading={running && !flags} />
        {result?.realie && (
          <div className="text-[11px] text-muted-foreground border-t border-border pt-2 mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            {result.realie.parcel_id && <><span className="font-mono">APN</span><span>{result.realie.parcel_id}</span></>}
            {result.realie.owner_name && <><span className="font-mono">Owner</span><span>{result.realie.owner_name}</span></>}
            {result.realie.acreage && <><span className="font-mono">Acres</span><span>{result.realie.acreage}</span></>}
            {result.realie.zoning_classification && <><span className="font-mono">Zoning</span><span>{result.realie.zoning_classification}</span></>}
          </div>
        )}
      </div>

      {/* Step 4 — Render gallery */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" /> Photoreal Renders
        </h3>
        <RenderGallery urls={result?.visualization?.render_image_urls || result?.render?.urls || []} sourceImageUrl={sourceImageUrl} />
      </div>
    </div>
  );
}