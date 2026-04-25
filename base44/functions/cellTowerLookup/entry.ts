import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OpenStreetMap Overpass API — free, no key, covers all of CONUS
// Queries masts/towers tagged as communication type within radius
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function towerType(tags) {
  if (tags["communication:mobile_phone"] === "yes") return "Cellular";
  if (tags["tower:type"] === "communication") return "Communication";
  if (tags["man_made"] === "mast") return "Tower/Mast";
  return "Tower";
}

function towerOperator(tags) {
  return tags.operator || tags.name || tags["communication:operator"] || "Unknown";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon, radius_miles } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    const radiusMeters = Math.round((radius_miles || 2) * 1609.344);

    // Overpass QL — nodes tagged as masts or towers with communication type
    const query = `[out:json][timeout:20];(node[man_made=mast](around:${radiusMeters},${lat},${lon});node[man_made=tower][tower:type=communication](around:${radiusMeters},${lat},${lon}););out body 20;`;

    console.log(`[cellTower] Overpass query radius=${radiusMeters}m at ${lat},${lon}`);
    const res = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      console.warn(`[cellTower] Overpass returned ${res.status}`);
      return Response.json({ towers: [] });
    }

    const data = await res.json();
    const elements = data.elements || [];
    console.log(`[cellTower] Overpass returned ${elements.length} elements`);

    const towers = elements
      .map((el) => {
        const tLat = el.lat;
        const tLon = el.lon;
        if (!tLat || !tLon) return null;
        const tags = el.tags || {};
        const distMiles = haversineMiles(lat, lon, tLat, tLon);
        return {
          operator: towerOperator(tags),
          type: towerType(tags),
          distance_miles: parseFloat(distMiles.toFixed(2)),
          lat: tLat,
          lon: tLon,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, 5);

    console.log(`[cellTower] returning ${towers.length} towers`);
    return Response.json({ towers });

  } catch (error) {
    console.error('cellTowerLookup error:', error.message);
    return Response.json({ towers: [], error: error.message });
  }
});