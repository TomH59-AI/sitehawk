import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Returns mapped electric + fiber/telecom assets within a 1-mile radius of (lat, lon)
// from OpenStreetMap Overpass. Used by the SCIP Infrastructure tab to pin real
// asset locations on the satellite render with APWA color codes:
//   • RED    — electric (poles, transformers, substations, power lines)
//   • ORANGE — communication / fiber (telecom cabinets, manholes, lines)

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

async function overpass(query) {
  let lastErr = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "SiteHawk-SCIP/1.0 (sitehawk.app)",
          "Accept": "application/json",
        },
        body: "data=" + encodeURIComponent(query),
      });
      if (!r.ok) {
        lastErr = `${url} → HTTP ${r.status}`;
        continue;
      }
      return await r.json();
    } catch (e) {
      lastErr = `${url} → ${e.message}`;
    }
  }
  throw new Error(`All Overpass endpoints failed: ${lastErr}`);
}

function pointOf(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

function lineOf(el, nodesById) {
  if (el.type !== "way" || !el.nodes?.length) return null;
  const coords = el.nodes
    .map((id) => nodesById[id])
    .filter(Boolean)
    .map((n) => [n.lon, n.lat]);
  return coords.length >= 2 ? coords : null;
}

function categorizeElectric(tags) {
  if (!tags) return null;
  if (tags.power === "pole") return "pole";
  if (tags.power === "tower") return "tower";
  if (tags.power === "transformer") return "transformer";
  if (tags.power === "substation") return "substation";
  if (tags.power === "line" || tags.power === "minor_line") return "line";
  if (tags.power === "cable") return "underground";
  return null;
}

function categorizeFiber(tags) {
  if (!tags) return null;
  if (tags.communication === "line") return "line";
  if (tags.telecom === "exchange") return "exchange";
  if (tags.telecom === "data_center") return "data_center";
  if (tags.telecom === "connection_point") return "splice";
  if (tags.telecom) return "telecom";
  if (tags.man_made === "manhole" && tags.manhole === "telecom") return "manhole";
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_m = 1609 } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // One combined Overpass query for everything (faster, fewer hits)
    const q = `
      [out:json][timeout:25];
      (
        // Electric points
        node(around:${radius_m},${lat},${lon})[power~"^(pole|tower|transformer|substation)$"];
        way(around:${radius_m},${lat},${lon})[power~"^(transformer|substation)$"];
        // Electric lines
        way(around:${radius_m},${lat},${lon})[power~"^(line|minor_line|cable)$"];
        // Fiber / telecom points
        node(around:${radius_m},${lat},${lon})[telecom];
        node(around:${radius_m},${lat},${lon})[man_made=manhole][manhole=telecom];
        // Fiber / telecom lines
        way(around:${radius_m},${lat},${lon})[communication=line];
        way(around:${radius_m},${lat},${lon})[telecom];
      );
      (._;>;);
      out body;
    `;

    const data = await overpass(q);
    const elements = data.elements || [];

    // Build nodesById so we can resolve way geometries to coordinates
    const nodesById = {};
    for (const el of elements) {
      if (el.type === "node") nodesById[el.id] = { lat: el.lat, lon: el.lon };
    }

    const electricPoints = [];
    const electricLines = [];
    const fiberPoints = [];
    const fiberLines = [];

    for (const el of elements) {
      const tags = el.tags;
      if (!tags) continue;

      const eKind = categorizeElectric(tags);
      const fKind = categorizeFiber(tags);

      if (eKind) {
        if (el.type === "node" || el.type === "way") {
          if (eKind === "line" || eKind === "underground") {
            const line = lineOf(el, nodesById);
            if (line) electricLines.push({ kind: eKind, coords: line, voltage: tags.voltage || null });
          } else {
            const p = pointOf(el);
            if (p) electricPoints.push({ kind: eKind, lat: p.lat, lon: p.lon, operator: tags.operator || null });
          }
        }
      } else if (fKind) {
        if (fKind === "line") {
          const line = lineOf(el, nodesById);
          if (line) fiberLines.push({ kind: fKind, coords: line, operator: tags.operator || null });
        } else {
          const p = pointOf(el);
          if (p) fiberPoints.push({ kind: fKind, lat: p.lat, lon: p.lon, operator: tags.operator || null });
        }
      }
    }

    return Response.json({
      electric: {
        points: electricPoints,
        lines: electricLines,
        count: electricPoints.length + electricLines.length,
      },
      fiber: {
        points: fiberPoints,
        lines: fiberLines,
        count: fiberPoints.length + fiberLines.length,
      },
      center: { lat, lon },
      radius_m,
    });
  } catch (error) {
    console.error("infrastructureAssets error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});