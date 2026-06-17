/**
 * TowerSeparationLayer — fetches nearby FCC ASR / OpenCellID towers,
 * runs the tower-separation check, and returns structured data for
 * the map and ComplianceChips.
 *
 * This is a data + logic component (no map rendering — caller draws the GeoJSON).
 */
import { useState, useCallback } from "react";
import { circle as turfCircle } from "@turf/turf";
import { toast } from "sonner";
import { towerSiterNearbyTowers } from "@/functions/towerSiterNearbyTowers";

const DEFAULT_RADIUS_MI = 2;

/**
 * Hook: useTowerSeparation
 *
 * Returns { fetchTowers, towerData, separationCheck, loading, reset }
 *
 * towerData: { towers: [...], buffers: GeoJSON FeatureCollection }
 * separationCheck: { status, nearest_distance_ft, nearest_distance_mi, message }
 */
export function useTowerSeparation() {
  const [loading, setLoading] = useState(false);
  const [towerData, setTowerData] = useState(null);
  const [separationCheck, setSeparationCheck] = useState(null);

  const fetchTowers = useCallback(async (lat, lon, separationFt, radiusMiles = DEFAULT_RADIUS_MI) => {
    if (!lat || !lon) return;
    setLoading(true);
    try {
      const { data } = await towerSiterNearbyTowers({ lat, lon, radius_miles: radiusMiles });
      const towers = data?.towers || [];

      // Build separation buffer circles for each tower
      const bufferFeatures = towers.map((t) => ({
        type: "Feature",
        properties: { owner: t.owner, source: t.source, height_ft: t.height_ft, distance_miles: t.distance_miles },
        geometry: separationFt
          ? turfCircle([t.longitude, t.latitude], separationFt, { units: "feet", steps: 48 }).geometry
          : null,
      })).filter((f) => f.geometry);

      const buffers = {
        type: "FeatureCollection",
        features: bufferFeatures,
      };

      // Tower points for plotting
      const towerPoints = {
        type: "FeatureCollection",
        features: towers.map((t) => ({
          type: "Feature",
          properties: { owner: t.owner, source: t.source, structure_type: t.structure_type, height_ft: t.height_ft, distance_miles: t.distance_miles },
          geometry: { type: "Point", coordinates: [t.longitude, t.latitude] },
        })),
      };

      setTowerData({ towers, buffers, towerPoints });

      // Separation check
      if (!separationFt || towers.length === 0) {
        setSeparationCheck({ status: "skip", message: separationFt ? "No nearby towers found" : "No tower separation rule on file" });
      } else {
        const nearestMi = towers[0].distance_miles;
        const nearestFt = Math.round(nearestMi * 5280);
        const passes = nearestFt >= separationFt;
        setSeparationCheck({
          status: passes ? "pass" : "fail",
          nearest_distance_ft: nearestFt,
          nearest_distance_mi: nearestMi,
          required_ft: separationFt,
          message: passes
            ? `Nearest tower ${nearestFt.toLocaleString()}′ away (≥ ${separationFt.toLocaleString()}′ required)`
            : `Nearest tower ${nearestFt.toLocaleString()}′ away — ${separationFt.toLocaleString()}′ separation required`,
        });
      }
    } catch (e) {
      console.error("useTowerSeparation error:", e);
      toast.error("Could not load nearby towers.");
      setSeparationCheck({ status: "skip", message: "Tower lookup unavailable" });
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setTowerData(null);
    setSeparationCheck(null);
  }, []);

  return { fetchTowers, towerData, separationCheck, loading, reset };
}

export default useTowerSeparation;