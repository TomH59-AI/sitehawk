// fiberSplicePoints — MAP 11 · TARGET A Fiber Optics Map data.
// Lean OSM telecom pull (fiber/telecom lines, exchanges, connection points,
// street cabinets) inside a tight radius of Target A, plus the nearest road so a
// road-ROW hookup can be stated as ASSUMED when nothing is mapped.
// Nothing is inferred beyond that, and the assumption is always labeled.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

function projector(lat0: number, lon0: number) {
  const mPerLat = 110540, mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    toXY: (lat: number, lon: number) => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat],
    toLL: (x: number, y: number) => [lat0 + y / mPerLat, lon0 + x / mPerLon],
  };
}

function nearestOnWays(proj, ways) {
  let best = null;
  for (const w of ways) {
    const g = w.geometry;
    if (!Array.isArray(g) || g.length < 2) continue;
    for (let i = 0; i < g.length - 1; i++) {
      const [x1, y1] = proj.toXY(g[i].lat, g[i].lon);
      const [x2, y2] = proj.toXY(g[i + 1].lat, g[i + 1].lon);
      const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / len2));
      const px = x1 + t * dx, py = y1 + t * dy;
      const d = Math.sqrt(px * px + py * py);
      if (!best || d < best.d) best = { d, x: px, y: py, tags: w.tags || {} };
    }
  }
  return best;
}

const ft = (m: number) => Math.round(m * 3.28084);

async function overpass(query: string) {
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 25000);
      const r = await fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "SiteHawk/1.0" },
        body: new URLSearchParams({ data: query }),
        signal: ctl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) continue;
      return (await r.json()).elements || [];
    } catch (e) {
      console.warn(`Overpass mirror failed (${ep}):`, (e as Error).message);
    }
  }
  return [];
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }
    const proj = projector(lat, lon);

    const q = `[out:json][timeout:20];(
      way["communication:line"](around:3000,${lat},${lon});
      way["telecom"](around:3000,${lat},${lon});
      node["telecom"](around:3000,${lat},${lon});
      node["street_cabinet"="telecom"](around:3000,${lat},${lon});
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service)$"](around:600,${lat},${lon});
    );out tags geom 200;`;

    const elements = await overpass(q);
    const roads = elements.filter((e) => e.type === "way" && e.tags?.highway);
    const telecomWays = elements.filter((e) => e.type === "way" && !e.tags?.highway);
    const telecomNodes = elements.filter((e) => e.type === "node");

    // Access / road frontage
    const roadHit = nearestOnWays(proj, roads);
    let access = null;
    if (roadHit) {
      const [alat, alon] = proj.toLL(roadHit.x, roadHit.y);
      access = {
        point: { lat: alat, lon: alon },
        road_name: roadHit.tags.name || roadHit.tags.ref || `unnamed ${roadHit.tags.highway}`,
        distance_ft: ft(roadHit.d),
      };
    }

    // Nearest mapped telecom asset (node or line)
    let best = null;
    for (const n of telecomNodes) {
      const [x, y] = proj.toXY(n.lat, n.lon);
      const d = Math.sqrt(x * x + y * y);
      if (!best || d < best.d) best = { d, lat: n.lat, lon: n.lon, tags: n.tags || {} };
    }
    const wayHit = nearestOnWays(proj, telecomWays);
    if (wayHit && (!best || wayHit.d < best.d)) {
      const [flat, flon] = proj.toLL(wayHit.x, wayHit.y);
      best = { d: wayHit.d, lat: flat, lon: flon, tags: wayHit.tags };
    }

    let fiber = null;
    if (best) {
      const t = best.tags;
      fiber = {
        point: { lat: best.lat, lon: best.lon },
        asset: t["communication:line"] ? `Fiber/telecom line (${t["communication:line"]})`
          : t.street_cabinet === "telecom" ? "Telecom street cabinet"
          : t.telecom ? `Telecom ${t.telecom}` : "Mapped telecom asset",
        operator: t.operator || t.name || null,
        distance_ft: ft(best.d),
        assumed: false,
        note: "Nearest mapped OSM telecom asset — likely splice / hookup point.",
      };
    } else if (access) {
      fiber = {
        point: access.point,
        asset: null,
        operator: null,
        distance_ft: access.distance_ft,
        assumed: true,
        note: "No fiber asset mapped within ~1.9 mi — hookup ASSUMED at road frontage (fiber typically follows the road ROW). Requires field / provider confirmation.",
      };
    }

    console.log(`fiberSplicePoints: ${user.email} @ ${lat},${lon} → telecom assets=${telecomWays.length + telecomNodes.length}, roads=${roads.length}, fiber=${fiber ? (fiber.assumed ? "assumed" : "mapped") : "none"}`);

    return Response.json({
      target: { lat, lon },
      fiber,
      access,
      source: { dataset: "OpenStreetMap (Overpass)", searched_radius_miles: 1.86 },
      disclaimer: "Mapped-data estimate. Proximity does NOT confirm fiber service or splice access — confirm with the provider or in the field.",
    });
  } catch (error) {
    console.error('fiberSplicePoints failed:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}