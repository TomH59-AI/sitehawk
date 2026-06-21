/**
 * CesiumPhoto3DViewer — embeds a full CesiumJS photorealistic 3D viewer
 * using Google Photorealistic 3D Tiles as the base layer.
 *
 * Renders parametric tower, compound, landscape buffer, and RF radii
 * entirely from Cesium primitives — no external GLB fetch.
 *
 * Google attribution is handled by showCreditsOnScreen: true on the tileset.
 */
import { useEffect, useRef, useCallback } from "react";

const FT_TO_M = 0.3048;
const MI_TO_M = 1609.344;

// degrees of longitude per meter at a given latitude
function lonDegPerMeter(lat) {
  return 1 / (111320 * Math.cos(lat * Math.PI / 180));
}
function latDegPerMeter() {
  return 1 / 110540;
}

export default function CesiumPhoto3DViewer({ apiKey, lat, lon, params, treeMaturity, onReady, onError }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const primitiveRef = useRef([]);
  const animRef = useRef(null);
  const tilesetRef = useRef(null);

  // ─── Init Cesium viewer once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !apiKey || !lat || !lon) return;

    // CesiumJS must already be loaded via the page's <script> tag
    const Cesium = window.Cesium;
    if (!Cesium) { onError?.("CesiumJS not loaded"); return; }

    // Ion token (Cesium World Terrain fallback)
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
      creditContainer: document.createElement("div"), // hide default credit overlay (we use showCreditsOnScreen)
      creditViewport: containerRef.current,
    });

    // Remove default imagery
    viewer.imageryLayers.removeAll();

    viewerRef.current = viewer;

    // ── Load Google Photorealistic 3D Tiles ───────────────────────────────────
    (async () => {
      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`,
          { showCreditsOnScreen: true }
        );
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
      } catch (e) {
        console.warn("Google 3D Tiles failed, falling back to Cesium World Terrain:", e.message);
        // Fallback: Bing satellite + Cesium terrain
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
    };
  }, [apiKey, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draw / redraw scene entities whenever params change ──────────────────
  const redrawScene = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !lat || !lon) return;
    const Cesium = window.Cesium;

    // Clear previous entities & primitives
    entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { } });
    primitiveRef.current.forEach(p => { try { viewer.scene.primitives.remove(p); } catch { } });
    entitiesRef.current = [];
    primitiveRef.current = [];

    const heightFt = params.heightFt || 199;
    const heightM = heightFt * FT_TO_M;
    const compoundWM = (params.compoundW || 75) * FT_TO_M;
    const compoundDM = (params.compoundD || 75) * FT_TO_M;
    const towerType = params.towerType || "monopole";
    const bufferM = (params.bufferFt || 0) * FT_TO_M;
    const treeH = treeMaturity === "mature" ? 25 * FT_TO_M : 8 * FT_TO_M;

    const lonDeg = lonDegPerMeter(lat);
    const latDeg = latDegPerMeter();

    // ── Tower shaft ───────────────────────────────────────────────────────────
    const towerPos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);

    let topRadius = 0.3;
    let bottomRadius = towerType === "self_support" ? 1.5 : towerType === "guyed" ? 0.6 : 0.4;

    const towerCylinder = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM / 2),
      cylinder: {
        length: heightM,
        topRadius,
        bottomRadius,
        material: Cesium.Color.fromCssColorString("#7a8899"),
        outline: false,
      },
    });
    entitiesRef.current.push(towerCylinder);

    // Self-support legs (3 diagonal lines)
    if (towerType === "self_support") {
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        const legLon = lon + Math.cos(angle) * 1.5 * lonDeg;
        const legLat = lat + Math.sin(angle) * 1.5 * latDeg;
        const leg = viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(legLon, legLat, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
            ],
            width: 2,
            material: new Cesium.PolylineOutlineMaterialProperty({
              color: Cesium.Color.fromCssColorString("#8899aa"),
              outlineWidth: 0,
            }),
          },
        });
        entitiesRef.current.push(leg);
      }
    }

    // Guyed wires
    if (towerType === "guyed") {
      const guyRadius = heightM * 0.7;
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        const anchorLon = lon + Math.cos(angle) * guyRadius * lonDeg;
        const anchorLat = lat + Math.sin(angle) * guyRadius * latDeg;
        const wire = viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(anchorLon, anchorLat, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, heightM * 0.8),
            ],
            width: 1,
            material: Cesium.Color.fromCssColorString("#aaaaaa80"),
          },
        });
        entitiesRef.current.push(wire);
      }
    }

    // ── Sector antennas at top ────────────────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const angle = (i * 120) * Math.PI / 180;
      const aLon = lon + Math.cos(angle) * 1.2 * lonDeg;
      const aLat = lat + Math.sin(angle) * 1.2 * latDeg;
      const ant = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(aLon, aLat, heightM - 1),
        box: {
          dimensions: new Cesium.Cartesian3(0.3, 0.15, 2.5),
          material: Cesium.Color.fromCssColorString("#cccccc"),
        },
      });
      entitiesRef.current.push(ant);
    }

    // Microwave dishes
    if (params.showMicrowave) {
      const dish = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM - 8),
        ellipsoid: {
          radii: new Cesium.Cartesian3(1.2, 1.2, 0.2),
          material: Cesium.Color.fromCssColorString("#dddddd"),
        },
      });
      entitiesRef.current.push(dish);
    }

    // ── Compound ──────────────────────────────────────────────────────────────
    const compHalfWLon = (compoundWM / 2) * lonDeg;
    const compHalfDLat = (compoundDM / 2) * latDeg;
    const compoundOutline = viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(
          lon - compHalfWLon, lat - compHalfDLat,
          lon + compHalfWLon, lat + compHalfDLat
        ),
        height: 0.1,
        material: Cesium.Color.fromCssColorString("#334455cc"),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString("#aaccff"),
        outlineWidth: 1.5,
      },
    });
    entitiesRef.current.push(compoundOutline);

    // Equipment shelter
    const shelterLon = lon + compHalfWLon * 0.5;
    const shelterLat = lat - compHalfDLat * 0.5;
    const shelter = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 2),
      box: {
        dimensions: new Cesium.Cartesian3(10 * FT_TO_M, 12 * FT_TO_M, 4 * FT_TO_M),
        material: Cesium.Color.fromCssColorString("#778899"),
      },
    });
    entitiesRef.current.push(shelter);

    // Generator pad
    if (params.showGenerator) {
      const genLon = lon - compHalfWLon * 0.5;
      const genLat = lat - compHalfDLat * 0.5;
      const gen = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(genLon, genLat, 0.5),
        box: {
          dimensions: new Cesium.Cartesian3(2, 1, 1.5),
          material: Cesium.Color.fromCssColorString("#556677"),
        },
      });
      entitiesRef.current.push(gen);
    }

    // Ice bridge
    if (params.showIceBridge) {
      const bridge = viewer.entities.add({
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 3.5),
            Cesium.Cartesian3.fromDegrees(lon, lat, 3.5),
          ],
          width: 3,
          material: Cesium.Color.fromCssColorString("#aabbcc"),
        },
      });
      entitiesRef.current.push(bridge);
    }

    // Fence (4 sides as polyline)
    const fenceCorners = [
      [lon - compHalfWLon, lat - compHalfDLat],
      [lon + compHalfWLon, lat - compHalfDLat],
      [lon + compHalfWLon, lat + compHalfDLat],
      [lon - compHalfWLon, lat + compHalfDLat],
      [lon - compHalfWLon, lat - compHalfDLat],
    ];
    const fence = viewer.entities.add({
      polyline: {
        positions: fenceCorners.map(([flon, flat]) => Cesium.Cartesian3.fromDegrees(flon, flat, 2.4)),
        width: 2,
        material: Cesium.Color.fromCssColorString("#aaaaaa99"),
        clampToGround: false,
      },
    });
    entitiesRef.current.push(fence);

    // ── Landscape buffer (evergreen tree ring) ────────────────────────────────
    if (params.showBuffer && bufferM > 0) {
      const halfW = compoundWM / 2 + bufferM;
      const halfD = compoundDM / 2 + bufferM;
      const numTrees = Math.max(8, Math.round(2 * (halfW + halfD) / (treeH * 0.8)));
      const perim = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // rough 8 sides
      // distribute trees around rect perimeter
      const treePts = [];
      // top/bottom
      for (let x = -halfW; x <= halfW; x += treeH * 0.9) {
        treePts.push([lon + x * lonDeg, lat + halfD * latDeg]);
        treePts.push([lon + x * lonDeg, lat - halfD * latDeg]);
      }
      // left/right
      for (let y = -halfD; y <= halfD; y += treeH * 0.9) {
        treePts.push([lon - halfW * lonDeg, lat + y * latDeg]);
        treePts.push([lon + halfW * lonDeg, lat + y * latDeg]);
      }
      treePts.slice(0, 120).forEach(([tlon, tlat]) => {
        const tree = viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(tlon, tlat, treeH / 2),
          cylinder: {
            length: treeH,
            topRadius: 0,
            bottomRadius: treeH * 0.35,
            material: Cesium.Color.fromCssColorString("#2d5a27cc"),
          },
        });
        entitiesRef.current.push(tree);
      });
    }

    // ── RF radii ──────────────────────────────────────────────────────────────
    if (params.showRFRadii) {
      const rings = [
        { mi: 0.25, color: "#ff4444aa" },
        { mi: 0.5, color: "#ff8800aa" },
        { mi: 1.0, color: "#ffcc00aa" },
      ];
      rings.forEach(({ mi, color }) => {
        const rm = mi * MI_TO_M;
        const ring = viewer.entities.add({
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
        });
        entitiesRef.current.push(ring);
      });
    }
  }, [params, treeMaturity, lat, lon]);

  useEffect(() => {
    redrawScene();
  }, [redrawScene]);

  // ─── Camera preset helpers (exposed via ref for parent) ───────────────────
  useEffect(() => {
    if (!viewerRef.current || !lat || !lon) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const heightM = (params.heightFt || 199) * FT_TO_M;

    // Default hero view: SW angle, -25° pitch
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon - 0.002, lat - 0.002, heightM * 2.5),
      orientation: {
        heading: Cesium.Math.toRadians(45),
        pitch: Cesium.Math.toRadians(-25),
        roll: 0,
      },
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