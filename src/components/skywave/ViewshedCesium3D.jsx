import { useEffect, useRef, useState } from "react";
import { loadCesium } from "@/lib/cesiumLoader";
import { viewshed3DConfig } from "@/functions/viewshed3DConfig";
import { Loader2 } from "lucide-react";

const FT_TO_M = 0.3048;
const MILES_TO_M = 1609.34;

// Interactive 3D viewshed globe for Target A. Renders Google photorealistic 3D
// tiles (falls back to world terrain if unavailable), the radius ring, a tower
// marker, and one line-of-sight ray per cardinal direction colored to match the
// 2D maps. Reads coordinates + directions straight from the stored viewshed
// object — it never mutates the viewshed data.
export default function ViewshedCesium3D({ viewshed }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dirs = viewshed?.directions || [];
  const ringMiles = Number(viewshed?.ring_miles) || 0.25;
  const towerHeightFt = Number(viewshed?.tower_height_ft) || 199;

  // Center point: prefer explicit tower coords on the viewshed, else derive from
  // the first direction's profile origin if present.
  const lat = Number(viewshed?.tower_lat ?? viewshed?.center_lat ?? viewshed?.lat);
  const lon = Number(viewshed?.tower_lon ?? viewshed?.center_lon ?? viewshed?.lon);
  const hasCenter = Number.isFinite(lat) && Number.isFinite(lon);

  useEffect(() => {
    if (!hasCenter) { setError("This viewshed has no stored tower coordinates for the 3D view."); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await viewshed3DConfig({});
        if (cancelled) return;
        const ionToken = data?.tokens?.cesiumIonToken || "";
        const googleKey = data?.tokens?.googleTilesKey || "";
        await loadCesium(ionToken);
        if (cancelled || !containerRef.current) return;
        const Cesium = window.Cesium;

        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
          homeButton: false, sceneModePicker: false, navigationHelpButton: false,
          fullscreenButton: true, infoBox: false, selectionIndicator: false,
        });
        viewer.scene.globe.enableLighting = true;
        viewerRef.current = viewer;

        // Photorealistic Google 3D tiles when a key is available; terrain fallback otherwise.
        if (googleKey) {
          try {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(
              `https://tile.googleapis.com/v1/3dtiles/root.json?key=${googleKey}`,
              { showCreditsOnScreen: true }
            );
            if (!cancelled) viewer.scene.primitives.add(tileset);
          } catch {
            if (ionToken) viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
          }
        } else if (ionToken) {
          viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
        }

        const towerBaseM = towerHeightFt * FT_TO_M;

        // Radius ring on the ground
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          ellipse: {
            semiMinorAxis: ringMiles * MILES_TO_M,
            semiMajorAxis: ringMiles * MILES_TO_M,
            material: Cesium.Color.CYAN.withAlpha(0.12),
            outline: true, outlineColor: Cesium.Color.CYAN.withAlpha(0.8), outlineWidth: 2,
            height: 0, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });

        // Tower marker (vertical line + top point)
        viewer.entities.add({
          name: "Tower",
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([lon, lat, 0, lon, lat, towerBaseM]),
            width: 4, material: Cesium.Color.RED,
            clampToGround: false,
          },
        });
        viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, towerBaseM),
          point: { pixelSize: 10, color: Cesium.Color.RED, outlineColor: Cesium.Color.WHITE, outlineWidth: 2 },
          label: {
            text: `${Math.round(towerHeightFt)} ft`, font: "12px sans-serif",
            fillColor: Cesium.Color.WHITE, showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString("#0f172a").withAlpha(0.75),
            pixelOffset: new Cesium.Cartesian2(0, -18),
          },
        });

        // One LOS ray per cardinal direction from the tower top out to the ring edge.
        dirs.forEach((d) => {
          const bearing = Number(d.bearing) || 0;
          const rad = (bearing * Math.PI) / 180;
          const dm = ringMiles * MILES_TO_M;
          const dLat = (dm * Math.cos(rad)) / 111320;
          const dLon = (dm * Math.sin(rad)) / (111320 * Math.cos((lat * Math.PI) / 180));
          const endLat = lat + dLat;
          const endLon = lon + dLon;
          const color = Cesium.Color.fromCssColorString(d.color || "#38bdf8");
          viewer.entities.add({
            name: d.label,
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArrayHeights([lon, lat, towerBaseM, endLon, endLat, towerBaseM]),
              width: 3,
              material: d.clear
                ? color
                : new Cesium.PolylineDashMaterialProperty({ color }),
            },
          });
        });

        // Fly to a pitched oblique view of the site.
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.006, 900),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-35), roll: 0 },
          duration: 0,
        });

        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e?.message || "Failed to load the 3D viewshed."); setLoading(false); }
      }
    })();

    return () => {
      cancelled = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height: 520, background: "#0a0e17" }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-white text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Building 3D terrain…
        </div>
      )}
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}