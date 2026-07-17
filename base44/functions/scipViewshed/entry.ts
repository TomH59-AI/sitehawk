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

// Build a transparent directional cone (azimuth sector) polygon fanning out from
// the tower along a bearing. RF engineers read this as the antenna's coverage
// wedge — overlaid flat (2D top-down) over satellite so obstructions in that
// sector are visible above the tree line and azimuths can be re-aimed.
function conePolygon(lat, lon, bearing, reachMiles, halfAngle = 32, steps = 14) {
  const coords = [[Number(lon.toFixed(5)), Number(lat.toFixed(5))]];
  for (let i = 0; i <= steps; i++) {
    const brg = bearing - halfAngle + (i / steps) * (halfAngle * 2);
    const p = destPoint(lat, lon, brg, reachMiles);
    coords.push([Number(p.lon.toFixed(5)), Number(p.lat.toFixed(5))]);
  }
  coords.push([Number(lon.toFixed(5)), Number(lat.toFixed(5))]); // close back to tower
  return coords;
}

function viewshedMapUrl(token, lat, lon, bearing, ringMiles, color) {
  // Flat 2D top-down satellite (pitch 0, north-up) with a TRANSPARENT colored
  // azimuth cone fanning out along the bearing from the tower. The whole search
  // ring sits in frame so the engineer sees the sector against real terrain.
  const reach = Math.max(ringMiles, 0.5);
  const hex = (color || "#00A7E1").replace("#", "");
  const geojson = encodeURIComponent(JSON.stringify({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { stroke: `#${hex}`, "stroke-width": 2, "stroke-opacity": 0.9, fill: `#${hex}`, "fill-opacity": 0.28 },
      geometry: { type: "Polygon", coordinates: [conePolygon(lat, lon, bearing, reach)] },
    }],
  }));
  const marker = `pin-l-communications-tower+${SKY_YELLOW}(${lon},${lat})`;
  // Auto-zoom to fit the cone reach (~2x reach across the frame), north-up, flat.
  const targetMeters = (2 * reach * 1609.344) / 0.7;
  const mpp = targetMeters / 850;
  const z = Math.max(12, Math.min(18, Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / mpp))).toFixed(2);
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${geojson}),${marker}/${lon},${lat},${z},0/1100x850@2x?access_token=${token}`;
}

async function buildProfile(lat, lon, bearing, towerTopFt, baseGroundPre) {
  // Tower elevation: ground at site + tower height. baseGroundPre lets the
  // caller fetch the site elevation ONCE and reuse it across all directions.
  const baseGround = baseGroundPre !== undefined ? baseGroundPre : await elevationFt(lat, lon);
  const apex = (baseGround ?? 0) + towerTopFt;

  // Fetch all corridor samples in PARALLEL (was sequential → 11x slower and the
  // cause of the >30s viewshed timeout).
  const sampleSpecs = [];
  for (let i = 1; i <= PROFILE_STEPS; i++) {
    const dist = (i / PROFILE_STEPS) * PROFILE_MILES;
    const p = destPoint(lat, lon, bearing, dist);
    sampleSpecs.push({ dist_mi: Number(dist.toFixed(3)), lat: p.lat, lon: p.lon });
  }
  const grounds = await Promise.all(sampleSpecs.map((s) => elevationFt(s.lat, s.lon)));
  const samples = sampleSpecs.map((s, idx) => ({ dist_mi: s.dist_mi, ground_ft: grounds[idx] }));

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

    const token = Deno.env.get("MAPBOX_API_KEY");
    if (!token) return Response.json({ error: "Mapbox token not configured" }, { status: 500 });

    const { lat, lon, ring_miles, tower_height_ft, direction } = await req.json();
    const latN = Number(lat), lonN = Number(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }
    const ring = Number(ring_miles) > 0 ? Number(ring_miles) : 0.25;
    const towerFt = Number(tower_height_ft) > 0 ? Number(tower_height_ft) : 199;

    const aerial_ring_url = aerialRingUrl(token, latN, lonN, ring);

    // Fetch the site (base) elevation ONCE and reuse for every direction.
    const baseGround = await elevationFt(latN, lonN);

    // If the caller asks for ONE direction, only build that one (the frontend
    // renders directions one at a time — building all 4 was the timeout cause).
    const wanted = direction
      ? DIRECTIONS.filter((d) => d.short === String(direction).toUpperCase())
      : DIRECTIONS;

    // Build the requested directions in parallel.
    const directions = await Promise.all(wanted.map(async (d) => {
      const { profile, first_obstruction_mi, clear } = await buildProfile(latN, lonN, d.bearing, towerFt, baseGround);
      return {
        label: d.label,
        short: d.short,
        bearing: d.bearing,
        color: d.color,
        map_url: viewshedMapUrl(token, latN, lonN, d.bearing, ring, d.color),
        profile,
        first_obstruction_mi,
        clear,
      };
    }));

    console.log(`scipViewshed for ${latN},${lonN} tower=${towerFt}ft user=${user.email}`);
    return Response.json({
      // tower_lat/tower_lon/ring_miles are additive fields used by the 3D
      // viewshed globe; the 2D output ignores them.
      viewshed: { aerial_ring_url, tower_height_ft: towerFt, tower_lat: latN, tower_lon: lonN, ring_miles: ring, directions },
    });
  } catch (error) {
    console.error("scipViewshed error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});