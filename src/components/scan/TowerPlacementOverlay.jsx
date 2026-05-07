import { useEffect, useRef, useState } from "react";
import { computeTowerPlacement, ftToLatLon, extractRings } from "@/lib/towerPlacement";
import TowerSpecsForm from "@/components/tower/TowerSpecsForm";
import { Compass, X } from "lucide-react";

// Convert (x_ft, y_ft) corners of a rectangle into a closed Leaflet latlng ring
function rectToLatLngs(corners, centroid, ftPerLon, ftPerLat) {
  const ring = corners.map(([x, y]) => {
    const ll = ftToLatLon(x, y, centroid, ftPerLon, ftPerLat);
    return [ll.lat, ll.lon];
  });
  ring.push(ring[0]);
  return ring;
}

/**
 * Adds tower-placement geometry (parcel outline, valid zone, compound, fall zone,
 * access easement, tower base marker) as Leaflet layers over an existing map.
 * Renders a UI panel for selecting a parcel and entering tower specs.
 */
export default function TowerPlacementOverlay({ map, L, results }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const layerRef = useRef(null);

  // Default to first parcel that has geometry
  useEffect(() => {
    if (!selectedId && results?.length) {
      const first = results.find(r => r.parcel_geometry);
      if (first) setSelectedId(first.id);
    }
  }, [results, selectedId]);

  // Clean up map layers
  const clearLayers = () => {
    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }
  };

  // Draw analysis on the map
  useEffect(() => {
    if (!map || !L) return;
    clearLayers();
    if (!open || !analysis?.ok) return;

    const { parcelDims, validZone, placement, compoundSizeFt, setbackFt, accessEasement, accessPreference } = analysis;
    const { centroid, ftPerLon, ftPerLat } = parcelDims;

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    // 1. Parcel outline (re-draw from geometry rings)
    const selectedParcel = results.find(r => r.id === selectedId);
    const rings = extractRings(selectedParcel?.parcel_geometry);
    rings.forEach(ring => {
      const latlngs = ring.map(([lon, lat]) => [lat, lon]);
      L.polygon(latlngs, {
        color: "#f8fafc", weight: 2, opacity: 0.9,
        fillColor: "#f8fafc", fillOpacity: 0.04, dashArray: "6 4",
      }).addTo(group);
    });

    // 2. Valid placement zone (parcel minus setback)
    if (validZone?.zone) {
      const z = validZone.zone;
      const zoneRing = rectToLatLngs(
        [[z.minX, z.minY], [z.maxX, z.minY], [z.maxX, z.maxY], [z.minX, z.maxY]],
        centroid, ftPerLon, ftPerLat
      );
      L.polygon(zoneRing, {
        color: "#22c55e", weight: 1.5, opacity: 0.8,
        fillColor: "#22c55e", fillOpacity: 0.15, dashArray: "4 3",
      }).bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><b>Valid Placement Zone</b><br/>${z.widthFt.toFixed(0)} × ${z.depthFt.toFixed(0)} ft<br/>(parcel minus ${setbackFt}-ft setback)</div>`).addTo(group);
    }

    // 3. Fall zone circle (radius = tower height × fall zone %)
    const fallRadiusFt = setbackFt;
    const fallRadiusMeters = fallRadiusFt * 0.3048;
    L.circle([placement.lat, placement.lon], {
      radius: fallRadiusMeters,
      color: "#f59e0b", weight: 2, opacity: 0.85,
      fillColor: "#f59e0b", fillOpacity: 0.10, dashArray: "5 5",
    }).bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><b>Fall Zone</b><br/>Radius: ${fallRadiusFt} ft<br/>(tower height × ${(analysis.fallZonePct * 100).toFixed(0)}%)</div>`).addTo(group);

    // 4. Tower compound (square centered on tower base)
    const half = compoundSizeFt / 2;
    const cx = placement.x_ft, cy = placement.y_ft;
    const compoundRing = rectToLatLngs(
      [[cx - half, cy - half], [cx + half, cy - half], [cx + half, cy + half], [cx - half, cy + half]],
      centroid, ftPerLon, ftPerLat
    );
    L.polygon(compoundRing, {
      color: "#ef4444", weight: 2.5, opacity: 1,
      fillColor: "#ef4444", fillOpacity: 0.25,
    }).bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><b>Tower Compound</b><br/>${compoundSizeFt} × ${compoundSizeFt} ft<br/>(${((compoundSizeFt * compoundSizeFt) / 43560).toFixed(3)} acres)</div>`).addTo(group);

    // 5. Access easement (12-ft strip from compound edge to nearest parcel edge)
    if (accessEasement?.lengthFt > 0) {
      const w = accessEasement.widthFt / 2;
      let ex1, ey1, ex2, ey2;
      switch (accessPreference) {
        case "south": case "southwest": case "southeast":
          ex1 = cx - w; ey1 = cy - half - accessEasement.lengthFt;
          ex2 = cx + w; ey2 = cy - half;
          break;
        case "east": case "northeast": case "southeast":
          ex1 = cx + half; ey1 = cy - w;
          ex2 = cx + half + accessEasement.lengthFt; ey2 = cy + w;
          break;
        case "west": case "northwest": case "southwest":
          ex1 = cx - half - accessEasement.lengthFt; ey1 = cy - w;
          ex2 = cx - half; ey2 = cy + w;
          break;
        case "north": default:
          ex1 = cx - w; ey1 = cy + half;
          ex2 = cx + w; ey2 = cy + half + accessEasement.lengthFt;
      }
      const easementRing = rectToLatLngs(
        [[ex1, ey1], [ex2, ey1], [ex2, ey2], [ex1, ey2]],
        centroid, ftPerLon, ftPerLat
      );
      L.polygon(easementRing, {
        color: "#a855f7", weight: 2, opacity: 0.9,
        fillColor: "#a855f7", fillOpacity: 0.30,
      }).bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><b>Access Easement</b><br/>${accessEasement.widthFt} × ${accessEasement.lengthFt.toFixed(0)} ft<br/>From ${accessPreference} side</div>`).addTo(group);
    }

    // 6. Tower base marker
    const towerIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#0a0e17;border:3px solid #ef4444;box-shadow:0 0 12px #ef4444cc;"></div>`,
      className: "", iconSize: [14, 14], iconAnchor: [7, 7],
    });
    L.marker([placement.lat, placement.lon], { icon: towerIcon })
      .bindPopup(`<div style="font-family:sans-serif;font-size:12px;"><b>Tower Base</b><br/>${placement.cornerLabel}<br/>${placement.lat.toFixed(6)}, ${placement.lon.toFixed(6)}</div>`)
      .addTo(group);

    // Fit map to compound area
    const all = [...compoundRing, ...rings.flatMap(r => r.map(([lon, lat]) => [lat, lon]))];
    if (all.length) {
      map.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 19 });
    }

    return clearLayers;
  }, [map, L, open, analysis, selectedId, results]);

  // Cleanup on unmount
  useEffect(() => clearLayers, []);

  if (!results?.length) return null;
  const parcelsWithGeometry = results.filter(r => r.parcel_geometry);
  if (parcelsWithGeometry.length === 0) {
    return (
      <button
        disabled
        title="No parcels in these results have boundary geometry. Tower placement requires parcel polygons (FL, NC, MA, MD, and most TX/GA county feeds)."
        style={{
          position: "absolute", top: 16, right: 200, zIndex: 500,
          background: "#111827aa", border: "1px solid #334155", color: "#64748b",
          borderRadius: 10, padding: "9px 12px",
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13,
          cursor: "not-allowed",
        }}
      >
        🗼 Tower Placement (no geometry)
      </button>
    );
  }

  const handleSubmit = (specs) => {
    const parcel = results.find(r => r.id === selectedId);
    if (!parcel) return;
    setAnalysis(computeTowerPlacement(parcel, specs));
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "absolute", top: 16, right: 200, zIndex: 500,
          background: open ? "#ef444433" : "#111827dd",
          border: `1px solid ${open ? "#ef444466" : "#334155"}`,
          color: open ? "#fecaca" : "#cbd5e1",
          borderRadius: 10, padding: "9px 12px",
          fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 13,
          cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <Compass size={14} />
        Tower Placement {open ? "On" : "Off"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: 64, right: 16, zIndex: 500,
            width: 340, maxHeight: "calc(100% - 80px)", overflowY: "auto",
            background: "#0f172aef", border: "1px solid #1e293b",
            borderRadius: 12, padding: 14,
            fontFamily: "'Rajdhani', sans-serif",
            color: "#e2e8f0", boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#f8fafc" }}>🗼 Tower Placement</div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 4 }}>Parcel</label>
            <select
              value={selectedId || ""}
              onChange={(e) => { setSelectedId(e.target.value); setAnalysis(null); }}
              style={{
                width: "100%", padding: "7px 9px", borderRadius: 8,
                background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", fontSize: 13,
              }}
            >
              {parcelsWithGeometry.map((r, idx) => {
                const realIdx = results.findIndex(x => x.id === r.id);
                return (
                  <option key={r.id} value={r.id}>
                    #{realIdx + 1} · {r.site_name || r.parcel_address || `Parcel ${r.parcel_id}`} ({r.match_score}%)
                  </option>
                );
              })}
            </select>
          </div>

          <div style={{ background: "#0a0e17", border: "1px solid #1e293b", borderRadius: 8, padding: 10 }}>
            <TowerSpecsForm onSubmit={handleSubmit} />
          </div>

          {analysis && !analysis.ok && (
            <div style={{ marginTop: 10, background: "#7f1d1d44", border: "1px solid #ef444466", borderRadius: 8, padding: 10, fontSize: 12, color: "#fecaca" }}>
              <b>Cannot place tower:</b><br />{analysis.message}
            </div>
          )}

          {analysis?.ok && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#cbd5e1", lineHeight: 1.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, color: analysis.compliant ? "#86efac" : "#fcd34d", fontWeight: 700 }}>
                {analysis.compliant ? "✓ All setbacks compliant" : "⚠ Setback issue"}
              </div>
              <div>Setback (fall zone): <b>{analysis.setbackFt} ft</b></div>
              <div>Tower base: <b>{analysis.placement.cornerLabel}</b></div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#94a3b8" }}>
                {analysis.placement.lat.toFixed(6)}, {analysis.placement.lon.toFixed(6)}
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{ color: "#94a3b8" }}>Distances (ft): </span>
                N {analysis.distances.north_ft.toFixed(0)} ·
                S {analysis.distances.south_ft.toFixed(0)} ·
                E {analysis.distances.east_ft.toFixed(0)} ·
                W {analysis.distances.west_ft.toFixed(0)}
              </div>
              {analysis.warnings?.length > 0 && (
                <div style={{ marginTop: 8, padding: 8, background: "#78350f44", border: "1px solid #f59e0b66", borderRadius: 6 }}>
                  {analysis.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 10, color: "#fcd34d", marginBottom: 3 }}>⚠ {w}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e293b", fontSize: 10, color: "#94a3b8" }}>
            <div style={{ color: "#f8fafc", fontWeight: 700, marginBottom: 6 }}>Map Legend</div>
            <LegendRow color="#f8fafc" dashed label="Parcel boundary" />
            <LegendRow color="#22c55e" dashed label="Valid placement zone" />
            <LegendRow color="#f59e0b" dashed label="Fall zone (radius = setback)" />
            <LegendRow color="#ef4444" label="Tower compound" />
            <LegendRow color="#a855f7" label="Access easement" />
          </div>
        </div>
      )}
    </>
  );
}

function LegendRow({ color, label, dashed }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
      <span style={{
        width: 18, height: 4, background: color, borderRadius: 2,
        boxShadow: `0 0 6px ${color}55`,
        opacity: dashed ? 0.85 : 1,
        backgroundImage: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : "none",
      }} />
      <span>{label}</span>
    </div>
  );
}