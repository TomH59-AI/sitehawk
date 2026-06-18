/**
 * ThreeTower3DViewer — lightweight Three.js tower concept viewer.
 * Replaces the heavy Cesium viewer. No globe engine, no external tokens.
 * Shows the tower, compound footprint, and parcel boundary in 3D.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { X, Camera, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const FT_TO_M = 0.3048;

export default function ThreeTower3DViewer({ render, onClose, onSnapshot }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const animFrameRef = useRef(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const spherical = useRef({ theta: Math.PI / 4, phi: Math.PI / 3, radius: 120 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !render) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1f2e);
    scene.fog = new THREE.Fog(0x1a1f2e, 200, 600);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 1000);
    updateCamera(camera);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff8e1, 1.2);
    sun.position.set(80, 120, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2d4a1e });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(400, 40, 0x3a5c2a, 0x3a5c2a);
    grid.position.y = 0.05;
    scene.add(grid);

    const towerH = (render.tower_height_ft || 199) * FT_TO_M;
    const cw = (render.compound_width_ft || 75) * FT_TO_M;
    const cd = (render.compound_depth_ft || 75) * FT_TO_M;

    // Compound fence (outline box)
    buildCompound(scene, cw, cd);

    // Tower
    buildTower(scene, towerH, render.tower_type || "monopole");

    // Parcel boundary (if available)
    if (render.parcel_geojson) {
      buildParcelOutline(scene, render.parcel_geojson, render.centroid_lat, render.centroid_lon);
    }

    // Animate
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      updateCamera(camera);
      renderer.render(scene, camera);
    }
    animate();

    // Mouse drag rotation
    function onMouseDown(e) { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; }
    function onMouseUp() { isDragging.current = false; }
    function onMouseMove(e) {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      spherical.current.theta -= dx * 0.005;
      spherical.current.phi = Math.max(0.2, Math.min(Math.PI / 2 - 0.05, spherical.current.phi - dy * 0.005));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
    function onWheel(e) {
      spherical.current.radius = Math.max(40, Math.min(300, spherical.current.radius + e.deltaY * 0.1));
    }

    mount.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    mount.addEventListener("wheel", onWheel, { passive: true });

    // Resize
    function onResize() {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      mount.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      mount.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [render]);

  function updateCamera(camera) {
    const { theta, phi, radius } = spherical.current;
    camera.position.set(
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(0, (render?.tower_height_ft || 199) * FT_TO_M * 0.35, 0);
  }

  function resetView() {
    spherical.current = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 120 };
  }

  async function captureSnapshot() {
    if (!rendererRef.current || !render?.id) return;
    setSaving(true);
    try {
      const dataUrl = rendererRef.current.domElement.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "tower-3d-snapshot.png", { type: "image/png" });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Tower3DRender.update(render.id, { snapshot_image_url: file_url });
      if (onSnapshot) onSnapshot({ file_url });
    } catch (e) {
      console.error("Snapshot failed:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-700">
        <div className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="text-indigo-400">⬡</span>
          3D Tower Concept
          <span className="text-xs text-slate-400 font-normal ml-2">
            {render?.tower_height_ft} ft · {render?.compound_width_ft}×{render?.compound_depth_ft} ft compound · {render?.tower_type}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="text-slate-300 hover:text-white gap-1.5" onClick={resetView}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
            onClick={captureSnapshot}
            disabled={saving}
          >
            <Camera className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Capture Frame"}
          </Button>
          <Button size="icon" variant="ghost" className="text-slate-300 hover:text-white" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 3D canvas */}
      <div ref={mountRef} className="flex-1 w-full cursor-grab active:cursor-grabbing" />

      {/* Instructions */}
      <div className="text-center text-xs text-slate-500 py-1.5 bg-slate-900/80">
        Drag to orbit · Scroll to zoom · ILLUSTRATIVE ONLY — not a survey
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildTower(scene, heightM, type) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xcccccc });

  if (type === "monopole" || type === "stealth") {
    // Tapered monopole shaft
    const geo = new THREE.CylinderGeometry(0.3, 0.7, heightM, 8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = heightM / 2;
    mesh.castShadow = true;
    scene.add(mesh);
    // Top cap
    const capGeo = new THREE.CylinderGeometry(0.15, 0.3, 2, 8);
    const cap = new THREE.Mesh(capGeo, new THREE.MeshLambertMaterial({ color: 0xff4444 }));
    cap.position.y = heightM + 1;
    scene.add(cap);
  } else {
    // Lattice — 4 legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });
    const spread = 2.5;
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      const geo = new THREE.CylinderGeometry(0.15, 0.25, heightM, 6);
      const mesh = new THREE.Mesh(geo, legMat);
      mesh.position.set(sx * spread * 0.5, heightM / 2, sz * spread * 0.5);
      mesh.castShadow = true;
      scene.add(mesh);
    });
    // Cross braces every 10m
    const braceMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
    for (let y = 5; y < heightM; y += 10) {
      const bGeo = new THREE.CylinderGeometry(0.07, 0.07, spread * Math.sqrt(2), 4);
      const b = new THREE.Mesh(bGeo, braceMat);
      b.position.set(0, y, 0);
      b.rotation.z = Math.PI / 4;
      scene.add(b);
    }
  }
}

function buildCompound(scene, cw, cd) {
  const fenceH = 2.5;
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

  // Gravel pad
  const padGeo = new THREE.BoxGeometry(cw, 0.2, cd);
  const pad = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({ color: 0x8b7355 }));
  pad.position.y = 0.1;
  scene.add(pad);

  // 4 fence walls
  const walls = [
    { pos: [0, fenceH / 2, cd / 2], rot: [0, 0, 0], w: cw, h: fenceH, d: 0.3 },
    { pos: [0, fenceH / 2, -cd / 2], rot: [0, 0, 0], w: cw, h: fenceH, d: 0.3 },
    { pos: [cw / 2, fenceH / 2, 0], rot: [0, Math.PI / 2, 0], w: cd, h: fenceH, d: 0.3 },
    { pos: [-cw / 2, fenceH / 2, 0], rot: [0, Math.PI / 2, 0], w: cd, h: fenceH, d: 0.3 },
  ];
  walls.forEach(({ pos, rot, w, h, d }) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, fenceMat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    scene.add(mesh);
  });

  // Equipment shelter
  const shelterGeo = new THREE.BoxGeometry(4, 3, 6);
  const shelter = new THREE.Mesh(shelterGeo, new THREE.MeshLambertMaterial({ color: 0x607090 }));
  shelter.position.set(-cw / 2 + 4, 1.5, 0);
  shelter.castShadow = true;
  scene.add(shelter);
}

function buildParcelOutline(scene, geojson, centerLat, centerLon) {
  try {
    const g = geojson?.type === "Feature" ? geojson.geometry : geojson;
    if (!g || g.type !== "Polygon") return;

    const DEG_TO_M_LAT = 111320;
    const DEG_TO_M_LON = 111320 * Math.cos((centerLat * Math.PI) / 180);

    const ring = g.coordinates[0];
    const points = ring.map(([lon, lat]) => new THREE.Vector3(
      (lon - centerLon) * DEG_TO_M_LON,
      0.3,
      -(lat - centerLat) * DEG_TO_M_LAT
    ));

    const mat = new THREE.LineBasicMaterial({ color: 0xffdd44, linewidth: 2 });
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    scene.add(new THREE.Line(geo, mat));
  } catch { /* non-critical */ }
}