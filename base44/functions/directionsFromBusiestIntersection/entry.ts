/**
 * directionsFromBusiestIntersection
 *
 * Given a target lat/lon, finds the busiest road intersection within ~2 mi
 * (highest combined OSM highway-class score where two named roads cross),
 * then writes simple cardinal-direction turn-by-turn directions to the site.
 *
 * Returns:
 *   {
 *     intersection: "Main St & 1st Ave",
 *     intersection_lat, intersection_lon,
 *     distance_miles,
 *     directions_text: "From the intersection of Main St & 1st Ave:\n  1. Head SOUTH on Main St ...\n  ...\nGPS Coordinates: 27.964N, -82.452W (paste into any GPS / Google Maps)."
 *   }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OSM highway weight — higher = busier road
const HW_WEIGHT = {
  motorway: 10, trunk: 9, primary: 8, secondary: 6,
  tertiary: 4, residential: 1, unclassified: 1, service: 0,
};

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Bearing in degrees from (lat1,lon1) -> (lat2,lon2)
function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
          - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingToCardinal(deg) {
  const dirs = ["NORTH", "NORTHEAST", "EAST", "SOUTHEAST", "SOUTH", "SOUTHWEST", "WEST", "NORTHWEST"];
  return dirs[Math.round(deg / 45) % 8];
}

function formatDistance(miles) {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(2)} mi`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    // Bounding box ~2 mi (~0.03°)
    const D = 0.03;
    const bbox = `${lat - D},${lon - D},${lat + D},${lon + D}`;

    // Pull all named major roads in the bbox
    const overpassQ = `
      [out:json][timeout:25];
      (
        way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]["name"](${bbox});
      );
      out tags geom;
    `;

    const opRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(overpassQ),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!opRes.ok) throw new Error(`Overpass failed: ${opRes.status}`);
    const op = await opRes.json();
    const ways = op.elements || [];

    // Build nodeKey -> list of {wayName, weight} to find intersections.
    // We hash by rounded lat/lon (~1m precision) so geometries from different ways align.
    const nodeMap = new Map();
    for (const w of ways) {
      const name = w.tags?.name;
      const hw = w.tags?.highway;
      const weight = HW_WEIGHT[hw] || 0;
      if (!name || !w.geometry) continue;
      for (const g of w.geometry) {
        const key = `${g.lat.toFixed(5)},${g.lon.toFixed(5)}`;
        const arr = nodeMap.get(key) || [];
        // dedupe ways at same node by name
        if (!arr.some((a) => a.name === name)) {
          arr.push({ name, weight, lat: g.lat, lon: g.lon });
        }
        nodeMap.set(key, arr);
      }
    }

    // Candidate intersections: nodes with 2+ different street names
    let best = null;
    for (const [, roads] of nodeMap) {
      if (roads.length < 2) continue;
      const totalWeight = roads.reduce((s, r) => s + r.weight, 0);
      const distMi = haversineMiles(lat, lon, roads[0].lat, roads[0].lon);
      if (distMi > 2.0) continue;
      // Score = busyness, lightly penalized by distance
      const score = totalWeight - distMi * 1.0;
      if (!best || score > best.score) {
        // Sort road names by weight desc so "Main St & Side Rd" reads naturally
        const sorted = [...roads].sort((a, b) => b.weight - a.weight);
        best = {
          score,
          lat: roads[0].lat,
          lon: roads[0].lon,
          names: sorted.slice(0, 2).map((r) => r.name),
          primary_road: sorted[0].name,
          distance_miles: distMi,
        };
      }
    }

    if (!best) {
      return Response.json({
        intersection: null,
        directions_text: `No major named intersection found within 2 miles via OpenStreetMap.\n\nGPS Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)} — paste these directly into Google Maps, Apple Maps, or any in-vehicle GPS to navigate to the site.`,
      });
    }

    // Compute bearing FROM intersection TO site
    const brg = bearingDeg(best.lat, best.lon, lat, lon);
    const cardinal = bearingToCardinal(brg);
    const distStr = formatDistance(best.distance_miles);

    const intersectionLabel = best.names.join(" & ");
    const latStr = `${Math.abs(lat).toFixed(6)}°${lat >= 0 ? "N" : "S"}`;
    const lonStr = `${Math.abs(lon).toFixed(6)}°${lon >= 0 ? "E" : "W"}`;

    const directions_text =
`FROM THE INTERSECTION OF ${intersectionLabel.toUpperCase()}:
  1. Head ${cardinal} on ${best.primary_road} for approximately ${distStr}.
  2. The site is located at GPS coordinates ${latStr}, ${lonStr} (decimal: ${lat.toFixed(6)}, ${lon.toFixed(6)}).

📍 GPS NOTE: You can paste the decimal coordinates above directly into Google Maps, Apple Maps, Waze, or any in-vehicle GPS to navigate straight to the site. Cardinal-direction guidance from the nearest busy intersection is provided as a backup reference.`;

    return Response.json({
      intersection: intersectionLabel,
      intersection_lat: best.lat,
      intersection_lon: best.lon,
      primary_road: best.primary_road,
      bearing_deg: brg,
      cardinal_direction: cardinal,
      distance_miles: +best.distance_miles.toFixed(3),
      gps_coordinates: { lat, lon, lat_dms: latStr, lon_dms: lonStr },
      directions_text,
    });
  } catch (error) {
    console.error("directionsFromBusiestIntersection error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});