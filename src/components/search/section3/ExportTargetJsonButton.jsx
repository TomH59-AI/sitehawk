import { FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loadPublicConfig } from "@/lib/publicConfig";

/**
 * Exports the target's property / engineering / zoning data as JSON for
 * external tools (Figma, scripts). NO OWNER PII — no owner name, no phone,
 * no mailing address, no skip-trace fields. Uses the CURRENT live sited
 * values from the Tower Siter (towerSiting bus) when available, falling
 * back to parcel/zoning values otherwise.
 */
export default function ExportTargetJsonButton({ target, targetLabel, ringName, zoningResult, towerSiting }) {
  const handleExport = async () => {
    if (!target) return;
    const z = zoningResult?.zoning || {};
    const ts = towerSiting || {};

    // Live sited coordinates win over the parcel default.
    const latitude = ts.latitude ?? (target.latitude != null ? Number(target.latitude) : null);
    const longitude = ts.longitude ?? (target.longitude != null ? Number(target.longitude) : null);

    // The aerial image the Interactive Map uses — Mapbox satellite-streets-v12
    // static render at this lat/long.
    let mapboxAerialUrl = null;
    if (latitude != null && longitude != null) {
      try {
        const cfg = await loadPublicConfig();
        if (cfg?.mapboxAccessToken) {
          mapboxAerialUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${longitude},${latitude},17/1024x1024@2x?access_token=${cfg.mapboxAccessToken}`;
        }
      } catch { /* export proceeds without the aerial URL */ }
    }

    const setbackFt = ts.zoning_setback_ft
      ?? (z.setback != null ? Number(String(z.setback).replace(/[^\d.]/g, "")) || null : null);

    const payload = {
      exported_at: new Date().toISOString(),
      ring_name: ringName || null,
      target_label: targetLabel,
      address: target.parcel_address || null,
      parcel_id: target.apn || null,
      acreage: target.acreage ?? null,
      county: target.county || null,
      jurisdiction: ts.jurisdiction || z.jurisdiction || null,
      zoning_code: target.zoning_classification || null,
      zoning_setback_ft: setbackFt,
      zoning_rule_refs: z.ldc_section_references || z.rule_refs || null,
      tower_height_ft: ts.tower_height_ft ?? null,
      fall_zone_radius_ft: ts.fall_zone_radius_ft ?? null,
      engineered_fall_radius_ft: ts.engineered_fall_radius_ft ?? null,
      pe_letter_enabled: ts.pe_letter_enabled ?? false,
      compound_width_ft: ts.compound_width_ft ?? null,
      compound_depth_ft: ts.compound_depth_ft ?? null,
      lease_area_ft: ts.lease_area_ft ?? null,
      property_line_clearance_ft: ts.property_line_clearance_ft ?? null,
      clearance_required_ft: ts.clearance_required_ft ?? null,
      placement_status: ts.placement_status ?? null,
      latitude,
      longitude,
      mapbox_aerial_url: mapboxAerialUrl,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(ringName || "site").replace(/[^a-z0-9-_]+/gi, "_")}_${targetLabel.replace(/\s+/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${targetLabel} exported as JSON (no owner PII).`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="justify-start text-xs h-8">
      <FileJson className="w-3.5 h-3.5 mr-1.5" /> Export as JSON
    </Button>
  );
}