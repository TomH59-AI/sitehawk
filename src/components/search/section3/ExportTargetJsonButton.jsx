import { FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Downloads the target parcel data as a formatted JSON file so external tools
// (Figma, scripts, etc.) can consume the site data.
export default function ExportTargetJsonButton({ target, targetLabel, ringName, phone }) {
  const handleExport = () => {
    if (!target) return;
    const payload = {
      exported_at: new Date().toISOString(),
      ring_name: ringName || null,
      target_label: targetLabel,
      owner_name: target.owner_name || null,
      parcel_address: target.parcel_address || null,
      apn: target.apn || null,
      acreage: target.acreage ?? null,
      boundaries: target.boundaries || null,
      zoning_classification: target.zoning_classification || null,
      zoning_status: target.zoning_status || null,
      land_use: target.land_use || null,
      mailing_address: target.mailing_address || null,
      phone: phone || null,
      fema_risk_factor: target.fema_risk_factor || null,
      county: target.county || null,
      state: target.state || null,
      latitude: target.latitude != null ? Number(target.latitude) : null,
      longitude: target.longitude != null ? Number(target.longitude) : null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(ringName || "site").replace(/[^a-z0-9-_]+/gi, "_")}_${targetLabel.replace(/\s+/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${targetLabel} exported as JSON.`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="justify-start text-xs h-8">
      <FileJson className="w-3.5 h-3.5 mr-1.5" /> Export as JSON
    </Button>
  );
}