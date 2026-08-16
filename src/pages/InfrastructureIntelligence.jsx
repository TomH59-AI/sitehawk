import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SiteHawkInfrastructureMap from "@/components/maps/SiteHawkInfrastructureMap";
import { loadPublicConfig } from "@/lib/publicConfig";
import { hifldTransmissionLines } from "@/functions/hifldTransmissionLines";
import { fccBdcInfrastructure } from "@/functions/fccBdcInfrastructure";
import { zayoFiberRoutes } from "@/functions/zayoFiberRoutes";
import { fiberProviderRoutes } from "@/functions/fiberProviderRoutes";
import { osmFiberRoutes } from "@/functions/osmFiberRoutes";
import { osmPowerGrid } from "@/functions/osmPowerGrid";
import { hifldPowerLive } from "@/functions/hifldPowerLive";
import { peeringdbPops } from "@/functions/peeringdbPops";
import { infrastructureMap } from "@/functions/infrastructureMap";
import { parcelClickIntel } from "@/functions/parcelClickIntel";

const LIVE_DETAIL_LAYERS = new Set(["fiber_splice_points", "utility_easements"]);
const loadInfrastructureLayer = (payload) => LIVE_DETAIL_LAYERS.has(payload.layer)
  ? infrastructureMap(payload)
  : payload.layer === "fiberkmz_zayo"
    ? zayoFiberRoutes({ ...payload, layer: "zayo_routes" }) // Zayo reuses its existing table
    : payload.layer === "fiberkmz_osm_fiber"
      ? osmFiberRoutes({ bbox: payload.bbox || payload })
      : payload.layer === "transmission_lines" && payload.bbox
        ? osmPowerGrid({ bbox: payload.bbox, layer: 'transmission_lines' })
        : payload.layer === "distribution_lines"
          ? osmPowerGrid({ bbox: payload.bbox || payload, layer: 'distribution_lines' })
          : payload.layer === "transmission_towers"
            ? osmPowerGrid({ bbox: payload.bbox || payload, layer: 'transmission_towers' })
            : payload.layer === "distribution_poles"
              ? osmPowerGrid({ bbox: payload.bbox || payload, layer: 'distribution_poles' })
              : payload.layer === "transformers"
                ? osmPowerGrid({ bbox: payload.bbox || payload, layer: 'transformers' })
                : payload.layer === "substations"
                  ? hifldPowerLive({ bbox: payload.bbox || payload, layer: 'substations' })
                  : payload.layer === "electric_service_territory"
                    ? hifldPowerLive({ bbox: payload.bbox || payload, layer: 'electric_service_territory' })
                    : payload.layer.startsWith("fiberkmz_")
                      ? fiberProviderRoutes(payload)
                      : payload.layer === "zayo_routes"
                        ? zayoFiberRoutes(payload)
                        : payload.layer === "peeringdb_pops"
                          ? (() => {
                              const center = payload.center || payload;
                              return peeringdbPops({
                                lat: center.lat || payload.lat,
                                lon: center.lng || center.lon || payload.lon,
                                radius_deg: 1.5,
                              });
                            })()
                          : payload.layer === "broadband_service"
                            ? fccBdcInfrastructure(payload)
                            : hifldTransmissionLines(payload);

// Parcel Intelligence — click an empty map spot to sample zoning, utility,
// fiber proximity, flood, elevation/slope, soil, and NLCD land cover.
const loadParcelIntel = async ({ lat, lon }) => {
  const response = await parcelClickIntel({ lat, lon });
  if (response?.data?.error) throw new Error(response.data.error);
  return response.data;
};

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
      parcelIntelLoader={loadParcelIntel}
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