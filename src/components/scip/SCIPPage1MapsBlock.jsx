/**
 * SCIPPage1MapsBlock - legacy Page 1 map block.
 *
 * This keeps only the non-RF site/access maps:
 *   1. Proposed Site - overhead satellite + parcel pin
 *   2. Access - ROW Connection - close-zoom satellite at parcel frontage
 *   3. Access - Along - wide satellite showing access drive context
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 800;
const ZOOM_SITE = 17.5;
const ZOOM_ROW = 18;
const ZOOM_ALONG = 17;

function buildOverheadUrl(token, lat, lon, zoom, pins = "") {
  const overlays = pins ? `${pins}/` : "";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}${lon},${lat},${zoom},0,0/` +
    `${IMG_W}x${IMG_H}@2x?access_token=${token}`
  );
}

function MapRow({ label, url, footnote }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm font-semibold text-foreground bg-muted/40 border-r border-border flex items-center">
        {label}
      </div>
      <div className="bg-card p-2">
        {url ? (
          <div className="relative rounded overflow-hidden border border-border" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
            <img src={url} alt={label} crossOrigin="anonymous" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
          </div>
        ) : (
          <div className="aspect-[16/10] bg-muted/30 border border-dashed border-border rounded flex items-center justify-center text-xs text-muted-foreground">
            Enter Latitude / Longitude to generate map
          </div>
        )}
        {footnote && <div className="text-[10px] font-mono text-muted-foreground mt-1">{footnote}</div>}
      </div>
    </div>
  );
}

export default function SCIPPage1MapsBlock({ page1Values, siteOwner }) {
  const [token, setToken] = useState("");

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const lat = parseFloat(siteOwner?.site?.latitude || page1Values?.latitude);
  const lon = parseFloat(siteOwner?.site?.longitude || page1Values?.longitude);
  const ready = isFinite(lat) && isFinite(lon) && token;
  const targetPin = `pin-l-communications-tower+EF4444(${lon},${lat})`;

  const premisesUrl = ready ? buildOverheadUrl(token, lat, lon, ZOOM_SITE, targetPin) : null;
  const rowUrl = ready ? buildOverheadUrl(token, lat, lon, ZOOM_ROW, `pin-l-circle+2563EB(${lon},${lat})`) : null;
  const alongUrl = ready ? buildOverheadUrl(token, lat, lon, ZOOM_ALONG, targetPin) : null;

  return (
    <>
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
        Maps
      </div>
      <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-foreground">
        Premises and access context
      </div>

      <MapRow
        label="Proposed Site"
        url={premisesUrl}
        footnote="Mapbox Satellite-Streets - z17.5 - target pin at parcel center"
      />
      <MapRow
        label="Access - ROW Connection"
        url={rowUrl}
        footnote="Close-zoom satellite at parcel frontage - z18"
      />
      <MapRow
        label="Access - Along"
        url={alongUrl}
        footnote="Wide satellite showing access drive along the parcel - z17"
      />
    </>
  );
}
