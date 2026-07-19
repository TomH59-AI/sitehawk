// HawkPerch 3D scene helpers — converts the deterministic 2D fit geometry
// (parcel, setback envelope, compound, fall zone, tower) into Cesium entities.
// Visual verification ONLY — never changes the HawkPerch verdict.
import * as turf from "@turf/turf";

const FT_TO_M = 0.3048;
const FT_TO_KM = 0.0003048;

export function ringsOf(geometry, Cesium, heightM = 0.6) {
  if (!geometry) return [];
  const g = geometry.type === "Feature" ? geometry.geometry : geometry;
  if (!g) return [];
  const rings = [];
  const push = (coords) => rings.push(coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, heightM)));
  if (g.type === "Polygon") g.coordinates.forEach(push);
  else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => p.forEach(push));
  return rings;
}

// Inward-buffered setback envelope from the parcel + the live setback distance.
export function buildSetbackEnvelope(parcelGeometry, setbackFt) {
  if (!parcelGeometry || !setbackFt) return null;
  try {
    const env = turf.buffer(
      { type: "Feature", properties: {}, geometry: parcelGeometry },
      -setbackFt * FT_TO_KM,
      { units: "kilometers" }
    );
    return env && turf.area(env) > 1 ? env : null;
  } catch { return null; }
}

// Draw the full HawkPerch scene. Returns the entities added so the caller can
// remove them before the next redraw.
export function drawPerchScene(viewer, Cesium, { siteTarget, towerLngLat, fit, controls, savedTargets }) {
  const entities = [];
  const add = (e) => { entities.push(e); return e; };
  const outline = (geometry, color, { dash = false, width = 3, h = 0.6 } = {}) => {
    ringsOf(geometry, Cesium, h).forEach((positions) => {
      if (positions.length < 3) return;
      add(viewer.entities.add({
        polyline: {
          positions: [...positions, positions[0]],
          width,
          material: dash
            ? new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString(color), dashLength: 10 })
            : Cesium.Color.fromCssColorString(color),
          clampToGround: false,
        },
      }));
    });
  };

  const statusColor = fit?.status === "works" ? "#10B981" : "#EF4444";

  // 1. Parcel boundary — cyan (the legal line everything is measured from)
  outline(siteTarget?.parcel_geometry, "#00E5FF", { width: 3.5 });

  // 2. Setback envelope — dashed yellow (buildable line after the live setback)
  const envelope = buildSetbackEnvelope(siteTarget?.parcel_geometry, fit?.setbackFt);
  outline(envelope, "#FFD400", { dash: true, width: 2.5, h: 1.2 });

  // 3. Fall zone + compound — same features the 2D verdict was computed from
  outline(fit?.fallZone, statusColor, { dash: true, width: 2.5, h: 1.0 });
  outline(fit?.compound, "#F59E0B", { width: 2.5, h: 0.8 });

  // 4. Tower — to-scale monopole at the exact 2D pin position
  if (towerLngLat) {
    const heightM = (controls?.heightFt || 199) * FT_TO_M;
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(towerLngLat[0], towerLngLat[1], heightM / 2),
      cylinder: {
        length: heightM, topRadius: 0.35, bottomRadius: 0.9,
        material: Cesium.Color.fromCssColorString(statusColor).withAlpha(0.9),
      },
    }));
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(towerLngLat[0], towerLngLat[1], heightM + 6),
      label: {
        text: `${Math.round(controls?.heightFt || 199)}′ AGL · ${fit?.status === "works" ? "ALLOWABLE" : fit?.errorCode || "UNALLOWABLE"}`,
        font: "bold 13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString(statusColor).withAlpha(0.85),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }));
  }

  // 5. Saved D/E/F targets
  (savedTargets || []).forEach((target, index) => {
    if (!target) return;
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(target.lng, target.lat, 2),
      point: { pixelSize: 12, color: Cesium.Color.fromCssColorString("#7C3AED"), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: ["D", "E", "F"][index], font: "bold 12px sans-serif",
        fillColor: Cesium.Color.WHITE, pixelOffset: new Cesium.Cartesian2(0, -18),
        showBackground: true, backgroundColor: Cesium.Color.fromCssColorString("#7C3AED").withAlpha(0.9),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }));
  });

  return entities;
}

// Frame the camera on parcel + tower apex once.
export function framePerchScene(viewer, Cesium, { siteTarget, towerLngLat, heightFt }) {
  const pts = [];
  ringsOf(siteTarget?.parcel_geometry, Cesium, 0.5).forEach((ring) => ring.forEach((p) => pts.push(p)));
  if (towerLngLat) {
    pts.push(Cesium.Cartesian3.fromDegrees(towerLngLat[0], towerLngLat[1], 0));
    pts.push(Cesium.Cartesian3.fromDegrees(towerLngLat[0], towerLngLat[1], (heightFt || 199) * FT_TO_M));
  }
  if (pts.length < 2) return;
  const sphere = Cesium.BoundingSphere.fromPoints(pts);
  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(35), Cesium.Math.toRadians(-40), Math.max((heightFt || 199) * FT_TO_M * 1.6, sphere.radius * 2.6)),
    duration: 1.8,
  });
}