import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SCIP Step — Existing Conditions for Target A.
// Combines FEMA flood, USFWS wetlands, OSM police/fire (all already used elsewhere in the app)
// with a web-grounded LLM pass for Water Management District, Hazardous Waste, and Access Notes.

const FEMA_NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

async function femaFlood(lat, lon) {
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    inSR: "4326",
    outFields: "FLD_ZONE,ZONE_SUBTY",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${FEMA_NFHL}?${params}`, {
    headers: { "User-Agent": "SiteHawk/1.0", "Accept": "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`FEMA ${res.status}`);
  const data = await res.json();
  if (!data.features || data.features.length === 0) {
    return "Zone X — Area of Minimal Flood Hazard (outside SFHA)";
  }
  const a = data.features[0].attributes;
  const sub = a.ZONE_SUBTY ? ` — ${a.ZONE_SUBTY}` : "";
  return `Zone ${(a.FLD_ZONE || "X").trim().toUpperCase()}${sub}`;
}

async function wetlands(lat, lon) {
  const NWI = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query";
  try {
    const buf = 0.0009;
    const params = new URLSearchParams({
      geometry: `${lon - buf},${lat - buf},${lon + buf},${lat + buf}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "Wetlands.WETLAND_TYPE",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "5",
    });
    const res = await fetch(`${NWI}?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const feats = data.features || [];
    if (!feats.length) return "No NWI wetlands mapped on or adjacent to parcel";
    const types = [...new Set(feats.map(f => f.attributes?.["Wetlands.WETLAND_TYPE"]).filter(Boolean))];
    return `Yes — ${types.join(", ")} mapped on/adjacent (USFWS NWI)`;
  } catch {
    return null;
  }
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.7613, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildAddr(t = {}) {
  return [[t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "), t["addr:city"], t["addr:state"]].filter(Boolean).join(", ");
}

async function publicSafety(lat, lon) {
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  const radius = Math.round(15 * 1609.344);
  const query = `[out:json][timeout:25];(
    node["amenity"="police"](around:${radius},${lat},${lon});way["amenity"="police"](around:${radius},${lat},${lon});
    node["amenity"="fire_station"](around:${radius},${lat},${lon});way["amenity"="fire_station"](around:${radius},${lat},${lon});
  );out tags center 50;`;
  let data = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SiteHawk/1.0" }, body: new URLSearchParams({ data: query }) });
      if (res.ok) { data = await res.json(); break; }
    } catch { /* try next */ }
  }
  if (!data) return { police: null, fire: null };
  const pick = (els) => {
    let best = null;
    for (const el of els) {
      const ll = el.lat && el.lon ? [el.lat, el.lon] : (el.center ? [el.center.lat, el.center.lon] : null);
      if (!ll) continue;
      const d = haversineMiles(lat, lon, ll[0], ll[1]);
      if (!best || d < best.d) {
        const t = el.tags || {};
        best = { d, name: t.name || t.operator || "Station", phone: t.phone || t["contact:phone"] || null, addr: buildAddr(t) };
      }
    }
    if (!best) return null;
    const phone = best.phone ? ` — ${best.phone}` : "";
    return `${best.name}${best.addr ? ` (${best.addr})` : ""}${phone}`;
  };
  const els = data.elements || [];
  return {
    police: pick(els.filter(e => e.tags?.amenity === "police")),
    fire: pick(els.filter(e => e.tags?.amenity === "fire_station")),
  };
}

async function accessRoad(lat, lon) {
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  const query = `[out:json][timeout:20];way["highway"](around:150,${lat},${lon});out tags geom;`;
  let data = null;
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SiteHawk/1.0" }, body: new URLSearchParams({ data: query }) });
      if (res.ok) { data = await res.json(); break; }
    } catch { /* try next */ }
  }
  const SKIP = ["footway", "cycleway", "steps", "pedestrian", "bridleway", "corridor"];
  const ways = (data?.elements || []).filter((el) => el.tags?.highway && !SKIP.includes(el.tags.highway));
  if (!ways.length) return null;

  // Nearest way by centroid of its geometry nodes, distance in meters.
  let best = null;
  for (const w of ways) {
    const geom = w.geometry || [];
    if (!geom.length) continue;
    const cLat = geom.reduce((s, p) => s + p.lat, 0) / geom.length;
    const cLon = geom.reduce((s, p) => s + p.lon, 0) / geom.length;
    const dM = haversineMiles(lat, lon, cLat, cLon) * 1609.344;
    if (!best || dM < best.dM) best = { way: w, dM };
  }
  if (!best) return null;

  const tags = best.way.tags || {};
  const hw = tags.highway;

  const LABELS = {
    motorway: "Interstate / Controlled Access Highway",
    trunk: "US Highway / State Arterial",
    primary: "State Highway / Primary Arterial",
    secondary: "State Highway / Primary Arterial",
    tertiary: "County Road",
    residential: "Residential Street",
    unclassified: "Local Road (Unclassified)",
    service: "Service Road / Private Drive",
    track: "Service Road / Private Drive",
    path: "Service Road / Private Drive",
  };
  const hwLabel = LABELS[hw] || "Local Road (Unclassified)";

  // Regrid ROW-compatible road_type codes.
  const TYPES = {
    motorway: "I", trunk: "U", primary: "S", secondary: "S", tertiary: "C",
    residential: "M", unclassified: "M", service: "O", track: "O", path: "O",
  };
  const roadType = TYPES[hw] || "M";

  const ownership = (tags.access === "private" || hw === "service") ? "Private" : "Public";
  const roadName = tags.name || tags.ref || hwLabel;

  let permit;
  if (hw === "motorway") {
    permit = "FHWA / State DOT encroachment permit required — access from this road class is extremely rare for tower sites";
  } else if (hw === "trunk" || roadName.startsWith("US ")) {
    permit = "State DOT encroachment permit required before driveway or access construction";
  } else if (hw === "primary" || hw === "secondary") {
    permit = "State or County DOT encroachment permit required";
  } else if (hw === "tertiary") {
    permit = "County road — county engineer encroachment/driveway permit required";
  } else if (hw === "service") {
    permit = "Service road or private drive — verify ownership; easement or encroachment agreement likely required";
  } else if (hw === "residential" || hw === "unclassified") {
    permit = "Local road — municipal or county driveway permit, typically straightforward";
  } else {
    permit = "Verify access road authority and applicable permit requirements with the local jurisdiction";
  }

  const distFt = Math.round(best.dM * 3.28084);
  const privNote = ownership === "Private" ? " (private access)" : "";

  return {
    road_name: roadName,
    highway_class: hw,
    highway_label: hwLabel,
    road_type: roadType,
    ownership,
    permit_path: permit,
    distance_ft: distFt,
    distance_m: Math.round(best.dM),
    access_notes: `${roadName}${privNote} fronts the parcel approximately ${distFt} ft from the site centroid — ${hwLabel}. ${permit}.`,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, parcel_address, county, state } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const [flood, wet, safety, road, llmRes] = await Promise.allSettled([
      femaFlood(lat, lon),
      wetlands(lat, lon),
      publicSafety(lat, lon),
      accessRoad(lat, lon),
      base44.integrations.Core.InvokeLLM({
        model: "gemini_3_flash",
        add_context_from_internet: true,
        prompt: `For a cell tower site at latitude ${lat}, longitude ${lon}${parcel_address ? ` (${parcel_address})` : ""}${county ? `, ${county} County` : ""}${state ? `, ${state}` : ""}, determine three site "existing conditions" facts. Use current, authoritative web sources.
1. Water Management District: the regulatory water management district / agency with jurisdiction over stormwater & water resources at this location (e.g. in FL: SWFWMD, SJRWMD, SFWMD; elsewhere the state/regional equivalent). Give the district name.
2. Hazardous Waste Concerns: whether there are known EPA/state hazardous-waste, Superfund (CERCLIS/NPL), brownfield, or contamination sites on or immediately near this parcel. Answer "None identified" or describe the concern briefly with the site name.
3. 911 Contact Information: the local 911 / Public Safety Answering Point (PSAP) or county emergency communications center serving this location. Give its name, mailing/street address, and NON-EMERGENCY phone number (never 911). Format as "Name, Address — (xxx) xxx-xxxx". If unknown, say "Requires field verification".
Be concise and factual. If unknown, say "Requires field verification".`,
        response_json_schema: {
          type: "object",
          properties: {
            water_management_district: { type: "string" },
            hazardous_waste: { type: "string" },
            contact_911: { type: "string" },
          },
        },
      }),
    ]);

    const llm = llmRes.status === "fulfilled" ? (llmRes.value || {}) : {};
    const sf = safety.status === "fulfilled" ? safety.value : { police: null, fire: null };
    const rd = road.status === "fulfilled" ? road.value : null;

    if (flood.status === "rejected") console.error("FEMA flood failed:", flood.reason?.message || flood.reason);

    const conditions = {
      flood_zone: flood.status === "fulfilled" ? (flood.value || "Requires verification") : "Requires verification",
      wetland_concerns: wet.status === "fulfilled" ? (wet.value || "Requires verification") : "Requires verification",
      water_management_district: llm.water_management_district || "Requires field verification",
      hazardous_waste: llm.hazardous_waste || "Requires field verification",
      access_notes: rd ? rd.access_notes : "Requires field verification — OSM road query returned no results for this location",
      access_road: rd ? {
        road_name: rd.road_name,
        highway_class: rd.highway_class,
        highway_label: rd.highway_label,
        road_type: rd.road_type,
        ownership: rd.ownership,
        permit_path: rd.permit_path,
        distance_ft: rd.distance_ft,
      } : null,
      contact_911: llm.contact_911 || "Requires field verification",
      local_police: sf.police || "Requires field verification",
      local_fire: sf.fire || "Requires field verification",
    };

    console.log(`scipExistingConditions for ${lat},${lon} user=${user.email} road=${rd?.road_name || "no result"}`);
    return Response.json({ conditions });
  } catch (error) {
    console.error("scipExistingConditions error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});