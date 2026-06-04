import { useState, useEffect } from "react";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointToLineDistance from "@turf/point-to-line-distance";
import polygonToLine from "@turf/polygon-to-line";
import { featureEach } from "@turf/meta";
import { point } from "@turf/helpers";
import { HC } from "./complianceConst";

// THPO / Tribal Screening — tests whether Target A falls on tribal land and,
// if not, the crow-flies distance to the nearest tribal boundary.
// targetCoords MUST be [longitude, latitude]. tribalGeoJSON is a FeatureCollection
// of tribal-land polygons/multipolygons.
export default function TribalScreening({ targetCoords, tribalGeoJSON }) {
  const [isOnTribalLand, setIsOnTribalLand] = useState(false);
  const [distanceToNearest, setDistanceToNearest] = useState(null);

  useEffect(() => {
    // Safety check: ensure we have both Target A coordinates and the map data
    if (!targetCoords || !tribalGeoJSON) return;

    // Turf expects coordinates in [longitude, latitude] order!
    const targetPoint = point(targetCoords);

    let isInside = false;
    let minDist = Infinity;

    featureEach(tribalGeoJSON, (currentFeature) => {
      // 1. The "Are we ON it?" test
      if (booleanPointInPolygon(targetPoint, currentFeature)) {
        isInside = true;
      }

      // 2. The "How far away?" test — convert the polygon to line strings and
      //    measure distance to the nearest edge.
      if (!isInside) {
        try {
          const polygonLines = polygonToLine(currentFeature);
          const lines =
            polygonLines.type === "FeatureCollection"
              ? polygonLines.features
              : [polygonLines];

          lines.forEach((line) => {
            const dist = pointToLineDistance(targetPoint, line, { units: "miles" });
            if (dist < minDist) minDist = dist;
          });
        } catch (error) {
          console.warn("Could not calculate distance for a polygon feature", error);
        }
      }
    });

    setIsOnTribalLand(isInside);
    setDistanceToNearest(isInside ? 0 : minDist.toFixed(2));
  }, [targetCoords, tribalGeoJSON]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-heading font-semibold mb-3 flex items-center gap-2">
        🪶 THPO / Tribal Screening
      </h3>

      {!targetCoords || !tribalGeoJSON ? (
        <p className="text-sm text-muted-foreground">
          Target A coordinates or tribal-land dataset not available yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div
            className="p-3 rounded-lg font-semibold text-sm"
            style={
              isOnTribalLand
                ? { background: "rgba(220,38,38,0.1)", color: "#b91c1c" }
                : { background: "rgba(98,140,131,0.12)", color: HC.green }
            }
          >
            Status: {isOnTribalLand ? "🚨 ON TRIBAL LAND" : "✅ Clear of Physical Tribal Lands"}
          </div>

          {!isOnTribalLand && distanceToNearest !== null && (
            <div className="text-sm text-muted-foreground">
              <strong className="text-foreground">Distance to nearest tribal boundary:</strong>{" "}
              {distanceToNearest} miles
            </div>
          )}
        </div>
      )}
    </div>
  );
}