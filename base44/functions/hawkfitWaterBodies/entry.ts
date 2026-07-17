import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// hawkfitWaterBodies — returns water-body polygons (lakes, ponds, rivers,
// reservoirs, wetlands water) near a HawkFit parcel so the auto-placer can
// keep the tower out of the water. Source: OpenStreetMap Overpass, same
// provider the rest of the app already uses for OSM features.
//
// Payload: { lat, lon, radius_ft=1500 }
// Returns: { water: GeoJSON FeatureCollection }  (Polygons/MultiPolygons only)

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function ftToMeters(ft) { return ft * 0.3048; }

// Build a GeoJSON Polygon ring from an OSM way's node list.
function wayToPolygon(way, nodes) {
  const coords = (way.nodes || [])
    .map((id) => nodes[id])
    .filter(Boolean)
    .map((n) => [n.lon, n.lat]);
  if (coords.length < 4) return null;
  // Close the ring if OSM didn't.
  const first = coords[0], last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
  return { type: "Polygon", coordinates: [coords] };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_ft = 1500 } = await req.json();
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const radiusM = Math.round(ftToMeters(Math.min(Number(radius_ft) || 1500, 5000)));

    // Natural water, riverbanks, reservoirs. `out geom` gives us node coords inline.
    const query = `
      [out:json][timeout:25];
      (
        way(around:${radiusM},${lat},${lon})["natural"="water"];
        relation(around:${radiusM},${lat},${lon})["natural"="water"];
        way(around:${radiusM},${lat},${lon})["water"];
        way(around:${radiusM},${lat},${lon})["waterway"="riverbank"];
        way(around:${radiusM},${lat},${lon})["landuse"="reservoir"];
      );
      out geom;
    `;

    const r = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!r.ok) {
      console.error("Overpass water fetch failed", r.status);
      return Response.json({ water: { type: "FeatureCollection", features: [] } });
    }
    const data = await r.json();
    const features = [];
    for (const el of data.elements || []) {
      // `out geom` attaches a `geometry` array of {lat,lon} to each way.
      if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 4) {
        const coords = el.geometry.map((g) => [g.lon, g.lat]);
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
        features.push({ type: "Feature", properties: { osm_id: el.id, kind: "water" }, geometry: { type: "Polygon", coordinates: [coords] } });
      }
    }

    console.log(`hawkfitWaterBodies: ${features.length} water polygons within ${radiusM}m`);
    return Response.json({ water: { type: "FeatureCollection", features } });
  } catch (error) {
    console.error("hawkfitWaterBodies error:", error.message);
    return Response.json({ water: { type: "FeatureCollection", features: [] } });
  }
});