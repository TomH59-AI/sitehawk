// targetAConnectionPoints — estimates WHERE utilities most likely hook up for
// Target A: access road entry, power tie-in, and fiber hookup point.
//  - Access: nearest drivable road (OSM) → nearest point on it = likely driveway.
//  - Power:  EIA serving utility + nearest OSM distribution line/pole (likely tap)
//            + nearest HIFLD transmission line (context: owner, voltage, subs).
//  - Fiber:  nearest mapped OSM telecom/fiber asset; if none mapped, assumed at
//            the road frontage (fiber follows the road ROW).
// Estimates from mapped data — NOT confirmation of utility service.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];
const EIA_UTILITY_URL = "https://services1.arcgis.com/4yjifSiIG17X0gW4/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0/query";
const HIFLD_TX_URL = "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0/query";

// Flat-earth projection around the target (fine at parcel scale)
function projector(lat0, lon0) {
  const mPerLat = 110540, mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    toXY: (lat, lon) => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat],
    toLL: (x, y) => [lat0 + y / mPerLat, lon0 + x / mPerLon],
  };
}

// Nearest point from origin (0,0) onto a polyline, in projected meters.
function nearestOnLine(proj, coords) {
  let best = null;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = proj.toXY(coords[i].lat, coords[i].lon);
    const [x2, y2] = proj.toXY(coords[i + 1].lat, coords[i + 1].lon);
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (-(x1 * dx + y1 * dy)) / len2));
    const px = x1 + t * dx, py = y1 + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (!best || d < best.d) best = { d, x: px, y: py };
  }
  return best;
}

function nearestFromWays(proj, ways) {
  let best = null;
  for (const w of ways) {
    if (!Array.isArray(w.geometry) || w.geometry.length < 2) continue;
    const hit = nearestOnLine(proj, w.geometry);
    if (hit && (!best || hit.d < best.d)) best = { ...hit, tags: w.tags || {} };
  }
  return best;
}

const ft = (m) => Math.round(m * 3.28084);
const roadLabel = (t = {}) => t.name || t.ref || `unnamed ${t.highway || "road"}`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ error: 'lat and lon required' }, { status: 400 });
    }
    const proj = projector(lat, lon);

    // ---- One Overpass pull: roads + power distribution + telecom assets ----
    const q = `[out:json][timeout:25];(
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)$"](around:1600,${lat},${lon});
      way["power"~"^(minor_line|line)$"](around:3200,${lat},${lon});
      way["communication:line"~"fiber|fibre|optical|telecom",i](around:8000,${lat},${lon});
      way["cable"~"fib",i](around:8000,${lat},${lon});
      node["telecom"~"exchange|connection_point|service_device|data_center",i](around:8000,${lat},${lon});
      node["street_cabinet"="telecom"](around:8000,${lat},${lon});
    );out tags geom 400;`;

    let elements = [];
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        const r = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "SiteHawk/1.0" },
          body: new URLSearchParams({ data: q }),
        });
        if (!r.ok) continue;
        elements = (await r.json()).elements || [];
        break;
      } catch { /* try next mirror */ }
    }

    const roads = elements.filter((e) => e.type === "way" && e.tags?.highway);
    const distLines = elements.filter((e) => e.type === "way" && e.tags?.power === "minor_line");
    const txOsm = elements.filter((e) => e.type === "way" && e.tags?.power === "line");
    const telecomWays = elements.filter((e) => e.type === "way" && !e.tags?.highway && !e.tags?.power);
    const telecomNodes = elements.filter((e) => e.type === "node" && (e.tags?.telecom || e.tags?.street_cabinet));

    // ---- Access road: nearest point on the nearest road = likely driveway ----
    const accessHit = nearestFromWays(proj, roads);
    let access = null;
    if (accessHit) {
      const [alat, alon] = proj.toLL(accessHit.x, accessHit.y);
      access = {
        point: { lat: alat, lon: alon },
        road_name: roadLabel(accessHit.tags),
        road_class: accessHit.tags.highway,
        surface: accessHit.tags.surface || null,
        distance_ft: ft(accessHit.d),
        note: "Likely driveway / access entry — nearest point on the closest mapped public road.",
      };
    }

    // ---- Power: EIA utility + OSM distribution tap + HIFLD transmission ----
    const [eiaRes, hifldRes] = await Promise.all([
      fetch(`${EIA_UTILITY_URL}?${new URLSearchParams({
        geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
        spatialRel: "esriSpatialRelIntersects", outFields: "NAME,STATE", returnGeometry: "false", f: "json", resultRecordCount: "1",
      })}`).then((r) => r.json()).catch(() => null),
      fetch(`${HIFLD_TX_URL}?${new URLSearchParams({
        geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", outSR: "4326",
        distance: "10", units: "esriSRUnit_StatuteMile", spatialRel: "esriSpatialRelIntersects",
        outFields: "OBJECTID,OWNER,VOLTAGE,VOLT_CLASS,SUB_1,SUB_2", returnGeometry: "true", f: "geojson", resultRecordCount: "5",
      })}`).then((r) => r.json()).catch(() => null),
    ]);

    const utility = eiaRes?.features?.[0]?.attributes?.NAME || null;

    const distHit = nearestFromWays(proj, distLines) || nearestFromWays(proj, txOsm.filter((w) => Number(w.tags?.voltage || 0) < 69000));
    let powerPoint = null, powerNote;
    if (distHit) {
      const [plat, plon] = proj.toLL(distHit.x, distHit.y);
      powerPoint = { lat: plat, lon: plon };
      powerNote = `Likely tap: nearest mapped distribution line, ~${ft(distHit.d)} ft away${distHit.tags.voltage ? ` (${distHit.tags.voltage} V)` : ""}.`;
    } else if (access) {
      powerPoint = access.point;
      powerNote = "No distribution line mapped nearby — power most likely taps at the road frontage (distribution follows the road ROW).";
    }

    // HIFLD transmission context (owner / voltage / substations)
    let transmission = null;
    const hifldWays = (hifldRes?.features || []).map((f) => ({
      tags: f.properties || {},
      geometry: (f.geometry?.type === "MultiLineString" ? f.geometry.coordinates.flat() : f.geometry?.coordinates || [])
        .map(([x, y]) => ({ lat: y, lon: x })),
    }));
    const txHit = nearestFromWays(proj, hifldWays);
    if (txHit) {
      const [tlat, tlon] = proj.toLL(txHit.x, txHit.y);
      // HIFLD uses placeholder junk for unknowns — normalize to null.
      const clean = (v) => (!v || /NOT AVAILABLE|^UNKNOWN/i.test(String(v)) ? null : v);
      const kv = Number(txHit.tags.VOLTAGE);
      transmission = {
        point: { lat: tlat, lon: tlon },
        owner: clean(txHit.tags.OWNER),
        voltage: kv > 0 ? `${kv} kV` : clean(txHit.tags.VOLT_CLASS),
        sub_1: clean(txHit.tags.SUB_1),
        sub_2: clean(txHit.tags.SUB_2),
        distance_miles: Math.round((txHit.d / 1609.34) * 100) / 100,
      };
    }

    // ---- Fiber: nearest mapped telecom asset, else assume road frontage ----
    const nodeHits = telecomNodes.map((n) => {
      const [x, y] = proj.toXY(n.lat, n.lon);
      return { d: Math.sqrt(x * x + y * y), lat: n.lat, lon: n.lon, tags: n.tags || {} };
    });
    const wayHit = nearestFromWays(proj, telecomWays);
    let fiberBest = nodeHits.sort((a, b) => a.d - b.d)[0] || null;
    if (wayHit && (!fiberBest || wayHit.d < fiberBest.d)) {
      const [flat, flon] = proj.toLL(wayHit.x, wayHit.y);
      fiberBest = { d: wayHit.d, lat: flat, lon: flon, tags: wayHit.tags };
    }
    let fiber = null;
    if (fiberBest) {
      fiber = {
        point: { lat: fiberBest.lat, lon: fiberBest.lon },
        asset: fiberBest.tags["communication:line"] ? "Fiber/telecom line"
          : fiberBest.tags.street_cabinet === "telecom" ? "Telecom street cabinet"
          : fiberBest.tags.telecom ? `Telecom ${fiberBest.tags.telecom}` : "Mapped telecom asset",
        operator: fiberBest.tags.operator || fiberBest.tags.name || null,
        distance_ft: ft(fiberBest.d),
        assumed: false,
        note: "Nearest mapped telecom/fiber asset — likely splice/hookup point.",
      };
    } else if (access) {
      fiber = {
        point: access.point,
        asset: null, operator: null, distance_ft: access.distance_ft, assumed: true,
        note: "No fiber asset mapped nearby — fiber typically follows the road ROW, so hookup is assumed at the road frontage.",
      };
    }

    // ---- Static exhibit map: Target A + the three estimated points ----
    const token = Deno.env.get("MAPBOX_API_KEY");
    const pins = [`pin-s-t+DC2626(${lon},${lat})`];
    if (access) pins.push(`pin-s-r+2563EB(${access.point.lon},${access.point.lat})`);
    if (powerPoint) pins.push(`pin-s-p+F59E0B(${powerPoint.lon},${powerPoint.lat})`);
    if (fiber) pins.push(`pin-s-f+7C3AED(${fiber.point.lon},${fiber.point.lat})`);
    const map_url = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${pins.join(",")}/auto/900x560@2x?padding=80&access_token=${token}`;

    return Response.json({
      target: { lat, lon },
      access,
      power: { utility, point: powerPoint, note: powerNote || null, transmission },
      fiber,
      map_url,
      disclaimer: "Estimated connection points from mapped OSM/EIA/HIFLD data. Proximity does NOT confirm electrical or fiber service — availability requires provider or field confirmation.",
    });
  } catch (error) {
    console.error('targetAConnectionPoints failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});