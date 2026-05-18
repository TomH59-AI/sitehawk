import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// OpenStreetMap Overpass API — free, no key, covers all of CONUS
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// ─── Carrier Inference Registry ───────────────────────────────────────────
// Real U.S. mobile carriers + the four largest neutral-host tower owners.
// Match order matters: more specific patterns first.
const CARRIER_PATTERNS = [
  // Big 4 Mobile Carriers
  { name: "AT&T", regex: /\b(at\s*&\s*t|at&t|att\s*mobility|cingular|new\s*cingular|sbc)\b/i },
  { name: "Verizon", regex: /\b(verizon|cellco|vzw|bell\s*atlantic\s*mobile|airtouch|nynex\s*mobile|gte\s*mobilnet)\b/i },
  { name: "T-Mobile", regex: /\b(t[\s\-]*mobile|tmobile|metropcs|sprint|nextel|voicestream|powertel|sun\s*cellular|aerial\s*comm)\b/i },
  { name: "Dish Wireless", regex: /\b(dish\s*wireless|dish\s*network|boost\s*mobile|boost\s*infinite|project\s*genesis)\b/i },

  // Regional Carriers
  { name: "US Cellular", regex: /\b(u\.?s\.?\s*cellular|uscc|united\s*states\s*cellular)\b/i },
  { name: "C Spire", regex: /\bc\s*spire\b/i },
  { name: "Cellular South", regex: /\bcellular\s*south\b/i },

  // Tower Owners (Neutral Host / Tower-Cos)
  { name: "American Tower", regex: /\b(american\s*tower|ATC\b|amer\s*tower)\b/i },
  { name: "Crown Castle", regex: /\b(crown\s*castle|crown\s*comm|global\s*signal)\b/i },
  { name: "SBA Communications", regex: /\b(sba\s*communications|sba\s*towers|sba\s*network|sba\s*sites)\b/i },
  { name: "Vertical Bridge", regex: /\b(vertical\s*bridge|vert\s*bridge)\b/i },
  { name: "Tillman Infrastructure", regex: /\btillman\b/i },
  { name: "Diamond Communications", regex: /\bdiamond\s*comm/i },

  // Broadcast / Media (lower confidence as cellular)
  { name: "iHeartMedia", regex: /\b(iheart|clear\s*channel)\b/i },
  { name: "Cumulus Media", regex: /\bcumulus\s*media\b/i },
];

function inferCarrier(tags) {
  // Search across every plausible OSM text field — this is where carrier names hide.
  const haystack = [
    tags.operator,
    tags.name,
    tags["name:en"],
    tags.ref,
    tags["ref:fcc:asrn"],
    tags["communication:operator"],
    tags.owner,
    tags.brand,
    tags.description,
    tags.note,
    tags.site_name,
    tags["communication:wireless"],
  ].filter(Boolean).join(" | ");

  if (!haystack) return { operator: "Unknown", confidence: "none" };

  for (const c of CARRIER_PATTERNS) {
    if (c.regex.test(haystack)) {
      return { operator: c.name, confidence: "matched", raw: haystack.slice(0, 80) };
    }
  }

  // No carrier pattern matched — return the raw OSM operator/name as-is rather than "Unknown"
  const rawName = tags.operator || tags.owner || tags["communication:operator"] || tags.name;
  if (rawName && rawName.trim().length > 1) {
    return { operator: rawName.trim(), confidence: "raw_osm" };
  }
  return { operator: "Unknown", confidence: "none" };
}

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ towers: [] });

    const { lat, lon, radius_miles } = await req.json();
    if (!lat || !lon) return Response.json({ error: 'lat and lon required' }, { status: 400 });

    const radiusMeters = Math.round((radius_miles || 2) * 1609.344);

    // Overpass QL — OSM tower/mast features. Fetch tags so we can infer carrier.
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
        const carrier = inferCarrier(tags);
        return {
          operator: carrier.operator,
          operator_confidence: carrier.confidence, // "matched" | "raw_osm" | "none"
          type: towerType(tags),
          distance_miles: parseFloat(distMiles.toFixed(2)),
          lat: tLat,
          lon: tLon,
          asrn: tags["ref:fcc:asrn"] || null,
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