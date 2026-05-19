// Public Safety Lookup — finds nearest non-emergency Police and Fire stations
// via OSM Overpass (free, no key). Returns name, address, phone, and distance.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function elementLatLon(el) {
  if (el.lat && el.lon) return [el.lat, el.lon];
  if (el.center?.lat && el.center?.lon) return [el.center.lat, el.center.lon];
  return null;
}

function buildAddress(tags = {}) {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.join(", ");
}

function pickNearest(elements, lat, lon) {
  let best = null;
  for (const el of elements || []) {
    const ll = elementLatLon(el);
    if (!ll) continue;
    const d = haversineMiles(lat, lon, ll[0], ll[1]);
    if (!best || d < best.distance_miles) {
      const tags = el.tags || {};
      best = {
        name: tags.name || tags.operator || "Unknown station",
        phone: tags.phone || tags["contact:phone"] || null,
        address: buildAddress(tags) || null,
        website: tags.website || tags["contact:website"] || null,
        distance_miles: parseFloat(d.toFixed(2)),
        lat: ll[0],
        lon: ll[1],
      };
    }
  }
  return best;
}

async function runOverpass(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "SiteHawk/1.0",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {
      console.warn("Overpass failed:", e.message);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_miles = 15 } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const radiusMeters = Math.round(radius_miles * 1609.344);

    const query = `[out:json][timeout:25];(
      node["amenity"="police"](around:${radiusMeters},${lat},${lon});
      way["amenity"="police"](around:${radiusMeters},${lat},${lon});
      node["amenity"="fire_station"](around:${radiusMeters},${lat},${lon});
      way["amenity"="fire_station"](around:${radiusMeters},${lat},${lon});
    );out tags center 50;`;

    const data = await runOverpass(query);
    if (!data) return Response.json({ error: "Overpass unavailable" }, { status: 502 });

    const police = (data.elements || []).filter((el) => el.tags?.amenity === "police");
    const fire = (data.elements || []).filter((el) => el.tags?.amenity === "fire_station");

    const nearestPolice = pickNearest(police, lat, lon);
    const nearestFire = pickNearest(fire, lat, lon);

    return Response.json({
      success: true,
      police: nearestPolice,
      fire: nearestFire,
    });
  } catch (error) {
    console.error("publicSafetyLookup error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});