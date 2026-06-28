/**
 * CesiumPhoto3DViewer — Photorealistic 3D Tower Siting Exhibit viewer.
 *
 * Base layer priority:
 *   1. Google Photorealistic 3D Tiles (if apiKey provided)
 *   2. Cesium Ion asset 2275207 (high-res aerial imagery) — fallback
 *   3. Cesium Ion World Terrain + Bing aerial — last resort
 *
 * Always renders — apiKey is optional. Tower/compound/landscape/overlays
 * are drawn as Cesium entities on top of whichever base loads.
 */
import { useEffect, useRef, useCallback } from "react";

const FT_TO_M = 0.3048;
const MI_TO_M = 1609.344;
const ION_ASSET_ID = 2275207; // Your high-res Cesium Ion imagery asset

function lonDegPerMeter(lat) {
  return 1 / (111320 * Math.cos(lat * Math.PI / 180));
}
function latDegPerMeter() {
  return 1 / 110540;
}

function geojsonRingToCartesian(geometry, Cesium, heightM = 0.5) {
  if (!geometry || !geometry.type) return [];
  const rings = [];
  const processRing = (coords) => {
    rings.push(coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, heightM)));
  };
  if (geometry.type === "Polygon") geometry.coordinates.forEach(processRing);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach(poly => poly.forEach(processRing));
  else if (geometry.type === "Feature") return geojsonRingToCartesian(geometry.geometry, Cesium, heightM);
  else if (geometry.type === "FeatureCollection") geometry.features.forEach(f => geojsonRingToCartesian(f.geometry, Cesium, heightM).forEach(r => rings.push(r)));
  return rings;
}

export default function CesiumPhoto3DViewer({
  apiKey,       // Google Maps API key — optional; viewer still works without it
  ionToken,     // Cesium Ion token — passed in from Photo3DViewer
  lat,
  lon,
  params,
  treeMaturity,
  sitingGeojson,
  onReady,
  onError,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entitiesRef = useRef([]);

  // ─── Init Cesium viewer once ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !lat || !lon) return;

    const Cesium = window.Cesium;
    if (!Cesium) { onError?.("CesiumJS not loaded"); return; }

    // Set Ion token before anything else
    if (ionToken) {
      Cesium.Ion.defaultAccessToken = ionToken;
      window.__CESIUM_ION_TOKEN__ = ionToken;
    } else if (window.__CESIUM_ION_TOKEN__) {
      Cesium.Ion.defaultAccessToken = window.__CESIUM_ION_TOKEN__;
    }

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

    // ── Load base imagery — try in priority order ─────────────────────────────
    (async () => {
      let baseLoaded = false;

      // 1. Google Photorealistic 3D Tiles
      if (apiKey) {
        try {
          const tilesetUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
          let tileset;
          if (typeof Cesium.Cesium3DTileset.fromUrl === "function") {
            tileset = await Cesium.Cesium3DTileset.fromUrl(tilesetUrl, { showCreditsOnScreen: true });
          } else {
            tileset = new Cesium.Cesium3DTileset({ url: tilesetUrl, showCreditsOnScreen: true });
          }
          viewer.scene.primitives.add(tileset);
          baseLoaded = true;
          console.log("[CesiumViewer] Google Photorealistic 3D Tiles loaded ✓");
        } catch (e) {
          console.warn("[CesiumViewer] Google 3D Tiles failed:", e.message);
          onError?.(`Google 3D Tiles unavailable — using Cesium Ion imagery`);
        }
      }

      // 2. Cesium Ion asset 2275207 (your high-res aerial)
      if (!baseLoaded && Cesium.Ion.defaultAccessToken) {
        try {
          const imagery = await Cesium.IonImageryProvider.fromAssetId(ION_ASSET_ID);
          viewer.imageryLayers.addImageryProvider(imagery);

          // Add Cesium World Terrain for 3D elevation
          try {
            const terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(1);
            viewer.terrainProvider = terrain;
          } catch { /* terrain is optional */ }

          baseLoaded = true;
          console.log(`[CesiumViewer] Cesium Ion asset ${ION_ASSET_ID} loaded ✓`);
        } catch (e) {
          console.warn(`[CesiumViewer] Ion asset ${ION_ASSET_ID} failed:`, e.message);
          onError?.(`Ion asset ${ION_ASSET_ID} unavailable — check your Cesium Ion token and asset access`);
        }
      }

      // 3. Last resort — Bing aerial via Ion asset 2 (always available)
      if (!baseLoaded) {
        try {
          viewer.imageryLayers.addImageryProvider(
            new Cesium.IonImageryProvider({ assetId: 2 })
          );
          console.log("[CesiumViewer] Fallback Bing imagery loaded");
        } catch { /* truly nothing available */ }
      }

      onReady?.();
    })();

    return () => {
      try { viewer.destroy(); } catch { }
      viewerRef.current = null;
      window.__cesiumViewer__ = null;
    };
  }, [apiKey, ionToken, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draw / redraw scene entities ──────────────────────────────────────────
  const redrawScene = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !lat || !lon) return;
    const Cesium = window.Cesium;
    if (!Cesium) return;

    entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch { } });
    entitiesRef.current = [];

    const heightFt = params.heightFt || 199;
    const heightM = heightFt * FT_TO_M;
    const compoundWM = (params.compoundW || 100) * FT_TO_M;
    const compoundDM = (params.compoundD || 100) * FT_TO_M;
    const towerType = params.towerType || "monopole";
    const bufferM = (params.bufferFt || 0) * FT_TO_M;
    const treeH = treeMaturity === "mature" ? 25 * FT_TO_M : 8 * FT_TO_M;
    const lonDeg = lonDegPerMeter(lat);
    const latDeg = latDegPerMeter();

    const add = (e) => { entitiesRef.current.push(e); return e; };

    // ── 1. GeoJSON siting overlays ─────────────────────────────────────────────
    if (params.showOverlays !== false && sitingGeojson) {
      if (sitingGeojson.parcelBoundary) {
        geojsonRingToCartesian(sitingGeojson.parcelBoundary, Cesium, 0.5).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: { positions: [...positions, positions[0]], width: 2.5, material: Cesium.Color.fromCssColorString("#00e5ff"), clampToGround: false },
          }));
        });
      }
      if (sitingGeojson.candidateArea) {
        geojsonRingToCartesian(sitingGeojson.candidateArea, Cesium, 0.8).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: { positions: [...positions, positions[0]], width: 2, material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString("#00ff88bb"), dashLength: 8 }), clampToGround: false },
          }));
        });
      }
      if (sitingGeojson.compoundGeojson) {
        geojsonRingToCartesian(sitingGeojson.compoundGeojson, Cesium, 0.3).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polygon: { hierarchy: new Cesium.PolygonHierarchy(positions), height: 0.3, material: Cesium.Color.fromCssColorString("#334455cc"), outline: true, outlineColor: Cesium.Color.fromCssColorString("#aaccff"), outlineWidth: 2 },
          }));
        });
      }
      if (sitingGeojson.fallZone) {
        geojsonRingToCartesian(sitingGeojson.fallZone, Cesium, 0.6).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: { positions: [...positions, positions[0]], width: 2, material: Cesium.Color.fromCssColorString("#ff6600cc"), clampToGround: false },
          }));
        });
      }
      if (sitingGeojson.conflictLayers) {
        const features = sitingGeojson.conflictLayers?.type === "FeatureCollection"
          ? sitingGeojson.conflictLayers.features : [sitingGeojson.conflictLayers];
        features.forEach(feat => {
          geojsonRingToCartesian(feat?.geometry || feat, Cesium, 0.7).forEach(positions => {
            if (positions.length < 3) return;
            add(viewer.entities.add({
              polyline: { positions: [...positions, positions[0]], width: 1.5, material: Cesium.Color.fromCssColorString("#ff2244aa"), clampToGround: false },
            }));
          });
        });
      }
    }

    // ── 2. Tower shaft ─────────────────────────────────────────────────────────
    const bottomRadius = towerType === "self_support" ? 1.5 : towerType === "guyed" ? 0.6 : 0.4;
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM / 2),
      cylinder: { length: heightM, topRadius: 0.3, bottomRadius, material: Cesium.Color.fromCssColorString("#7a8899") },
    }));

    // Sector antennas at top
    for (let i = 0; i < 3; i++) {
      const angle = (i * 120) * Math.PI / 180;
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * 1.2 * lonDeg, lat + Math.sin(angle) * 1.2 * latDeg, heightM - 1),
        box: { dimensions: new Cesium.Cartesian3(0.3, 0.15, 2.5), material: Cesium.Color.fromCssColorString("#cccccc") },
      }));
    }

    // Self-support legs
    if (towerType === "self_support") {
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        add(viewer.entities.add({
          polyline: {
            positions: [Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * 1.5 * lonDeg, lat + Math.sin(angle) * 1.5 * latDeg, 0), Cesium.Cartesian3.fromDegrees(lon, lat, heightM)],
            width: 2, material: Cesium.Color.fromCssColorString("#8899aa"),
          },
        }));
      }
    }

    // Guyed wires
    if (towerType === "guyed") {
      const guyR = heightM * 0.7;
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        add(viewer.entities.add({
          polyline: {
            positions: [Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * guyR * lonDeg, lat + Math.sin(angle) * guyR * latDeg, 0), Cesium.Cartesian3.fromDegrees(lon, lat, heightM * 0.8)],
            width: 1, material: Cesium.Color.fromCssColorString("#aaaaaa80"),
          },
        }));
      }
    }

    if (params.showMicrowave) {
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM - 8),
        ellipsoid: { radii: new Cesium.Cartesian3(1.2, 1.2, 0.2), material: Cesium.Color.fromCssColorString("#dddddd") },
      }));
    }

    // ── 3. Compound ────────────────────────────────────────────────────────────
    // Always draw parametric compound (GeoJSON overlay is additive, not replacing)
    const halfWLon = (compoundWM / 2) * lonDeg;
    const halfDLat = (compoundDM / 2) * latDeg;

    add(viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(lon - halfWLon, lat - halfDLat, lon + halfWLon, lat + halfDLat),
        height: 0.1, material: Cesium.Color.fromCssColorString("#334455cc"),
        outline: true, outlineColor: Cesium.Color.fromCssColorString("#aaccff"), outlineWidth: 1.5,
      },
    }));

    // Equipment shelter (inside compound)
    const shelterLon = lon + halfWLon * 0.5;
    const shelterLat = lat - halfDLat * 0.5;
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 2),
      box: { dimensions: new Cesium.Cartesian3(10 * FT_TO_M, 12 * FT_TO_M, 4 * FT_TO_M), material: Cesium.Color.fromCssColorString("#778899") },
    }));

    if (params.showGenerator) {
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon - halfWLon * 0.5, lat - halfDLat * 0.5, 0.5),
        box: { dimensions: new Cesium.Cartesian3(2, 1, 1.5), material: Cesium.Color.fromCssColorString("#556677") },
      }));
    }

    if (params.showIceBridge) {
      add(viewer.entities.add({
        polyline: {
          positions: [Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 3.5), Cesium.Cartesian3.fromDegrees(lon, lat, 3.5)],
          width: 3, material: Cesium.Color.fromCssColorString("#aabbcc"),
        },
      }));
    }

    // Fence
    const fenceCorners = [
      [lon - halfWLon, lat - halfDLat], [lon + halfWLon, lat - halfDLat],
      [lon + halfWLon, lat + halfDLat], [lon - halfWLon, lat + halfDLat],
      [lon - halfWLon, lat - halfDLat],
    ];
    add(viewer.entities.add({
      polyline: {
        positions: fenceCorners.map(([flon, flat]) => Cesium.Cartesian3.fromDegrees(flon, flat, 2.4)),
        width: 2, material: Cesium.Color.fromCssColorString("#aaaaaa99"),
      },
    }));

    // ── 4. Landscape tree buffer ───────────────────────────────────────────────
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
            semiMajorAxis: rm, semiMinorAxis: rm, height: 1,
            material: Cesium.Color.TRANSPARENT, outline: true,
            outlineColor: Cesium.Color.fromCssColorString(color), outlineWidth: 2,
          },
        }));
      });
    }
  }, [params, treeMaturity, lat, lon, sitingGeojson]);

  useEffect(() => { redrawScene(); }, [redrawScene]);

  // ─── Initial hero camera ───────────────────────────────────────────────────
  useEffect(() => {
    if (!viewerRef.current || !lat || !lon) return;
    const Cesium = window.Cesium;
    if (!Cesium) return;
    const heightM = (params.heightFt || 199) * FT_TO_M;
    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon - 0.002, lat - 0.002, heightM * 2.5),
      orientation: { heading: Cesium.Math.toRadians(45), pitch: Cesium.Math.toRadians(-25), roll: 0 },
      duration: 2,
    });
  }, [lat, lon, params.heightFt]);

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: 500 }} />
  );
}