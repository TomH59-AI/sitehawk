/**
 * CesiumPhoto3DViewer — Photorealistic 3D Tower Siting Exhibit viewer.
 *
 * Base layer priority:
 *   1. Google Photorealistic 3D Tiles (if apiKey provided)
 *   2. Cesium Ion asset 2275207 (high-res aerial imagery) — fallback
 *   3. Bing aerial via Ion asset 2 — last resort
 *
 * All geometry layers are labeled with floating billboards so the viewer
 * reads as a self-contained lease-closer exhibit.
 */
import { useEffect, useRef, useCallback } from "react";

const FT_TO_M = 0.3048;
const MI_TO_M = 1609.344;
const ION_ASSET_ID = 2275207;

function lonDegPerMeter(lat) { return 1 / (111320 * Math.cos(lat * Math.PI / 180)); }
function latDegPerMeter() { return 1 / 110540; }

/** Unwrap any GeoJSON wrapper and return rings of Cartesian3 arrays */
function geojsonRingToCartesian(geometry, Cesium, heightM = 0.5) {
  if (!geometry || !geometry.type) return [];
  const rings = [];
  const processRing = (coords) => {
    rings.push(coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, heightM)));
  };
  if (geometry.type === "Polygon") geometry.coordinates.forEach(processRing);
  else if (geometry.type === "MultiPolygon") geometry.coordinates.forEach(poly => poly.forEach(processRing));
  else if (geometry.type === "Feature") return geojsonRingToCartesian(geometry.geometry, Cesium, heightM);
  else if (geometry.type === "FeatureCollection") geometry.features.forEach(f =>
    geojsonRingToCartesian(f.geometry, Cesium, heightM).forEach(r => rings.push(r))
  );
  return rings;
}

/** Compute centroid of a GeoJSON ring (first ring of first polygon) */
function ringCentroid(geometry) {
  try {
    const g = geometry?.type === "Feature" ? geometry.geometry : geometry;
    if (!g) return null;
    let ring;
    if (g.type === "Polygon") ring = g.coordinates[0];
    else if (g.type === "MultiPolygon") ring = g.coordinates[0][0];
    else return null;
    const sumLon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const sumLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return [sumLon, sumLat];
  } catch { return null; }
}

/** Create a text canvas for a billboard label */
function makeLabelCanvas(text, bgColor = "rgba(0,0,0,0.72)", textColor = "#ffffff", fontSize = 13) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `bold ${fontSize}px sans-serif`;
  const w = ctx.measureText(text).width + 20;
  const h = fontSize + 14;
  canvas.width = w;
  canvas.height = h;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = bgColor;
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.fillText(text, 10, fontSize + 2);
  return canvas;
}

export default function CesiumPhoto3DViewer({
  apiKey,
  ionToken,
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

  // ─── Init Cesium viewer once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !lat || !lon) return;
    const Cesium = window.Cesium;
    if (!Cesium) { onError?.("CesiumJS not loaded"); return; }

    if (ionToken) { Cesium.Ion.defaultAccessToken = ionToken; window.__CESIUM_ION_TOKEN__ = ionToken; }
    else if (window.__CESIUM_ION_TOKEN__) { Cesium.Ion.defaultAccessToken = window.__CESIUM_ION_TOKEN__; }

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      infoBox: false, selectionIndicator: false,
      creditContainer: document.createElement("div"),
      creditViewport: containerRef.current,
    });

    viewer.imageryLayers.removeAll();
    viewerRef.current = viewer;
    window.__cesiumViewer__ = viewer;

    (async () => {
      let baseLoaded = false;

      if (apiKey) {
        try {
          const tilesetUrl = `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`;
          const tileset = typeof Cesium.Cesium3DTileset.fromUrl === "function"
            ? await Cesium.Cesium3DTileset.fromUrl(tilesetUrl, { showCreditsOnScreen: true })
            : new Cesium.Cesium3DTileset({ url: tilesetUrl, showCreditsOnScreen: true });
          viewer.scene.primitives.add(tileset);
          baseLoaded = true;
        } catch (e) {
          console.warn("[CesiumViewer] Google 3D Tiles failed:", e.message);
          onError?.("Google 3D Tiles unavailable — using Cesium Ion imagery");
        }
      }

      if (!baseLoaded && Cesium.Ion.defaultAccessToken) {
        try {
          const imagery = await Cesium.IonImageryProvider.fromAssetId(ION_ASSET_ID);
          viewer.imageryLayers.addImageryProvider(imagery);
          try { viewer.terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1); } catch {}
          baseLoaded = true;
        } catch (e) {
          console.warn(`[CesiumViewer] Ion asset ${ION_ASSET_ID} failed:`, e.message);
          onError?.(`Ion asset ${ION_ASSET_ID} unavailable`);
        }
      }

      if (!baseLoaded) {
        try { viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 2 })); } catch {}
      }

      onReady?.();
    })();

    return () => {
      try { viewer.destroy(); } catch {}
      viewerRef.current = null;
      window.__cesiumViewer__ = null;
    };
  }, [apiKey, ionToken, lat, lon]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Draw / redraw labeled scene ─────────────────────────────────────────────
  const redrawScene = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !lat || !lon) return;
    const Cesium = window.Cesium;
    if (!Cesium) return;

    entitiesRef.current.forEach(e => { try { viewer.entities.remove(e); } catch {} });
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

    /** Add a floating label billboard at a lon/lat position */
    const addLabel = (labelText, labelLon, labelLat, altM, bgColor, textColor = "#ffffff") => {
      const canvas = makeLabelCanvas(labelText, bgColor, textColor);
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(labelLon, labelLat, altM),
        billboard: {
          image: canvas,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(50, 1.0, 2000, 0.5),
        },
      }));
    };

    // ── 1. GeoJSON siting overlays with labels ────────────────────────────────
    if (params.showOverlays !== false && sitingGeojson) {

      // Parcel boundary — cyan
      if (sitingGeojson.parcelBoundary) {
        geojsonRingToCartesian(sitingGeojson.parcelBoundary, Cesium, 0.5).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: { positions: [...positions, positions[0]], width: 2.5, material: Cesium.Color.fromCssColorString("#00e5ff"), clampToGround: false },
          }));
        });
        const c = ringCentroid(sitingGeojson.parcelBoundary);
        if (c) addLabel("Parcel Boundary", c[0], c[1], 4, "rgba(0,180,220,0.85)");
      }

      // Setback / buildable envelope — green dashed + label
      if (sitingGeojson.candidateArea) {
        geojsonRingToCartesian(sitingGeojson.candidateArea, Cesium, 1.5).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: {
              positions: [...positions, positions[0]], width: 2,
              material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString("#00ff88cc"), dashLength: 8 }),
            },
          }));
        });
        const c = ringCentroid(sitingGeojson.candidateArea);
        if (c) addLabel(`Buildable Envelope (${params.setbackFt ? params.setbackFt + "′ setback" : "setback applied"})`, c[0], c[1] + latDeg * 8, 5, "rgba(0,160,80,0.85)");
      }

      // Compound footprint — blue fill + label
      if (sitingGeojson.compoundGeojson) {
        geojsonRingToCartesian(sitingGeojson.compoundGeojson, Cesium, 0.3).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions), height: 0.3,
              material: Cesium.Color.fromCssColorString("#1a3a5500"),
              outline: true, outlineColor: Cesium.Color.fromCssColorString("#88bbff"), outlineWidth: 2,
            },
          }));
        });
        const c = ringCentroid(sitingGeojson.compoundGeojson);
        if (c) addLabel(`Compound  ${params.compoundW || 100}′ × ${params.compoundD || 100}′`, c[0], c[1], 3, "rgba(80,120,200,0.85)");
      }

      // Fall zone — orange ring + label
      if (sitingGeojson.fallZone) {
        geojsonRingToCartesian(sitingGeojson.fallZone, Cesium, 1.0).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: { positions: [...positions, positions[0]], width: 2.5, material: Cesium.Color.fromCssColorString("#ff6600dd") },
          }));
        });
        // Place label at the northernmost point of the ring
        const g = sitingGeojson.fallZone?.type === "Feature" ? sitingGeojson.fallZone.geometry : sitingGeojson.fallZone;
        const ring = g?.type === "Polygon" ? g.coordinates[0] : null;
        if (ring) {
          const north = ring.reduce((a, b) => b[1] > a[1] ? b : a);
          addLabel(`Fall Zone  ${heightFt}′`, north[0], north[1], 4, "rgba(200,80,0,0.88)");
        }
      }

      // Property setback band (separate from buildable area)
      if (sitingGeojson.propertySetback) {
        geojsonRingToCartesian(sitingGeojson.propertySetback, Cesium, 0.4).forEach(positions => {
          if (positions.length < 3) return;
          add(viewer.entities.add({
            polyline: {
              positions: [...positions, positions[0]], width: 1.5,
              material: new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString("#ffdd00aa"), dashLength: 6 }),
            },
          }));
        });
      }

      // Conflict / exclusion layers — red
      if (sitingGeojson.conflictLayers) {
        const features = sitingGeojson.conflictLayers?.type === "FeatureCollection"
          ? sitingGeojson.conflictLayers.features : [sitingGeojson.conflictLayers];
        features.forEach(feat => {
          geojsonRingToCartesian(feat?.geometry || feat, Cesium, 0.7).forEach(positions => {
            if (positions.length < 3) return;
            add(viewer.entities.add({
              polyline: { positions: [...positions, positions[0]], width: 1.5, material: Cesium.Color.fromCssColorString("#ff2244bb") },
            }));
          });
        });
      }
    }

    // ── 2. Tower shaft ────────────────────────────────────────────────────────
    const bottomRadius = towerType === "self_support" ? 1.5 : towerType === "guyed" ? 0.6 : 0.4;
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, heightM / 2),
      cylinder: { length: heightM, topRadius: 0.3, bottomRadius, material: Cesium.Color.fromCssColorString("#8899aa") },
    }));

    // Sector antennas
    for (let i = 0; i < 3; i++) {
      const angle = (i * 120) * Math.PI / 180;
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * 1.2 * lonDeg, lat + Math.sin(angle) * 1.2 * latDeg, heightM - 1),
        box: { dimensions: new Cesium.Cartesian3(0.3, 0.15, 2.5), material: Cesium.Color.fromCssColorString("#cccccc") },
      }));
    }

    if (towerType === "self_support") {
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        add(viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * 1.5 * lonDeg, lat + Math.sin(angle) * 1.5 * latDeg, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
            ],
            width: 2, material: Cesium.Color.fromCssColorString("#8899aa"),
          },
        }));
      }
    }

    if (towerType === "guyed") {
      const guyR = heightM * 0.7;
      for (let i = 0; i < 3; i++) {
        const angle = (i * 120) * Math.PI / 180;
        add(viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromDegrees(lon + Math.cos(angle) * guyR * lonDeg, lat + Math.sin(angle) * guyR * latDeg, 0),
              Cesium.Cartesian3.fromDegrees(lon, lat, heightM * 0.8),
            ],
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

    // Tower apex label
    addLabel(
      `${towerType.charAt(0).toUpperCase() + towerType.slice(1)}  ${heightFt}′ AGL`,
      lon + lonDeg * 3, lat, heightM + 5,
      "rgba(30,30,50,0.88)", "#e0eaff"
    );

    // ── 3. Compound ───────────────────────────────────────────────────────────
    const halfWLon = (compoundWM / 2) * lonDeg;
    const halfDLat = (compoundDM / 2) * latDeg;

    add(viewer.entities.add({
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(lon - halfWLon, lat - halfDLat, lon + halfWLon, lat + halfDLat),
        height: 0.1, material: Cesium.Color.fromCssColorString("#1a344400"),
        outline: true, outlineColor: Cesium.Color.fromCssColorString("#aaccff"), outlineWidth: 1.5,
      },
    }));

    // Equipment shelter
    const shelterLon = lon + halfWLon * 0.5;
    const shelterLat = lat - halfDLat * 0.5;
    add(viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(shelterLon, shelterLat, 2),
      box: { dimensions: new Cesium.Cartesian3(10 * FT_TO_M, 12 * FT_TO_M, 4 * FT_TO_M), material: Cesium.Color.fromCssColorString("#778899") },
    }));
    addLabel("Equipment Shelter", shelterLon, shelterLat, 5.5, "rgba(60,80,110,0.85)");

    if (params.showGenerator) {
      add(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon - halfWLon * 0.5, lat - halfDLat * 0.5, 0.5),
        box: { dimensions: new Cesium.Cartesian3(2, 1, 1.5), material: Cesium.Color.fromCssColorString("#556677") },
      }));
      addLabel("Generator", lon - halfWLon * 0.5, lat - halfDLat * 0.5, 3.5, "rgba(50,70,100,0.8)");
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
    // Compound access label at the bottom fence edge
    addLabel(`Security Compound  ${params.compoundW || 100}′ × ${params.compoundD || 100}′`, lon, lat - halfDLat - latDeg * 4, 2, "rgba(80,120,200,0.85)");

    // ── 4. Landscape tree buffer ──────────────────────────────────────────────
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
      addLabel(
        `Landscape Buffer  ${params.bufferFt}′ (${treeMaturity === "mature" ? "5-yr maturity" : "initial planting"})`,
        lon + (compoundWM / 2 + bufferM + 2) * lonDeg, lat, treeH + 2,
        "rgba(30,80,30,0.85)", "#a8f0a8"
      );
    }

    // ── 5. RF radii with labeled rings ────────────────────────────────────────
    if (params.showRFRadii) {
      const rfRings = [
        { mi: 0.25, color: "#ff4444cc", label: "0.25 mi" },
        { mi: 0.5,  color: "#ff8800cc", label: "0.5 mi" },
        { mi: 1.0,  color: "#ffcc00cc", label: "1.0 mi RF" },
      ];
      rfRings.forEach(({ mi, color, label }) => {
        const rm = mi * MI_TO_M;
        add(viewer.entities.add({
          ellipse: {
            position: Cesium.Cartesian3.fromDegrees(lon, lat),
            semiMajorAxis: rm, semiMinorAxis: rm, height: 1,
            material: Cesium.Color.TRANSPARENT, outline: true,
            outlineColor: Cesium.Color.fromCssColorString(color), outlineWidth: 2,
          },
        }));
        // Label at the eastern edge of each ring
        addLabel(label, lon + rm * lonDeg, lat, 3, color.slice(0, 7) + "cc", "#fff8e0");
      });
    }
  }, [params, treeMaturity, lat, lon, sitingGeojson]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { redrawScene(); }, [redrawScene]);

  // ─── Initial hero camera ──────────────────────────────────────────────────────
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
  }, [lat, lon, params.heightFt]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: 500 }} />;
}