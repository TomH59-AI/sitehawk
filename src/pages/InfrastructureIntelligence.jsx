import { useEffect, useState } from "react";
import SiteHawkInfrastructureMap from "@/components/maps/SiteHawkInfrastructureMap";
import { loadPublicConfig } from "@/lib/publicConfig";

export default function InfrastructureIntelligence() {
  const [mapboxToken, setMapboxToken] = useState(null);

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