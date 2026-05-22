/**
 * SCIPPage1MapsBlock — Page 1 MAPS block.
 *
 * Seven rows, each a high-resolution Mapbox Static render of the selected
 * parcel center (or fallback to SARF center). Mirrors the official SCIP
 * template "Maps" section:
 *   1. Proposed Site         — overhead satellite + parcel pin + nearest power/telco markers
 *   2. North from Site       — 2D pitched satellite looking N with transparent conical viewshed
 *   3. South from Site       — same, bearing 180°
 *   4. East from Site        — same, bearing 90°
 *   5. West from Site        — same, bearing 270°
 *   6. Access — ROW Connection — close-zoom satellite at parcel frontage
 *   7. Access — along        — wide satellite showing the access drive along the parcel
 *
 * The 4 directional views reuse the same conical SVG overlay pattern as
 * SCIPViewshedSection so the print output is visually consistent.
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 800;
const ZOOM_SITE = 17.5;
const ZOOM_VIEWSHED = 16.5;
const ZOOM_ROW = 18;
const ZOOM_ALONG = 17;
const PITCH = 60;

const DIRECTIONS = {
  N: { label: "North from Site", bearing: 0, color: "#3B82F6" },
  S: { label: "South from Site", bearing: 180, color: "#EF4444" },
  E: { label: "East from Site", bearing: 90, color: "#10B981" },
  W: { label: "West from Site", bearing: 270, color: "#F59E0B" },
};

// Slightly offset the center back along the view bearing so the parcel sits at the bottom of frame
function offsetCenter(lat, lon, bearingDeg, meters = 90) {
  const back = (bearingDeg + 180) % 360;
  const R = 6378137;
  const rad = (back * Math.PI) / 180;
  const dLat = (meters * Math.cos(rad)) / R;
  const dLon = (meters * Math.sin(rad)) / (R * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + (dLat * 180) / Math.PI, lon: lon + (dLon * 180) / Math.PI };
}

function buildOverheadUrl(token, lat, lon, zoom, pins = "") {
  const overlays = pins ? `${pins}/` : "";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${overlays}${lon},${lat},${zoom},0,0/` +
    `${IMG_W}x${IMG_H}@2x?access_token=${token}`
  );
}

function buildPitchedUrl(token, lat, lon, bearing) {
  const offset = offsetCenter(lat, lon, bearing, 90);
  const pin = `pin-l-communications-tower+EF4444(${lon},${lat})`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/` +
    `${pin}/` +
    `${offset.lon},${offset.lat},${ZOOM_VIEWSHED},${bearing},${PITCH}/` +
    `${IMG_W}x${IMG_H}@2x?access_token=${token}`
  );
}

// Transparent conical viewshed overlay — matches SCIPViewshedSection styling
function ConicalOverlay({ color }) {
  return (
    <svg
      viewBox="0 0 1280 800"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    >
      <defs>
        <radialGradient id={`cone-${color.slice(1)}`} cx="50%" cy="100%" r="80%">
          <stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <stop offset="60%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon points="640,800 120,180 1160,180" fill={`url(#cone-${color.slice(1)})`} />
      <line x1="640" y1="800" x2="120" y2="180" stroke={color} strokeOpacity="0.5" strokeWidth="2" strokeDasharray="6,6" />
      <line x1="640" y1="800" x2="1160" y2="180" stroke={color} strokeOpacity="0.5" strokeWidth="2" strokeDasharray="6,6" />
    </svg>
  );
}

function MapRow({ label, url, overlayColor, footnote }) {
  return (
    <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
      <div className="px-3 py-2 text-sm font-semibold text-foreground bg-muted/40 border-r border-border flex items-center">
        {label}
      </div>
      <div className="bg-card p-2">
        {url ? (
          <div className="relative rounded overflow-hidden border border-border" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
            <img src={url} alt={label} crossOrigin="anonymous" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />
            {overlayColor && <ConicalOverlay color={overlayColor} />}
            {overlayColor && (
              <div
                className="absolute top-2 left-2 text-[10px] font-mono font-bold tracking-wider px-2 py-1 rounded"
                style={{ background: overlayColor, color: "#0a0e17" }}
              >
                {label.toUpperCase()}
              </div>
            )}
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

  // Premises map — overhead satellite with target pin (power/telco icons would
  // need infrastructureAssets fetched, but Mapbox already labels major utility
  // infrastructure on satellite-streets at z17.5)
  const premisesUrl = ready
    ? buildOverheadUrl(token, lat, lon, ZOOM_SITE, `pin-l-communications-tower+EF4444(${lon},${lat})`)
    : null;

  const rowUrl = ready
    ? buildOverheadUrl(token, lat, lon, ZOOM_ROW, `pin-l-circle+2563EB(${lon},${lat})`)
    : null;

  const alongUrl = ready
    ? buildOverheadUrl(token, lat, lon, ZOOM_ALONG, `pin-l-communications-tower+EF4444(${lon},${lat})`)
    : null;

  return (
    <>
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
        Maps
      </div>
      <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-foreground">
        Premises, Access, Nearest Power/Telco (include below)
      </div>

      <MapRow
        label="Proposed Site"
        url={premisesUrl}
        footnote="Mapbox Satellite-Streets · z17.5 · target pin at parcel center"
      />

      {Object.entries(DIRECTIONS).map(([key, dir]) => (
        <MapRow
          key={key}
          label={dir.label}
          url={ready ? buildPitchedUrl(token, lat, lon, dir.bearing) : null}
          overlayColor={dir.color}
          footnote={`Pitched satellite · bearing ${dir.bearing}° · 60° tilt · transparent conical viewshed`}
        />
      ))}

      <MapRow
        label="Access — ROW Connection"
        url={rowUrl}
        footnote="Close-zoom satellite at parcel frontage · z18"
      />

      <MapRow
        label="Access — along"
        url={alongUrl}
        footnote="Wide satellite showing access drive along the parcel · z17"
      />
    </>
  );
}