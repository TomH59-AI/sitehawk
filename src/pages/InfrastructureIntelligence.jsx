import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SiteHawkInfrastructureMap from "@/components/maps/SiteHawkInfrastructureMap";
import { loadPublicConfig } from "@/lib/publicConfig";
import { hifldTransmissionLines } from "@/functions/hifldTransmissionLines";
import { carrierFinderInfrastructure } from "@/functions/carrierFinderInfrastructure";

const loadInfrastructureLayer = (payload) => payload.layer.startsWith("fiber_")
  ? carrierFinderInfrastructure(payload)
  : hifldTransmissionLines(payload);

export default function InfrastructureIntelligence() {
  const [params] = useSearchParams();
  const [mapboxToken, setMapboxToken] = useState(null);
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const candidate = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;

  useEffect(() => {
    loadPublicConfig()
      .then((config) => setMapboxToken(config.mapboxAccessToken || ""))
      .catch(() => setMapboxToken(""));
  }, []);

  if (mapboxToken === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <SiteHawkInfrastructureMap
      mapboxToken={mapboxToken}
      initialCenter={candidate ? [candidate.lon, candidate.lat] : undefined}
      initialZoom={candidate ? 11 : 6}
      candidate={candidate}
      layerLoader={loadInfrastructureLayer}
      onOpen3D={({ center, zoom }) => {
        const params = new URLSearchParams({
          lng: String(center?.lng ?? ""),
          lat: String(center?.lat ?? ""),
          zoom: String(zoom ?? ""),
        });

        window.location.assign(`/photo-3d-viewer?${params.toString()}`);
      }}
    />
  );
}