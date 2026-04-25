import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OpenStreetMap Overpass API — free, no key, covers all of CONUS
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

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
    if (!user) return Response.json({ towers: [] });

    const { lat, lon, radius_miles } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    const radiusMeters = Math.round((radius_miles || 2) * 1609.344);

    // Overpass QL — OSM tower/mast features commonly used for communications
    const query = `[out:json][timeout:25];(
      node["man_made"="mast"](around:${radiusMeters},${lat},${lon});
      node["man_made"="tower"]["tower:type"="communication"](around:${radiusMeters},${lat},${lon});
      node["communication:mobile_phone"="yes"](around:${radiusMeters},${lat},${lon});
    );out body 25;`;

    let data = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "SiteHawk/1.0",
        },
        body: new URLSearchParams({ data: query }),
      });

      if (res.ok) {
        data = await res.json();
        break;
      }

      console.warn(`[cellTower] Overpass ${res.status} from ${endpoint} for lat=${lat} lon=${lon}`);
    }

    if (!data) return Response.json({ towers: [] });
    const elements = data.elements || [];
    console.log(`[cellTower] Overpass returned ${elements.length} elements for lat=${lat} lon=${lon}`);

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

    return Response.json({ towers });

  } catch (error) {
    console.error('cellTowerLookup error:', error.message);
    return Response.json({ towers: [], error: error.message });
  }
});