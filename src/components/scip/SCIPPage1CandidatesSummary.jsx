/**
 * SCIPPage1CandidatesSummary — Page 2 "Candidates Summary" block.
 *
 * Shows the top 3 Targets (A, B, C) returned by findBestParcelForTower with:
 *   - Parcel #
 *   - Owner / Contact name
 *   - Address
 *   - Phone (skip-traced via Enformion)
 *   - Acreage + zoning
 *
 * Below the table, a SARF map renders the search ring center with the 0.5/1.0 mi
 * radius rings and all 3 targets as numbered waypoints (1, 2, 3).
 */

import { useEffect, useState } from "react";
import { loadPublicConfig } from "@/lib/publicConfig";

const IMG_W = 1280;
const IMG_H = 900;

function buildCircle(lat, lon, radiusMiles, points = 36) {
  const coords = [];
  const radiusM = radiusMiles * 1609.344;
  const dx = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const dy = radiusM / 110540;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([+(lon + dx * Math.cos(theta)).toFixed(5), +(lat + dy * Math.sin(theta)).toFixed(5)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

function buildSARFUrl(token, lat, lon, radiusMiles, targets) {
  const geo = encodeURIComponent(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { stroke: "#DC2626", "stroke-width": 4, "stroke-opacity": 1, fill: "#DC2626", "fill-opacity": 0.08 },
          geometry: buildCircle(lat, lon, radiusMiles),
        },
        {
          type: "Feature",
          properties: { stroke: "#EAB308", "stroke-width": 3, "stroke-opacity": 1, "fill-opacity": 0 },
          geometry: buildCircle(lat, lon, radiusMiles * 0.5),
        },
      ],
    })
  );

  // Center marker (SARF center) + numbered waypoints for each target
  const sarf = `pin-l-star+FFFFFF(${lon},${lat})`;
  const COLORS = ["EF4444", "F59E0B", "10B981"]; // red, amber, green
  const pins = targets
    .map((t, i) =>
      isFinite(t.latitude) && isFinite(t.longitude)
        ? `pin-l-${i + 1}+${COLORS[i]}(${t.longitude},${t.latitude})`
        : null
    )
    .filter(Boolean);

  const overlays = [`geojson(${geo})`, sarf, ...pins].join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${overlays}/` +
    `auto/${IMG_W}x${IMG_H}@2x?padding=60&access_token=${token}`
  );
}

function HeaderCell({ children }) {
  return (
    <div className="px-2 py-1.5 text-[10px] font-bold tracking-wider uppercase text-white bg-[#0C1B2E] border-r border-[#1f3a5f] last:border-r-0">
      {children}
    </div>
  );
}

function Cell({ children, mono }) {
  return (
    <div className={`px-2 py-1.5 text-xs border-r border-border last:border-r-0 ${mono ? "font-mono" : ""}`}>
      {children || <span className="text-muted-foreground italic">—</span>}
    </div>
  );
}

export default function SCIPPage1CandidatesSummary({ page1Values, siteOwner }) {
  const [token, setToken] = useState("");
  useEffect(() => {
    loadPublicConfig().then((cfg) => setToken(cfg.mapboxAccessToken || ""));
  }, []);

  const targets = siteOwner?.targets || [];
  const sarfLat = parseFloat(page1Values?.latitude);
  const sarfLon = parseFloat(page1Values?.longitude);
  const radius = parseFloat(String(page1Values?.search_radius || "1").replace(/[^0-9.]/g, "")) || 1.0;
  const ready = isFinite(sarfLat) && isFinite(sarfLon) && token;

  const mapUrl = ready ? buildSARFUrl(token, sarfLat, sarfLon, radius, targets) : null;

  return (
    <>
      {/* Banner — mimics the Excel "#VALUE! / CANDIDATES SUMMARY" header */}
      <div className="grid grid-cols-[260px_1fr] border-t border-border">
        <div className="px-3 py-2 text-[10px] font-mono text-muted-foreground bg-muted/30 border-r border-border">
          {siteOwner?.site?.parcel_id || "Page 2"}
        </div>
        <div className="px-3 py-3 bg-slate-200 text-center text-lg font-heading font-bold tracking-widest text-[#0C1B2E]">
          CANDIDATES SUMMARY
        </div>
      </div>

      {/* CONTACTED PROPERTIES */}
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
        Contacted Properties
      </div>

      {targets.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground bg-muted/10 border-b border-border">
          Click <span className="font-semibold text-cyan-700">"Find Best Parcel"</span> in the Site Information section above
          to auto-populate Targets A, B, and C.
        </div>
      ) : (
        <>
          {/* Table header */}
          <div className="grid grid-cols-[60px_1.5fr_1fr_2fr_1fr_0.7fr_1fr] border-b-2 border-[#0C1B2E]">
            <HeaderCell>Target</HeaderCell>
            <HeaderCell>Owner / Contact</HeaderCell>
            <HeaderCell>Parcel #</HeaderCell>
            <HeaderCell>Address</HeaderCell>
            <HeaderCell>Phone</HeaderCell>
            <HeaderCell>Acres</HeaderCell>
            <HeaderCell>Zoning</HeaderCell>
          </div>

          {/* Table rows */}
          {targets.map((t, i) => {
            const colors = ["bg-red-50", "bg-amber-50", "bg-emerald-50"];
            const badgeColors = ["bg-red-500", "bg-amber-500", "bg-emerald-500"];
            return (
              <div
                key={t.label}
                className={`grid grid-cols-[60px_1.5fr_1fr_2fr_1fr_0.7fr_1fr] border-b border-border ${colors[i]}`}
              >
                <div className="flex items-center justify-center px-2 py-2 border-r border-border">
                  <div className={`w-7 h-7 rounded-full ${badgeColors[i]} text-white text-xs font-bold flex items-center justify-center`}>
                    {t.label}
                  </div>
                </div>
                <Cell>
                  <div className="font-semibold text-foreground">{t.owner_name}</div>
                </Cell>
                <Cell mono>{t.parcel_id}</Cell>
                <Cell>
                  {t.parcel_address}
                  {(t.parcel_city || t.parcel_state) && (
                    <div className="text-[10px] text-muted-foreground">
                      {[t.parcel_city, t.parcel_state, t.parcel_zip].filter(Boolean).join(", ")}
                    </div>
                  )}
                </Cell>
                <Cell mono>{t.phone}</Cell>
                <Cell mono>{t.acreage != null ? t.acreage.toFixed(2) : ""}</Cell>
                <Cell mono>{t.zoning}</Cell>
              </div>
            );
          })}
        </>
      )}

      {/* SARF MAP */}
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase">
        SARF
      </div>

      <div className="bg-card p-2">
        {ready ? (
          <div className="relative rounded overflow-hidden border border-border" style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}>
            <img src={mapUrl} alt="SARF search ring with target waypoints" crossOrigin="anonymous" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover" }} />

            {/* Legend */}
            <div className="absolute top-3 left-3 bg-[#0C1B2E]/90 backdrop-blur-sm rounded-lg border border-cyan-400/60 px-3 py-2 text-white">
              <div className="text-[9px] font-mono uppercase tracking-wider text-cyan-400 mb-1">Legend</div>
              <div className="text-[10px] flex items-center gap-2 mb-0.5">
                <span className="text-white text-base leading-none">★</span> SARF Center
              </div>
              <div className="text-[10px] flex items-center gap-2 mb-0.5">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Target 1 (A)
              </div>
              <div className="text-[10px] flex items-center gap-2 mb-0.5">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Target 2 (B)
              </div>
              <div className="text-[10px] flex items-center gap-2 mb-1">
                <span className="inline-block w-3 h-3 rounded-full bg-emerald-500" /> Target 3 (C)
              </div>
              <div className="text-[10px] flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 bg-red-600" /> {radius.toFixed(1)} mi ring
              </div>
              <div className="text-[10px] flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 bg-yellow-400" /> {(radius * 0.5).toFixed(2)} mi ring
              </div>
            </div>

            {/* Coordinates */}
            <div className="absolute bottom-3 right-3 bg-[#0C1B2E]/90 backdrop-blur-sm rounded-lg border border-cyan-400/60 px-3 py-1.5 text-[10px] font-mono text-white">
              SARF: {sarfLat.toFixed(5)}, {sarfLon.toFixed(5)}
            </div>
          </div>
        ) : (
          <div className="aspect-[16/11] bg-muted/30 border border-dashed border-border rounded flex items-center justify-center text-xs text-muted-foreground">
            Enter Latitude / Longitude above to generate the SARF map
          </div>
        )}
        <div className="text-[10px] font-mono text-muted-foreground mt-1">
          Mapbox Satellite-Streets · Search Area Ring Feasibility · Targets ranked by zoning match + acreage + proximity
        </div>
      </div>
    </>
  );
}