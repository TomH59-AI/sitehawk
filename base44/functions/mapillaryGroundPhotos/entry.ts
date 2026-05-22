import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Mapillary ground-level photo lookup for a candidate site.
// Returns three photos (when available):
//   1. Access drive — nearest road point to the candidate
//   2. Power pole/transformer — nearest OSM power asset
//   3. Fiber/telecom — nearest OSM fiber/telecom asset
//
// For each target point we ask Mapillary Graph API for the closest image within a small bbox.

const MAPILLARY_FIELDS = "id,thumb_1024_url,thumb_2048_url,computed_geometry,captured_at";

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bbox(lat, lon, halfMiles) {
  const dLat = halfMiles / 69.0;
  const dLon = halfMiles / (69.0 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat]; // west,south,east,north
}

async function overpassQuery(query) {
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
  return r.json();
}

function nearestElement(elements, lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const el of elements || []) {
    const elat = el.lat ?? el.center?.lat;
    const elon = el.lon ?? el.center?.lon;
    if (elat == null || elon == null) continue;
    const d = haversineMiles(lat, lon, elat, elon);
    if (d < bestDist) {
      bestDist = d;
      best = { lat: elat, lon: elon, dist_miles: +d.toFixed(3), tags: el.tags || {} };
    }
  }
  return best;
}

async function findNearestRoadPoint(lat, lon) {
  // Find roads within 0.3 mi, return closest node on a road
  const q = `
    [out:json][timeout:15];
    way(around:500,${lat},${lon})[highway~"^(residential|service|unclassified|tertiary|secondary|primary|trunk|motorway)$"];
    (._;>;);
    out body;
  `;
  const data = await overpassQuery(q);
  return nearestElement(data.elements?.filter((e) => e.type === "node"), lat, lon);
}

async function findNearestPowerAsset(lat, lon) {
  // Power poles, transformers, substations within 1 mi
  const q = `
    [out:json][timeout:15];
    (
      node(around:1609,${lat},${lon})[power~"^(pole|tower|transformer|substation)$"];
      way(around:1609,${lat},${lon})[power~"^(transformer|substation)$"];
    );
    out center;
  `;
  const data = await overpassQuery(q);
  return nearestElement(data.elements, lat, lon);
}

async function findNearestFiberAsset(lat, lon) {
  // Fiber/telecom infrastructure within 1.5 mi
  const q = `
    [out:json][timeout:15];
    (
      node(around:2414,${lat},${lon})[telecom];
      node(around:2414,${lat},${lon})[man_made=manhole][manhole=telecom];
      way(around:2414,${lat},${lon})[communication=line];
      way(around:2414,${lat},${lon})[telecom];
    );
    out center;
  `;
  const data = await overpassQuery(q);
  return nearestElement(data.elements, lat, lon);
}

async function fetchClosestMapillaryImage(lat, lon, token, searchHalfMiles = 0.12) {
  const [w, s, e, n] = bbox(lat, lon, searchHalfMiles);
  const url =
    `https://graph.mapillary.com/images?access_token=${token}` +
    `&fields=${MAPILLARY_FIELDS}` +
    `&bbox=${w},${s},${e},${n}` +
    `&limit=50`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Mapillary HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  const images = (data.data || [])
    .map((img) => {
      const coords = img.computed_geometry?.coordinates;
      if (!coords) return null;
      const [ilon, ilat] = coords;
      return {
        id: img.id,
        thumb_url: img.thumb_2048_url || img.thumb_1024_url,
        captured_at: img.captured_at,
        lat: ilat,
        lon: ilon,
        dist_miles: +haversineMiles(lat, lon, ilat, ilon).toFixed(3),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist_miles - b.dist_miles);

  return images[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const token = Deno.env.get("MAPILLARY_CLIENT_TOKEN");
    if (!token) return Response.json({ error: "MAPILLARY_CLIENT_TOKEN not set" }, { status: 500 });

    // 1) Find target points for each photo type (parallel)
    const [accessPoint, powerAsset, fiberAsset] = await Promise.all([
      findNearestRoadPoint(lat, lon).catch(() => null),
      findNearestPowerAsset(lat, lon).catch(() => null),
      findNearestFiberAsset(lat, lon).catch(() => null),
    ]);

    // 2) For each target point that exists, fetch the closest Mapillary photo (parallel)
    const [accessPhoto, powerPhoto, fiberPhoto] = await Promise.all([
      accessPoint ? fetchClosestMapillaryImage(accessPoint.lat, accessPoint.lon, token).catch(() => null) : null,
      powerAsset ? fetchClosestMapillaryImage(powerAsset.lat, powerAsset.lon, token).catch(() => null) : null,
      fiberAsset ? fetchClosestMapillaryImage(fiberAsset.lat, fiberAsset.lon, token).catch(() => null) : null,
    ]);

    return Response.json({
      access_drive: {
        target: accessPoint,
        photo: accessPhoto,
        label: "Access drive / nearest road connection",
      },
      power: {
        target: powerAsset,
        photo: powerPhoto,
        label: powerAsset?.tags?.power
          ? `Nearest ${powerAsset.tags.power}`
          : "Nearest mapped power asset",
      },
      fiber: {
        target: fiberAsset,
        photo: fiberPhoto,
        label: fiberAsset?.tags?.telecom
          ? `Nearest ${fiberAsset.tags.telecom}`
          : fiberAsset?.tags?.communication
          ? "Communication line"
          : "Nearest mapped fiber/telecom asset",
      },
    });
  } catch (error) {
    console.error("mapillaryGroundPhotos error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});