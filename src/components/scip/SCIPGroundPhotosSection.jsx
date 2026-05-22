/**
 * SCIPGroundPhotosSection — Mapillary street-level photos of the three things
 * SCIP needs to document for site-build readiness:
 *   1. Access drive / road connection
 *   2. Nearest power pole / transformer
 *   3. Nearest fiber / telecom asset
 *
 * Photos are sourced from Mapillary's crowdsourced street-level imagery.
 * Coverage is best on public roads — rural driveways may not have photos.
 */

import { useEffect, useState } from "react";
import { mapillaryGroundPhotos } from "@/functions/mapillaryGroundPhotos";

const SLOTS = [
  { key: "access_drive", title: "Access Drive — Road Connection", color: "#22d3ee", icon: "🛣️" },
  { key: "power",        title: "Power — Pole / Transformer",      color: "#ef4444", icon: "⚡" },
  { key: "fiber",        title: "Fiber / Telecom",                 color: "#f97316", icon: "🟧" },
];

function PhotoCard({ slot, data }) {
  const photo = data?.photo;
  const target = data?.target;

  return (
    <div className="rounded-lg overflow-hidden border" style={{ borderColor: `${slot.color}55` }}>
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "#0d1829", borderBottom: `1px solid ${slot.color}33` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{slot.icon}</span>
          <span className="text-sm font-semibold text-white">{slot.title}</span>
        </div>
        {target && (
          <span
            className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded"
            style={{ background: `${slot.color}22`, color: slot.color }}
          >
            {target.dist_miles} mi away
          </span>
        )}
      </div>

      <div className="bg-[#0a0e17]" style={{ aspectRatio: "4/3" }}>
        {photo?.thumb_url ? (
          <img
            src={photo.thumb_url}
            alt={slot.title}
            crossOrigin="anonymous"
            className="w-full h-full object-cover block"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center px-4">
            <div className="text-3xl mb-2 opacity-40">{slot.icon}</div>
            <div className="text-xs text-slate-500 font-mono">
              {!target
                ? "No mapped asset found within search radius"
                : "No Mapillary street-level photo available at this location"}
            </div>
            {target && (
              <div className="text-[10px] text-slate-600 font-mono mt-1">
                Target: {target.lat.toFixed(5)}, {target.lon.toFixed(5)}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="px-3 py-1.5 text-[10px] font-mono text-slate-500 flex flex-wrap gap-x-3"
        style={{ background: "#0d1829" }}
      >
        {photo ? (
          <>
            <span style={{ color: slot.color }}>📷 {photo.dist_miles} mi from target</span>
            {photo.captured_at && (
              <span>· {new Date(photo.captured_at).toLocaleDateString()}</span>
            )}
            <span>· Mapillary</span>
          </>
        ) : (
          <span>· {data?.label || "No data"}</span>
        )}
      </div>
    </div>
  );
}

export default function SCIPGroundPhotosSection({ candidate }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const lat = candidate?.latitude;
  const lon = candidate?.longitude;

  useEffect(() => {
    if (lat == null || lon == null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    mapillaryGroundPhotos({ lat, lon })
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message || "Failed to fetch ground photos"))
      .finally(() => setLoading(false));
  }, [lat, lon]);

  if (lat == null || lon == null) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0C1B2E] text-white hover:bg-[#13294a] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Ground Level</span>
          <span className="font-heading font-bold">Access · Power · Fiber — Street-Level Photos</span>
        </div>
        <span className="text-cyan-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Street-level photos near <span className="font-semibold text-foreground">Target A</span> from Mapillary's
            crowdsourced imagery, located at the nearest road, power asset, and fiber/telecom asset (sourced via OSM).
          </p>

          {loading && (
            <div className="py-12 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400 font-mono">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SLOTS.map((slot) => (
                <PhotoCard key={slot.key} slot={slot} data={data[slot.key]} />
              ))}
            </div>
          )}

          <div className="text-[10px] text-muted-foreground pt-1">
            Source: Mapillary Graph API (street-level imagery) · OpenStreetMap Overpass (asset locations)
          </div>
        </div>
      )}
    </div>
  );
}