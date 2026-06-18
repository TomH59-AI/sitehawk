/**
 * Generate3DImageButton — appears on the TowerSiter result screen after
 * a placement is confirmed. Creates a Tower3DRender record and opens the
 * full-screen CesiumTower3DViewer.
 */
import { useState } from "react";
import { Box, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { loadPublicConfig } from "@/lib/publicConfig";
import { toast } from "sonner";
import CesiumTower3DViewer from "./CesiumTower3DViewer";

export default function Generate3DImageButton({ result, controls, parcel }) {
  const [loading, setLoading] = useState(false);
  const [render, setRender] = useState(null);
  const [cesiumToken, setCesiumToken] = useState(null);

  if (!result || result.collapsed || !parcel) return null;

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const cfg = await loadPublicConfig();
      const token = cfg?.cesiumIonToken || "";
      setCesiumToken(token);

      // Derive compound size label
      const cw = Number(controls.compoundW) || 75;
      const cd = Number(controls.compoundD) || 75;
      const closestSize = ["50x50", "75x75", "100x100"].reduce((best, s) => {
        const [w] = s.split("x").map(Number);
        return Math.abs(w - cw) < Math.abs(Number(best.split("x")[0]) - cw) ? s : best;
      }, "75x75");

      // Tower centroid from result
      const [lon, lat] = result.towerLonLat || [parcel.location?.coordinates?.[0] || 0, parcel.location?.coordinates?.[1] || 0];

      const rec = await base44.entities.Tower3DRender.create({
        parcel_id: parcel.apn || null,
        property_address: parcel.addressFull || parcel.apn || null,
        site_name: "Target A",
        centroid_lat: lat,
        centroid_lon: lon,
        parcel_geojson: result.parcel?.geometry || parcel.geometry || null,
        compound_geojson: result.compound?.lonLat?.geometry || null,
        tower_type: "monopole",
        tower_height_ft: Number(controls.heightFt) || 199,
        compound_size: closestSize,
        compound_width_ft: cw,
        compound_depth_ft: cd,
        buffer_ft: 25,
        status: "ready",
      });

      setRender(rec);
    } catch (e) {
      console.error("Generate3DImageButton error:", e);
      toast.error("Could not create 3D preview.");
    } finally {
      setLoading(false);
    }
  };

  const handleSettingsChange = async ({ compound, buffer, height }) => {
    if (!render?.id) return;
    try {
      const [cw, cd] = compound.split("x").map(Number);
      const updated = await base44.entities.Tower3DRender.update(render.id, {
        compound_size: compound,
        compound_width_ft: cw,
        compound_depth_ft: cd,
        buffer_ft: Number(buffer),
        tower_height_ft: Number(height),
        status: "ready",
      });
      setRender(updated);
    } catch { /* non-critical */ }
  };

  return (
    <>
      <Button
        size="sm"
        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading
          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Opening 3D viewer…</>
          : <><Box className="w-3.5 h-3.5 mr-1.5" /> Generate 3D Image</>
        }
      </Button>

      {render && cesiumToken && (
        <CesiumTower3DViewer
          render={render}
          cesiumToken={cesiumToken}
          onClose={() => setRender(null)}
          onSettingsChange={handleSettingsChange}
        />
      )}
    </>
  );
}