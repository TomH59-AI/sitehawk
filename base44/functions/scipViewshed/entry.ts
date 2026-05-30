import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SCIP Step — Viewshed Analysis for Target A.
// 1. Mapbox aerial image centered on the tower waypoint with a colored radius ring + tower marker.
// 2. Four cardinal (N/S/E/W) pitched 2D viewshed maps.
// 3. USGS EPQS elevation profiles along each bearing, with RF line-of-sight obstruction flags.

const EPQS_URL = "https://epqs.nationalmap.gov/v1/json";

const SKY_BLUE = "1B3FAE";
const SKY_YELLOW = "FFC72C";

const DIRECTIONS = [
  { label: "North from Site", short: "N", bearing: 0,   color: "#00A7E1" },
  { label: "East from Site",  short: "E", bearing: 90,  color: "#22C55E" },
  { label: "South from Site", short: "S", bearing: 180, color: "#F59E0B" },
  { label: "West from Site",  short: "W", bearing: 270, color: "#A855F7" },
];

const PROFILE_MILES = 1.0;      // corridor length per direction
const PROFILE_STEPS = 10;       // samples per corridor (0..1 mi)
const TREE_CANOPY_FT = 40;      // assumed tree-line height added to ground for obstruction test

// Move a point distMiles along a bearing (great-circle).
function destPoint(lat, lon, bearing, distMiles) {
  const R = 3958.8;
  const brg = (bearing * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const dr = distMiles / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(brg));
  const lon2 = lon1 + Math.atan2(
    Math.sin(brg) * Math.sin(dr) * Math.cos(lat1),
    Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
  );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

async function elevationFt(lat, lon) {
  try {
    const url = `${EPQS_URL}?x=${lon}&y=${lat}&units=Feet&wkid=4326&includeDate=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.value;
    return (raw != null && raw > -100000) ? parseFloat(parseFloat(raw).toFixed(1)) : null;
  } catch {
    return null;
  }
}

// Circle ring as a Mapbox GeoJSON overlay polygon.
function circlePolygon(lat, lon, radiusMiles, steps = 48) {
  const radiusKm = radiusMiles * 1.609344;
  const latR = (lat * Math.PI) / 180;
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm * Math.sin(t)) / 110.574;
    const dLon = (radiusKm * Math.cos(t)) / (111.320 * Math.cos(latR));
    coords.push([Number((lon + dLon).toFixed(5)), Number((lat + dLat).toFixed(5))]);
  }
  return coords;
}

function aerialRingUrl(token, lat, lon, ringMiles) {
  const geojson = encodeURIComponent(JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { stroke: `#${SKY_YELLOW}`, "stroke-width": 3, "stroke-opacity": 1, fill: `#${SKY_BLUE}`, "fill-opacity": 0.10 },
      geometry: { type: "Polygon", coordinates: [circlePolygon(lat, lon, ringMiles)] },
    }],
  }));
  // Tower-location waypoint marker (yellow pin) at the exact Target A point.
  const pin = `pin-l-communications-tower+${SKY_YELLOW}(${lon},${lat})`;
  // Zoom that fits ~2x ring diameter into the frame.
  const targetMeters = (2 * ringMiles * 1609.344) / 0.7;
  const mpp = targetMeters / 850;
  const z = Math.max(13, Math.min(18, Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp))).toFixed(2);
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${geojson}),${pin}/${lon},${lat},${z},0/1100x850@2x?access_token=${token}`;
}

function viewshedMapUrl(token, lat, lon, bearing) {
  // Offset the center forward along the bearing so the horizon sits mid-frame.
  const c = destPoint(lat, lon, bearing, 0.18);
  const marker = `pin-l-communications-tower+${SKY_YELLOW}(${lon},${lat})`;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${marker}/${c.lon},${c.lat},14,${bearing},60/1100x620@2x?access_token=${token}`;
}

async function buildProfile(lat, lon, bearing, towerTopFt) {
  // Tower elevation: ground at site + tower height.
  const baseGround = await elevationFt(lat, lon);
  const apex = (baseGround ?? 0) + towerTopFt;

  const samples = [];
  for (let i = 1; i <= PROFILE_STEPS; i++) {
    const dist = (i / PROFILE_STEPS) * PROFILE_MILES;
    const p = destPoint(lat, lon, bearing, dist);
    const ground = await elevationFt(p.lat, p.lon);
    samples.push({ dist_mi: Number(dist.toFixed(3)), ground_ft: ground });
  }

  // Line-of-sight: straight line from apex (at dist 0) down to the corridor end ground.
  const endGround = samples[samples.length - 1].ground_ft ?? baseGround ?? 0;
  let firstObstruction = null;
  const profile = samples.map((s) => {
    const frac = s.dist_mi / PROFILE_MILES;
    const los = apex + (endGround - apex) * frac;
    const g = s.ground_ft ?? baseGround ?? 0;
    const obstructed = (g + TREE_CANOPY_FT) > los;
    if (obstructed && firstObstruction == null) firstObstruction = s.dist_mi;
    return {
      dist_mi: s.dist_mi,
      ground_ft: s.ground_ft,
      los_ft: Number(los.toFixed(1)),
      obstructed,
    };
  });

  return { profile, first_obstruction_mi: firstObstruction, clear: firstObstruction == null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    if (!token) return Response.json({ error: "Mapbox token not configured" }, { status: 500 });

    const { lat, lon, ring_miles, tower_height_ft } = await req.json();
    const latN = Number(lat), lonN = Number(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }
    const ring = Number(ring_miles) > 0 ? Number(ring_miles) : 0.25;
    const towerFt = Number(tower_height_ft) > 0 ? Number(tower_height_ft) : 199;

    const aerial_ring_url = aerialRingUrl(token, latN, lonN, ring);

    const directions = [];
    for (const d of DIRECTIONS) {
      const { profile, first_obstruction_mi, clear } = await buildProfile(latN, lonN, d.bearing, towerFt);
      directions.push({
        label: d.label,
        short: d.short,
        bearing: d.bearing,
        color: d.color,
        map_url: viewshedMapUrl(token, latN, lonN, d.bearing),
        profile,
        first_obstruction_mi,
        clear,
      });
    }

    console.log(`scipViewshed for ${latN},${lonN} tower=${towerFt}ft user=${user.email}`);
    return Response.json({
      viewshed: { aerial_ring_url, tower_height_ft: towerFt, directions },
    });
  } catch (error) {
    console.error("scipViewshed error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});