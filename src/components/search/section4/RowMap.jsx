/**
 * RowMap — interactive Mapbox map for the ROW & Premium Parcel Indicators step.
 *
 * Draws the Regrid ring parcels (already fetched — no new API call):
 *  - All parcel boundaries: thin gray outlines
 *  - ROW-flagged parcels (right-of-way): red fill + outline, click for details
 *  - Target A: marker pin
 */

import { useEffect, useRef, useState } from "react";
import { ensureMapboxLoaded } from "@/lib/section4Maps";
import { loadPublicConfig } from "@/lib/publicConfig";

const isRowParcel = (p) => !!p.ll_row_parcel || p.row_flag === true || p.row_flag === "true" || !!p.row_type;

function extendBounds(bounds, coords) {
  if (typeof coords[0] === "number") { bounds.extend(coords); return; }
  coords.forEach((c) => extendBounds(bounds, c));
}

export default function RowMap({ parcels = [], targetA, corridor = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState(null);

  const withGeom = parcels.filter((p) => p.parcel_geometry);
  const rowCount = withGeom.filter(isRowParcel).length;

  useEffect(() => {
    if (!withGeom.length || !containerRef.current) return;
    let cancelled = false;

    async function init() {
      try {
        const cfg = await loadPublicConfig();
        await ensureMapboxLoaded();
        if (cancelled || !containerRef.current) return;
        const mapboxgl = window.mapboxgl;
        mapboxgl.accessToken = cfg.mapboxAccessToken;

        const toFeature = (p) => ({
          type: "Feature",
          geometry: p.parcel_geometry,
          properties: {
            row: isRowParcel(p),
            row_type: p.row_type || "",
            road_type: p.road_type || "",
            mtfcc_name: p.mtfcc_name || "",
            owner: p.owner_name || "",
            apn: p.apn || "",
            acres: p.ll_gisacre != null ? Number(p.ll_gisacre).toFixed(3) : "",
          },
        });
        const allFC = { type: "FeatureCollection", features: withGeom.map(toFeature) };
        const rowFC = { type: "FeatureCollection", features: allFC.features.filter((f) => f.properties.row) };

        const center = targetA && Number.isFinite(targetA.longitude)
          ? [targetA.longitude, targetA.latitude]
          : null;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/satellite-streets-v12",
          center: center || [0, 0],
          zoom: 15,
        });
        mapRef.current = map;

        map.on("load", () => {
          map.addSource("row-all-parcels", { type: "geojson", data: allFC });
          map.addSource("row-row-parcels", { type: "geojson", data: rowFC });

          map.addLayer({ id: "row-parcel-lines", type: "line", source: "row-all-parcels", paint: { "line-color": "#e2e8f0", "line-width": 1, "line-opacity": 0.7 } });
          map.addLayer({ id: "row-fill", type: "fill", source: "row-row-parcels", paint: { "fill-color": "#ef4444", "fill-opacity": 0.35 } });
          map.addLayer({ id: "row-line", type: "line", source: "row-row-parcels", paint: { "line-color": "#ef4444", "line-width": 2 } });

          // Inferred ROW corridor frontage — amber dashed line along Target A's road frontage
          if (corridor?.found && corridor.frontage_fc?.features?.length) {
            map.addSource("row-corridor", { type: "geojson", data: corridor.frontage_fc });
            map.addLayer({ id: "row-corridor-line", type: "line", source: "row-corridor", paint: { "line-color": "#f59e0b", "line-width": 4, "line-dasharray": [2, 1.5] } });
          }

          if (center) new mapboxgl.Marker({ color: "#22d3ee" }).setLngLat(center).addTo(map);

          // Fit to all parcel geometry
          const bounds = new mapboxgl.LngLatBounds();
          allFC.features.forEach((f) => extendBounds(bounds, f.geometry.coordinates));
          if (center) bounds.extend(center);
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 17 });

          // Click a ROW polygon → details popup
          map.on("click", "row-fill", (e) => {
            const pr = e.features?.[0]?.properties || {};
            new mapboxgl.Popup({ closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font-size:12px;line-height:1.5;color:#111">
                  <div style="font-weight:700;color:#dc2626">Right-of-Way Parcel</div>
                  ${pr.row_type ? `<div><b>Detection:</b> ${pr.row_type}</div>` : ""}
                  ${pr.road_type ? `<div><b>Road class:</b> ${pr.road_type}</div>` : ""}
                  ${pr.mtfcc_name ? `<div><b>Feature (MTFCC):</b> ${pr.mtfcc_name}</div>` : ""}
                  ${pr.owner ? `<div><b>Owner:</b> ${pr.owner}</div>` : ""}
                  ${pr.apn ? `<div><b>APN:</b> ${pr.apn}</div>` : ""}
                  ${pr.acres ? `<div><b>Acres:</b> ${pr.acres}</div>` : ""}
                </div>`
              )
              .addTo(map);
          });
          map.on("mouseenter", "row-fill", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "row-fill", () => { map.getCanvas().style.cursor = ""; });
        });

        map.on("error", (e) => console.error("[RowMap]", e?.error?.message || e));
      } catch (e) {
        if (!cancelled) setError(e?.message || "ROW map failed to load.");
      }
    }
    init();

    return () => {
      cancelled = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcels, targetA?.latitude, targetA?.longitude]);

  if (!withGeom.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          ROW Map — {rowCount} right-of-way parcel{rowCount !== 1 ? "s" : ""} in ring
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500/60 border border-red-500" /> ROW parcel</span>
          {corridor?.found && <span className="flex items-center gap-1"><span className="w-4 h-0.5 bg-amber-500" style={{ borderTop: "2px dashed #f59e0b" }} /> Inferred ROW frontage (~{corridor.estimated_row_width_ft} ft)</span>}
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm border border-slate-300" /> Parcel boundary</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-cyan-400" /> Target A</span>
        </div>
      </div>
      {error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : (
        <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-border" style={{ height: 420 }} />
      )}
      <p className="text-[11px] text-muted-foreground">
        Red polygons are ROW-flagged parcels (roadway / rail / utility rights-of-way). Click one for details. Private easements are not mapped — check the deed of record (Step 16).
      </p>
    </div>
  );
}