import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ringsToLocalFt } from "@/lib/talonfitExhibit";

const VERDICT_COLOR = { FITS: 0x22c55e, CONDITIONAL: 0xf59e0b, DOES_NOT_FIT: 0xef4444 };

// Interactive to-scale 3D site view: parcel + buildable envelope on the ground
// plane, monopole at real height at the TalonFit base location, fall-zone disc,
// equipment compound, orbit/zoom controls. Units are feet; origin = tower base.
export default function TalonFitSite3D({ parcel, envelope, compound, fallZone, towerLngLat, towerHeightFt, fallRadiusFt, verdict }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !parcel || !towerLngLat) return;
    const origin = towerLngLat;
    const H = Math.max(Number(towerHeightFt) || 199, 20);
    const FZ = Math.max(Number(fallRadiusFt) || H, 10);

    // lngLat → local ft → THREE ground plane (east → +x, north → -z)
    const toXZ = ([e, n]) => [e, -n];
    const parcelRings = ringsToLocalFt(parcel, origin).map((r) => r.map(toXZ));
    const envRings = envelope ? ringsToLocalFt(envelope, origin).map((r) => r.map(toXZ)) : [];
    const compRings = compound ? ringsToLocalFt(compound, origin).map((r) => r.map(toXZ)) : [];

    let span = 200;
    for (const [x, z] of parcelRings.flat()) span = Math.max(span, Math.abs(x) * 2.2, Math.abs(z) * 2.2);
    span = Math.max(span, FZ * 2.4);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1626);
    scene.fog = new THREE.Fog(0x0b1626, span * 1.5, span * 4);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 1, span * 8);
    camera.position.set(span * 0.55, Math.max(H * 1.3, span * 0.4), span * 0.55);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, H / 3, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 40;
    controls.maxDistance = span * 3;

    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x1a2a1a, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(span, span * 1.2, span * 0.5);
    scene.add(sun);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 6, span * 6),
      new THREE.MeshLambertMaterial({ color: 0x24331f })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const grid = new THREE.GridHelper(span * 4, 40, 0x33455c, 0x1c2b3f);
    grid.position.y = 0.2;
    scene.add(grid);

    const ringLine = (pts, color, y, dashed = false) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, y, z)));
      const mat = dashed
        ? new THREE.LineDashedMaterial({ color, dashSize: 10, gapSize: 6 })
        : new THREE.LineBasicMaterial({ color });
      const line = new THREE.LineLoop(geo, mat);
      if (dashed) line.computeLineDistances();
      scene.add(line);
    };

    // parcel boundary (white) + buildable envelope (dashed green)
    parcelRings.forEach((r) => ringLine(r, 0xffffff, 1.2));
    envRings.forEach((r) => ringLine(r, 0x22c55e, 1.0, true));

    // fall-zone disc + rim, tinted by verdict
    const vColor = VERDICT_COLOR[verdict] ?? VERDICT_COLOR.CONDITIONAL;
    const fzFill = new THREE.Mesh(
      new THREE.CircleGeometry(FZ, 96),
      new THREE.MeshBasicMaterial({ color: vColor, transparent: true, opacity: 0.13, side: THREE.DoubleSide })
    );
    fzFill.rotation.x = -Math.PI / 2;
    fzFill.position.y = 0.5;
    scene.add(fzFill);
    const fzRim = new THREE.Mesh(
      new THREE.RingGeometry(FZ - 1.5, FZ, 96),
      new THREE.MeshBasicMaterial({ color: vColor, side: THREE.DoubleSide })
    );
    fzRim.rotation.x = -Math.PI / 2;
    fzRim.position.y = 0.6;
    scene.add(fzRim);

    // equipment compound — translucent pad + edge fence line
    compRings.forEach((r) => {
      const shape = new THREE.Shape(r.map(([x, z]) => new THREE.Vector2(x, z)));
      const pad = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      pad.rotation.x = Math.PI / 2;
      pad.position.y = 0.8;
      scene.add(pad);
      ringLine(r, 0x93c5fd, 7); // 7-ft fence top line
      r.forEach(([x, z]) => {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 7, 6),
          new THREE.MeshLambertMaterial({ color: 0x9ca3af })
        );
        post.position.set(x, 3.5, z);
        scene.add(post);
      });
    });

    // monopole at real height + antenna array
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 3.4, H, 16),
      new THREE.MeshLambertMaterial({ color: 0xb8bec6 })
    );
    pole.position.y = H / 2;
    scene.add(pole);
    const array = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.5, 8, 12),
      new THREE.MeshLambertMaterial({ color: 0x6b7280 })
    );
    array.position.y = H - 4;
    scene.add(array);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    beacon.position.y = H + 1.5;
    scene.add(beacon);

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount.clientWidth) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [parcel, envelope, compound, fallZone, towerLngLat, towerHeightFt, fallRadiusFt, verdict]);

  return <div ref={mountRef} className="w-full h-full" />;
}