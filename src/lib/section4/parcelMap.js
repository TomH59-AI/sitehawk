/**
 * section4/parcelMap — the Realie parcel map renderer for the HAWK TARGET A MAP
 * SUITE. Draws Target A's parcel in brand green, every other ring parcel in cyan,
 * per-parcel APN + dimension labels, the SARF ring, and an interactive owner /
 * parcel-ID popup. Centers on the SARF center so the whole ring is in view.
 */

import {
  SAT_STYLE, BRAND_GREEN,
  makeMap, buildCircle, fitToRing, addTowerMarker, parcelCentroid,
} from "./mapCore";

// Parcel popup zoning lookup is disabled (no per-hover API calls). Kept as a
// session cache + line formatter so the popup shows a stable "Zoning: —".
const parcelZoneCache = new Map();

async function lookupParcelZone(pid) {
  parcelZoneCache.set(pid, null);
  return null;
}

function zoneLine(zone) {
  if (zone === undefined) return "Zoning: loading…";
  if (!zone) return "Zoning: —";
  return `Zoning: ${zone.zone_code}${zone.zone_name ? ` — ${zone.zone_name}` : ""}`;
}

// ────────────── 6. PARCEL (Realie) ──────────────
export async function renderParcel(container, target, parcels, token, zoneomicsKey, ringName, srcLat, srcLon, radiusMiles = 0.5) {
  const { latitude: lat, longitude: lon, owner, apn } = target;
  // Center the parcel map on the SARF center so the whole ring is in view.
  const cLat = Number.isFinite(srcLat) ? srcLat : lat;
  const cLon = Number.isFinite(srcLon) ? srcLon : lon;
  const map = await makeMap(container, SAT_STYLE, [cLon, cLat], token, 15);
  return new Promise((resolve) => {
    map.on("load", () => {
      // SARF search ring outline (the radius the user selected).
      if (Number.isFinite(srcLat) && Number.isFinite(srcLon)) {
        const ring = buildCircle(cLat, cLon, radiusMiles);
        map.addSource("s4-sarf-ring", { type: "geojson", data: ring });
        map.addLayer({ id: "s4-sarf-ring-line", type: "line", source: "s4-sarf-ring", paint: { "line-color": "#facc15", "line-width": 2.5, "line-dasharray": [3, 2] } });
      }

      // Compact dimension label for a parcel — acreage and/or frontage×depth.
      const dimText = (p) => {
        const parts = [];
        if (p.acreage != null && Number(p.acreage) > 0) parts.push(`${Number(p.acreage).toFixed(2)} ac`);
        if (p.lot_frontage_ft && p.lot_depth_ft) parts.push(`${Math.round(p.lot_frontage_ft)}×${Math.round(p.lot_depth_ft)} ft`);
        else if (p.lot_size_sqft && Number(p.lot_size_sqft) > 0) parts.push(`${Math.round(Number(p.lot_size_sqft)).toLocaleString()} sf`);
        return parts.join(" · ");
      };

      // All parcels in the SARF ring — visible cyan boundaries (those with geometry).
      const adj = {
        type: "FeatureCollection",
        features: (parcels || [])
          .filter((p) => p.parcel_geometry && p.apn !== apn)
          .map((p) => ({
            type: "Feature",
            geometry: p.parcel_geometry,
            properties: {
              apn: p.apn || "",
              owner: p.owner_name || p.owner || "",
              dims: dimText(p),
              clat: parcelCentroid(p.parcel_geometry)?.lat ?? null,
              clon: parcelCentroid(p.parcel_geometry)?.lon ?? null,
            },
          })),
      };
      if (adj.features.length) {
        map.addSource("s4-adj", { type: "geojson", data: adj });
        // Faint fill so the whole parcel area is hover/click targetable + visible.
        map.addLayer({ id: "s4-adj-fill", type: "fill", source: "s4-adj", paint: { "fill-color": "#22d3ee", "fill-opacity": 0.08 } });
        map.addLayer({ id: "s4-adj-line", type: "line", source: "s4-adj", paint: { "line-color": "#22d3ee", "line-width": 2.2, "line-opacity": 1 } });
      }

      // Target A parcel — brand green highlight (if its geometry is available).
      const targetParcel = (parcels || []).find((p) => p.apn === apn && p.parcel_geometry);
      if (targetParcel) {
        const tc = parcelCentroid(targetParcel.parcel_geometry);
        const fc = {
          type: "Feature",
          geometry: targetParcel.parcel_geometry,
          properties: { apn: targetParcel.apn || apn || "", owner: owner || "", dims: dimText(targetParcel), clat: tc?.lat ?? lat, clon: tc?.lon ?? lon },
        };
        map.addSource("s4-target", { type: "geojson", data: fc });
        map.addLayer({ id: "s4-target-fill", type: "fill", source: "s4-target", paint: { "fill-color": BRAND_GREEN, "fill-opacity": 0.3 } });
        map.addLayer({ id: "s4-target-line", type: "line", source: "s4-target", paint: { "line-color": BRAND_GREEN, "line-width": 3 } });
      }

      // ── Interactive popup: owner + parcel ID + zoning (cached + debounced) ──
      const popup = new window.mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: 8 });
      let debounceTimer = null;

      const popupHTML = (props, zone) => {
        const pid = props.apn || "—";
        const dimsRow = props.dims ? `<span style="color:#3b82f6;">Dimensions: ${props.dims}</span><br/>` : "";
        return `<div style="font-family:monospace;font-size:11px;line-height:1.5;color:#3b82f6;">
          <strong style="color:#3b82f6;">${props.owner || "Owner —"}</strong><br/>
          <span style="color:#3b82f6;">Parcel ID: ${pid}</span><br/>
          ${dimsRow}
          <span data-zone="${pid}" style="color:#3b82f6;">${zoneLine(zone)}</span>
        </div>`;
      };

      const showPopup = (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const props = f.properties || {};
        const pid = props.apn || `${props.clon},${props.clat}`;
        map.getCanvas().style.cursor = "pointer";

        const cached = parcelZoneCache.has(pid) ? parcelZoneCache.get(pid) : undefined;
        popup.setLngLat(e.lngLat).setHTML(popupHTML(props, cached)).addTo(map);

        // Already resolved this parcel — no lookup needed.
        if (cached !== undefined) return;

        // Debounce the zoning lookup by 300ms.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          const clat = props.clat != null ? Number(props.clat) : null;
          const clon = props.clon != null ? Number(props.clon) : null;
          const zone = await lookupParcelZone(pid, clat, clon, zoneomicsKey);
          // Only patch if the popup is still showing this parcel.
          const span = popup.isOpen() && popup.getElement()?.querySelector(`[data-zone="${props.apn || "—"}"]`);
          if (span) span.textContent = zoneLine(zone);
        }, 300);
      };

      const clearCursor = () => { map.getCanvas().style.cursor = ""; };

      for (const layerId of ["s4-adj-fill", "s4-target-fill"]) {
        if (!map.getLayer(layerId)) continue;
        map.on("mousemove", layerId, showPopup);
        map.on("click", layerId, showPopup);
        map.on("mouseleave", layerId, clearCursor);
      }

      // Per-parcel labels at each centroid: APN on line 1, dimensions on line 2.
      const apnPoints = {
        type: "FeatureCollection",
        features: (parcels || [])
          .filter((p) => p.parcel_geometry && p.apn && p.apn !== apn)
          .map((p) => {
            const c = parcelCentroid(p.parcel_geometry);
            if (!c) return null;
            const dims = dimText(p);
            return { type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { label: dims ? `${p.apn}\n${dims}` : p.apn } };
          })
          .filter(Boolean),
      };
      if (apnPoints.features.length) {
        map.addSource("s4-apn", { type: "geojson", data: apnPoints });
        map.addLayer({
          id: "s4-apn-layer", type: "symbol", source: "s4-apn",
          layout: { "text-field": ["get", "label"], "text-size": 10, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": false },
          paint: { "text-color": "#fff", "text-halo-color": "#0f172a", "text-halo-width": 2 },
        });
      }

      // Label + tower marker on Target A — ring name (user input) + parcel number.
      const labelText = `${ringName || "Search Ring"}${apn ? ` · ${apn}` : ""}`;
      map.addSource("s4-label", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { label: labelText } }] },
      });
      map.addLayer({
        id: "s4-label-layer", type: "symbol", source: "s4-label",
        layout: { "text-field": ["get", "label"], "text-size": 13, "text-offset": [0, 2], "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"], "text-allow-overlap": true },
        paint: { "text-color": "#fff", "text-halo-color": BRAND_GREEN, "text-halo-width": 2.5 },
      });
      addTowerMarker(map, lat, lon, owner);
      // Fit the whole SARF ring so every parcel boundary in the radius is visible.
      fitToRing(map, cLat, cLon, radiusMiles);
      resolve(map);
    });
  });
}