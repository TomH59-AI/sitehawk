/**
 * CesiumPhoto3DViewer — Photorealistic 3D Tower Siting Exhibit viewer.
 *
 * Renders Google Photorealistic 3D Tiles as the base layer, then overlays:
 *  1. Parametric tower/compound/landscape from scene params (always)
 *  2. Real GeoJSON layers from TowerSitingRun (parcel boundary, candidate area,
 *     compound, fall zone, conflict layers) when sitingGeojson is provided.
 *
 * All geometry is deterministic math — no AI. Attribution via showCreditsOnScreen.
 */
import { useEffect, useRef, useCallback } from "react";

const FT_TO_M = 0.3048;
const MI_TO_M = 1609.344;

function lonDegPerMeter(lat) {
  return 1 / (111320 * Math.cos(lat * Math.PI / 180));
}
function latDegPerMeter() {
  return 1 / 110540;
}

// Convert a GeoJSON geometry (Polygon or MultiPolygon) to an array of Cesium Cartesian3 arrays
function geojsonRingToCartesian(geometry, Cesium, heightM = 0.5) {
  if (!geometry || !geometry.type) return [];
  const rings = [];

  const processRing = (coords) => {
    const positions = coords.map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, heightM)
    );
    rings.push(positions);
  };

  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(processRing);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach(poly => poly.forEach(processRing));
  } else if (geometry.type === "Feature") {
    return geojsonRingToCartesian(geometry.geometry, Cesium, heightM);
  } else if (geometry.type === "FeatureCollection") {
    geometry.features.forEach(f => {
      geojsonRingToCartesian(f.geometry, Cesium, heightM).forEach(r => rings.push(r));
    });
  }
  return rings;
}

export default function CesiumPhoto3DViewer({
  apiKey,
  lat,
  lon,
  params,
  treeMaturity,
  sitingGeojson,  // { parcelBoundary, candidateArea, compoundGeojson, fallZone, conflictLayers }
  onReady,
  onError,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const animRef = useRef(null);
  const tilesetRef = useRef(null);

  // ─── Init Cesium viewer once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !apiKey || !lat || !lon) return;

    const Cesium = window.Cesium;
    if (!Cesium) { onError?.("CesiumJS not loaded"); return; }

    Cesium.Ion.defaultAccessToken = window.__CESIUM_ION_TOKEN__ || "";

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement("div"),
      creditViewport: containerRef.current,
    });

    viewer.imageryLayers.removeAll();
    viewerRef.current = viewer;
    window.__cesiumViewer__ = viewer;

    // ── Load Google Photorealistic 3D Tiles ───────────────────────────────────
    (async () => {
      try {
        const tilesetUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
        let tileset;
        if (typeof Cesium.Cesium3DTileset.fromUrl === "function") {
          tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl, { showCreditsOnScreen: true });
        } else {
          tileset = new Cesium.Cesium3DTileset({ url: tilesetUrl, showCreditsOnScreen: true });
        }
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
      } catch (e) {
        console.warn("Google 3D Tiles failed, falling back to Cesium World Terrain:", e.message);
        try {
          const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
          viewer.terrainProvider = terrain;
          viewer.imageryLayers.addImageryProvider(
            new Cesium.IonImageryProvider({ assetId: 2 })
          );
        } catch { /* fail silently */ }
      }

      onReady?.();
    })();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      try { viewer.destroy(); } catch { }
      viewerRef.current = null;
      window.__cesiumViewer__ = null;
    };
  }, [apiKey, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draw / redraw all scene entities whenever params or overlays change ───
  const redrawScene = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !lat || !lon) return;
    const Cesium = window.Cesium;

    // Clear previous entities
    entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { } });
    entitiesRef.current = [];

    const heightFt = params.heightFt || 199;
    const heightM = heightFt * FT_TO_M;
    const compoundWM = (params.compoundW || 75) * FT_TO_M;
    const compoundDM = (params.compoundD || 75) * FT_TO_M;
    const towerType = params.towerType || "monopole";
    const bufferM = (params.bufferFt || 0) * FT_TO_M;
    const treeH = treeMaturity === "mature" ? 25 * FT_TO_M : 8 * FT_TO_M;
    const lonDeg = lonDegPerMeter(lat);
    const latDeg = latDegPerMeter();

    const add = (e) => { entitiesRef.current.push(e); return e; };

    // ── 1. GeoJSON overlays from TowerSitingRun ────────────────────────────
    if (params.showOverlays !== false && sitingGeojson) {
      // Parcel boundary — cyan outline
      if (sitingGeojson.parcelBoundary) {
        const rings = geojsonRingToCartesian(sitingGeojson.parcelBoundary, Cesium, 0.5);
        rings.forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: {
              positions: [...positions, positions[0]], // close ring
              width: 2.5,
              material: Cesium.Color.fromCssColorString("#00e5ff"),
              clampToGround: false,
            },
          }));
        });
      }

      // Candidate buildable area — green dashed outline
      if (sitingGeojson.candidateArea) {
        const rings = geojsonRingToCartesian(sitingGeojson.candidateArea, Cesium, 0.8);
        rings.forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: {
              positions: [...positions, positions[0]],
              width: 2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: Cesium.Color.fromCssColorString("#00ff88bb"),
                dashLength: 8,
              }),
              clampToGround: false,
            },
          }));
        });
      }

      // Siting compound from GeoJSON (overrides parametric rectangle if present)
      if (sitingGeojson.compoundGeojson) {
        const rings = geojsonRingToCartesian(sitingGeojson.compoundGeojson, Cesium, 0.3);
        rings.forEach(positions => {
          if (positions.length < 3) return;
          // Filled semi-transparent
          add(viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              height: 0.3,
              material: Cesium.Color.fromCssColorString("#334455cc"),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString("#aaccff"),
              outlineWidth: 2,
            },
          }));
        });
      }

      // Fall zone — orange circle outline
      if (sitingGeojson.fallZone) {
        const rings = geojsonRingToCartesian(sitingGeojson.fallZone, Cesium, 0.6);
        rings.forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: {
              positions: [...positions, positions[0]],
              width: 2,
              material: Cesium.Color.fromCssColorString("#ff6600cc"),
              clampToGround: false,
            },
          }));
        });
      }

      // Conflict / exclusion layers — red with label
      if (sitingGeojson.conflictLayers) {
        const geom = sitingGeojson.conflictLayers;
        const features = geom?.type === "FeatureCollection" ? geom.features : [geom];
        features.forEach(feat => {
          const rings = geojsonRingToCartesian(feat?.geometry || feat, Cesium, 0.7);
          rings.forEach(positions => {
            if (positions.length < 3) return;
            add(viewer.entities.add({
              polyline: {
                positions: [...positions, positions[0]],
                width: 1.5,
                material: Cesium.Color.fromCssColorString("#ff2244aa"),
                clampToGround: false,
              },
            }));
          });
        });
      }
    }

    // ── 2. Parametric tower shaft ──────────────────────────────────────────────
    let topRadius = 0.3;
    let bottomRadius = towerType === "self_support" ? 1.5 : towerType === "guyed" ? 0.6 : 0.4;

    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM / 2),
      cylinder: {
        length: heightM,
        topRadius,
        bottomRadius,
        material: Cesium.Color.fromCssColorString("#7a8899"),
        outline: false,
      },
    }));

    // Self-support legs
    if (towerType === "self_support") {
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        const legLon = lon + Math.cos(angle) * 1.5 * lonDeg;
        const legLat = lat + Math.sin(angle) * 1.5 * latDeg;
        add(viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(legLon, legLat, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
            ],
            width: 2,
            material: new Cesium.PolylineOutlineMaterialProperty({ color: Cesium.Color.fromCssColorString("#8899aa"), outlineWidth: 0 }),
          },
        }));
      }
    }

    // Guyed wires
    if (towerType === "guyed") {
      const guyRadius = heightM * 0.7;
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        add(viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * guyRadius * lonDeg, lat + Math.sin(angle) * guyRadius * latDeg, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, heightM * 0.8),
            ],
            width: 1,
            material: Cesium.Color.fromCssColorString("#aaaaaa80"),
          },
        }));
      }
    }

    // Sector antennas at top
    for (let i = 0; i < 3; i++) {
      const angle = (i * 120) * Math.PI / 180;
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * 1.2 * lonDeg, lat + Math.sin(angle) * 1.2 * latDeg, heightM - 1),
        box: { dimensions: new Cesium.Cartesian3(0.3, 0.15, 2.5), material: Cesium.Color.fromCssColorString("#cccccc") },
      }));
    }

    if (params.showMicrowave) {
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM - 8),
        ellipsoid: { radii: new Cesium.Cartesian3(1.2, 1.2, 0.2), material: Cesium.Color.fromCssColorString("#dddddd") },
      }));
    }

    // ── 3. Parametric compound (only if no GeoJSON compound overlay) ────────
    if (!sitingGeojson?.compoundGeojson || params.showOverlays === false) {
      const compHalfWLon = (compoundWM / 2) * lonDeg;
      const compHalfDLat = (compoundDM / 2) * latDeg;
      add(viewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(lon - compHalfWLon, lat - compHalfDLat, lon + compHalfWLon, lat + compHalfDLat),
          height: 0.1,
          material: Cesium.Color.fromCssColorString("#334455cc"),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#aaccff"),
          outlineWidth: 1.5,
        },
      }));

      // Equipment shelter
      const shelterLon = lon + compHalfWLon * 0.5;
      const shelterLat = lat - compHalfDLat * 0.5;
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 2),
        box: { dimensions: new Cesium.Cartesian3(10 * FT_TO_M, 12 * FT_TO_M, 4 * FT_TO_M), material: Cesium.Color.fromCssColorString("#778899") },
      }));

      if (params.showGenerator) {
        add(viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon - compHalfWLon * 0.5, lat - compHalfDLat * 0.5, 0.5),
          box: { dimensions: new Cesium.Cartesian3(2, 1, 1.5), material: Cesium.Color.fromCssColorString("#556677") },
        }));
      }

      if (params.showIceBridge) {
        add(viewer.entities.add({
          polyline: {
            positions: [Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 3.5), Cesium.Cartesian3.fromDegrees(lon, lat, 3.5)],
            width: 3,
            material: Cesium.Color.fromCssColorString("#aabbcc"),
          },
        }));
      }

      // Fence perimeter
      const fenceCorners = [
        [lon - compHalfWLon, lat - compHalfDLat], [lon + compHalfWLon, lat - compHalfDLat],
        [lon + compHalfWLon, lat + compHalfDLat], [lon - compHalfWLon, lat + compHalfDLat],
        [lon - compHalfWLon, lat - compHalfDLat],
      ];
      add(viewer.entities.add({
        polyline: {
          positions: fenceCorners.map(([flon, flat]) => Cesium.Cartesian3.fromDegrees(flon, flat, 2.4)),
          width: 2,
          material: Cesium.Color.fromCssColorString("#aaaaaa99"),
        },
      }));
    }

    // ── 4. Landscape buffer (evergreen tree ring) ──────────────────────────────
    if (params.showBuffer && bufferM > 0) {
      const halfW = compoundWM / 2 + bufferM;
      const halfD = compoundDM / 2 + bufferM;
      const treePts = [];
      for (let x = -halfW; x <= halfW; x += treeH * 0.9) {
        treePts.push([lon + x * lonDeg, lat + halfD * latDeg]);
        treePts.push([lon + x * lonDeg, lat - halfD * latDeg]);
      }
      for (let y = -halfD; y <= halfD; y += treeH * 0.9) {
        treePts.push([lon - halfW * lonDeg, lat + y * latDeg]);
        treePts.push([lon + halfW * lonDeg, lat + y * latDeg]);
      }
      treePts.slice(0, 120).forEach(([tlon, tlat]) => {
        add(viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(tlon, tlat, treeH / 2),
          cylinder: { length: treeH, topRadius: 0, bottomRadius: treeH * 0.35, material: Cesium.Color.fromCssColorString("#2d5a27cc") },
        }));
      });
    }

    // ── 5. RF radii ────────────────────────────────────────────────────────────
    if (params.showRFRadii) {
      [{ mi: 0.25, color: "#ff4444aa" }, { mi: 0.5, color: "#ff8800aa" }, { mi: 1.0, color: "#ffcc00aa" }].forEach(({ mi, color }) => {
        const rm = mi * MI_TO_M;
        add(viewer.entities.add({
          ellipse: {
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            semiMajorAxis: rm,
            semiMinorAxis: rm,
            height: 1,
            material: Cesium.Color.fromCssColorString(color).withAlpha(0),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(color),
            outlineWidth: 2,
          },
        }));
      });
    }
  }, [params, treeMaturity, lat, lon, sitingGeojson]);

  useEffect(() => {
    redrawScene();
  }, [redrawScene]);

  // ─── Default hero camera view ──────────────────────────────────────────────
  useEffect(() => {
    if (!viewerRef.current || !lat || !lon) return;
    const Cesium = window.Cesium;
    const heightM = (params.heightFt || 199) * FT_TO_M;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon - 0.002, lat - 0.002, heightM * 2.5),
      orientation: { heading: Cesium.Math.toRadians(45), pitch: Cesium.Math.toRadians(-25), roll: 0 },
      duration: 2,
    });
  }, [lat, lon, params.heightFt]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: 500 }}
    />
  );
}