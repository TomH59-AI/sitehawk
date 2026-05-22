/**
 * SCIPPhotographsGrid — 8-row photographs section that mimics the official
 * Site-Hawk SCIP "PHOTOGRAPHS" table exactly (Riverlane Park reference, pages 3–5).
 *
 * Rows (top → bottom):
 *   1. Proposed Site                — overhead satellite of the parcel with pin
 *   2. North from Site              — satellite tilted north, pin
 *   3. South from Site              — satellite tilted south, pin
 *   4. East from Site               — satellite tilted east, pin
 *   5. West from Site               — satellite tilted west, pin
 *   6. Access - ROW Connection      — Mapillary street-level at nearest road
 *   7. Access - along               — Mapillary street-level along access drive
 *   8. Power (nearest pole)         — Mapillary at nearest OSM power asset
 *   9. Telco (nearest demarc)       — Mapillary at nearest OSM telecom asset
 *  10. Site Sketch (within entire parcel) — overhead aerial sketch
 *
 * Layout matches the reference: a single column of labeled rows, each with the
 * label on the left and the photo on the right (just like the PDF table).
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";
import { mapillaryGroundPhotos } from "@/functions/mapillaryGroundPhotos";

const IMG_W = 720;
const IMG_H = 540;

// Build a Mapbox Static URL — overhead with optional bearing for directional shots
function buildMapboxUrl(token, lat, lon, opts = {}) {
  if (!token || lat == null || lon == null) return null;
  const zoom = opts.zoom ?? 17;
  const bearing = opts.bearing ?? 0;
  const pitch = opts.pitch ?? 0;
  const pin = `pin-l-circle+ef4444(${lon},${lat})`;
  const style = opts.style || "satellite-streets-v12";
  return (
    `https://api.mapbox.com/styles/v1/mapbox/${style}/static/` +
    `${pin}/${lon},${lat},${zoom},${bearing},${pitch}/` +
    `${IMG_W}x${IMG_H}@2x?access_token=${token}`
  );
}

// Offset coordinates a small distance in a given bearing so the pin appears
// in the foreground (closer to camera) and the horizon stretches outward.
function offsetLatLon(lat, lon, bearingDeg, distMiles) {
  const R = 3958.8;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const d = distMiles / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(
    Math.sin(br) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function PhotoRow({ label, url, caption, alt }) {
  return (
    <div className="grid grid-cols-12 border-b border-slate-700 last:border-b-0">
      <div className="col-span-12 md:col-span-3 p-3 bg-[#5a7563] text-white text-sm font-semibold border-r border-slate-700 flex items-center">
        {label}
      </div>
      <div className="col-span-12 md:col-span-9 p-3 bg-white">
        {url ? (
          <div className="space-y-1">
            <img
              src={url}
              alt={alt || label}
              crossOrigin="anonymous"
              className="block w-full max-w-md rounded border border-slate-300"
              style={{ aspectRatio: `${IMG_W}/${IMG_H}`, objectFit: "cover" }}
            />
            {caption && (
              <div className="text-[10px] text-slate-500 font-mono">{caption}</div>
            )}
          </div>
        ) : (
          <div
            className="flex items-center justify-center max-w-md rounded border border-dashed border-slate-300 bg-slate-50 text-slate-400 text-xs"
            style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}
          >
            No photo available at this location
          </div>
        )}
      </div>
    </div>
  );
}

export default function SCIPPhotographsGrid({ candidate }) {
  const [open, setOpen] = useState(true);
  const [token, setToken] = useState("");
  const [mapillary, setMapillary] = useState(null);
  const [loading, setLoading] = useState(true);

  const lat = candidate?.latitude;
  const lon = candidate?.longitude;

  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  useEffect(() => {
    if (lat == null || lon == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    mapillaryGroundPhotos({ lat, lon })
      .then((res) => setMapillary(res.data))
      .catch(() => setMapillary(null))
      .finally(() => setLoading(false));
  }, [lat, lon]);

  if (lat == null || lon == null) return null;

  // Cardinal direction satellite shots — offset pin ~0.05mi in the opposite direction
  // so when looking FROM the site toward N/S/E/W the horizon stretches away.
  const [nLat, nLon] = offsetLatLon(lat, lon, 0, 0.06);     // North
  const [sLat, sLon] = offsetLatLon(lat, lon, 180, 0.06);   // South
  const [eLat, eLon] = offsetLatLon(lat, lon, 90, 0.06);    // East
  const [wLat, wLon] = offsetLatLon(lat, lon, 270, 0.06);   // West

  const proposedUrl = buildMapboxUrl(token, lat, lon, { zoom: 17.5 });
  const northUrl    = buildMapboxUrl(token, nLat, nLon, { zoom: 16.5 });
  const southUrl    = buildMapboxUrl(token, sLat, sLon, { zoom: 16.5 });
  const eastUrl     = buildMapboxUrl(token, eLat, eLon, { zoom: 16.5 });
  const westUrl     = buildMapboxUrl(token, wLat, wLon, { zoom: 16.5 });
  const sketchUrl   = buildMapboxUrl(token, lat, lon, { zoom: 18, style: "satellite-v9" });

  const access = mapillary?.access_drive;
  const power = mapillary?.power;
  const fiber = mapillary?.fiber;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#5a7563] text-white hover:bg-[#4a6353] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-emerald-200 text-xs font-bold uppercase tracking-widest">Section</span>
          <span className="font-heading font-bold">PHOTOGRAPHS — Premises, Access, Nearest Power/Telco</span>
        </div>
        <span className="text-emerald-200 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="bg-white">
          {loading && (
            <div className="py-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          )}

          {!loading && (
            <div className="border-t border-slate-700">
              <PhotoRow
                label="Proposed Site"
                url={proposedUrl}
                caption={`Overhead satellite · ${lat.toFixed(6)}, ${lon.toFixed(6)}`}
              />
              <PhotoRow
                label="North from Site"
                url={northUrl}
                caption="View north of parcel · Mapbox satellite"
              />
              <PhotoRow
                label="South from Site"
                url={southUrl}
                caption="View south of parcel · Mapbox satellite"
              />
              <PhotoRow
                label="East from Site"
                url={eastUrl}
                caption="View east of parcel · Mapbox satellite"
              />
              <PhotoRow
                label="West from Site"
                url={westUrl}
                caption="View west of parcel · Mapbox satellite"
              />
              <PhotoRow
                label="Access - ROW Connection"
                url={access?.photo?.thumb_url}
                caption={
                  access?.target
                    ? `Mapillary @ nearest road · ${access.target.dist_miles} mi`
                    : "No Mapillary coverage at nearest road"
                }
              />
              <PhotoRow
                label="Access - along"
                url={access?.photo?.thumb_url}
                caption={
                  access?.photo?.captured_at
                    ? `Mapillary · captured ${new Date(access.photo.captured_at).toLocaleDateString()}`
                    : "Mapillary along access drive"
                }
              />
              <PhotoRow
                label="Power (nearest pole)"
                url={power?.photo?.thumb_url}
                caption={
                  power?.target
                    ? `Nearest ${power.target.tags?.power || "power asset"} · ${power.target.dist_miles} mi · Mapillary`
                    : "No mapped power asset within search radius"
                }
              />
              <PhotoRow
                label="Telco (nearest demarc)"
                url={fiber?.photo?.thumb_url}
                caption={
                  fiber?.target
                    ? `Nearest telecom asset · ${fiber.target.dist_miles} mi · Mapillary`
                    : "No mapped telecom asset within search radius"
                }
              />
              <PhotoRow
                label="Site Sketch (within entire parcel)"
                url={sketchUrl}
                caption="High-zoom aerial of parcel · Mapbox satellite"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}