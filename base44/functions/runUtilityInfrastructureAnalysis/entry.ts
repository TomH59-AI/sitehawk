import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * runUtilityInfrastructureAnalysis — SCIP Utility Infrastructure Map data.
 *
 * PRODUCTION SOURCES (fast, reliable, SCIP-ready). OSM/Overpass is NOT part of
 * the default flow — it is an optional manual layer only (include_osm=true).
 *
 *   FIBER:
 *     • carrierFinderFiber  — PRIMARY (lit buildings + incumbent telco contact)
 *     • fccFiberLookup      — SECONDARY (provider counts / fiber availability)
 *     • SearchResult fields — reuse fiber_distance_miles / fiber_operator if set
 *   ELECTRIC / POWER:
 *     • electricUtilityLookup   — serving utility (HIFLD territory)
 *     • electricProviderContact — provider contact (name/phone/website/address)
 *     • hifldTransmissionLines  — transmission-line geometry near the point
 *     • SearchResult fields     — reuse transmission_line_distance_miles / power_utility
 *   OSM (optional, OFF by default):
 *     • infrastructureAssets — only when include_osm=true. Never blocks the map.
 *
 * Payload: { lat, lon, radius_miles=1.0, state?, search_result_id?, include_osm=false }
 */

const R_MI = 3958.7613;
const toRad = (d) => (d * Math.PI) / 180;
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

function haversineMiles(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(a));
}

// Nearest point on a polyline (array of [lon,lat]) to the center.
function nearestOnLine(cLat, cLon, coords) {
  let best = { distance_miles: Infinity, point: null };
  for (const [lon, lat] of coords) {
    const d = haversineMiles(cLat, cLon, lat, lon);
    if (d < best.distance_miles) best = { distance_miles: d, point: { lat, lon } };
  }
  return best;
}

// Degrees of latitude/longitude for a given mile radius → bbox [w,s,e,n].
function bboxFor(lat, lon, radiusMiles) {
  const dLat = radiusMiles / 69.0;
  const dLon = radiusMiles / (69.0 * Math.cos(toRad(lat)) || 1);
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

// ── FIBER: CarrierFinder (primary) — env-secret auth, no user context needed ──
async function fetchCarrierFinder(lat, lon, radius_miles, state) {
  const userid = Deno.env.get("CF_USERID");
  const key = Deno.env.get("CF_KEY");
  if (!userid || !key) throw new Error("CF_USERID / CF_KEY not set");
  const radiusFeet = Math.round(Number(radius_miles) * 5280);
  const base = "http://api.carrierfinder.net/api.py";
  const litQs = new URLSearchParams({
    function: "get_litbuildings", method: "geo", lat: String(lat), lon: String(lon),
    radius: String(radiusFeet), count: "25", carrier_count: "1", userid, key,
    ...(state ? { state } : {}),
  });
  const telcoQs = new URLSearchParams({ function: "get_telcoinfo", method: "geo", lat: String(lat), lon: String(lon), userid, key });
  const getJson = async (url) => {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const t = await r.text();
    if (!r.ok) throw new Error(`CarrierFinder HTTP ${r.status}`);
    try { return JSON.parse(t); } catch { throw new Error("CarrierFinder non-JSON"); }
  };
  const [litRes, telcoRes] = await Promise.all([
    getJson(`${base}?${litQs}`).catch(() => null),
    getJson(`${base}?${telcoQs}`).catch(() => null),
  ]);
  const rawSites = Array.isArray(litRes?.site) ? litRes.site : (litRes?.site ? [litRes.site] : []);
  const lit_buildings = rawSites.map((s) => ({
    street: s.street || null, city: s.city || null, state: s.state || null,
    lat: s.latitude != null ? Number(s.latitude) : null,
    lon: s.longitude != null ? Number(s.longitude) : null,
    xnet_description: s.xnet_description || null,
    carrier: s.carriername || null,
  }));
  const telco = telcoRes?.status && String(telcoRes.status).toLowerCase() === "ok" ? {
    name: telcoRes.telco_telconame || telcoRes.telco_parentname || null,
    parent: telcoRes.telco_parentname || null,
    phone: telcoRes.telco_telconumber || telcoRes.telco_parentnumber || null,
    exchange: telcoRes.telco_exchange || null,
    co_city: telcoRes.telco_co_city || null,
    co_lat: telcoRes.telco_co_lat != null ? Number(telcoRes.telco_co_lat) : null,
    co_lon: telcoRes.telco_co_lon != null ? Number(telcoRes.telco_co_lon) : null,
  } : null;
  return { lit_buildings, telco };
}

// ── FIBER: FCC Broadband Data Collection (secondary) — public ArcGIS ──
async function fetchFccFiber(lat, lon) {
  const base = "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";
  const outFields = "GEOID,TotalBSLs,ServedBSLsFiber,UniqueProviders,UniqueProvidersFiber";
  const query = async (layerId, resolution) => {
    const geometry = encodeURIComponent(JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }));
    const url = `${base}/${layerId}/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(outFields)}&returnGeometry=false&f=json`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`FCC HTTP ${r.status}`);
    const j = await r.json();
    const a = j.features?.[0]?.attributes;
    if (!a) return null;
    const pct = (n, d) => (!d || d <= 0 ? null : Math.round((n / d) * 1000) / 10);
    return {
      resolution,
      providers: { total: a.UniqueProviders ?? null, fiber: a.UniqueProvidersFiber ?? null },
      fiber: { servedPct: pct(a.ServedBSLsFiber, a.TotalBSLs) },
    };
  };
  return (await query(3, "blockGroup")) || (await query(1, "county")) || (await query(0, "state"));
}

// ── ELECTRIC: HIFLD Retail Service Territory (serving utility) — public ArcGIS ──
async function fetchElectricUtility(lat, lon) {
  const url = "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query";
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "NAME,TYPE,STATE,HOLDING_CO,WEBSITE,TELEPHONE,CNTRL_AREA",
    returnGeometry: "false", f: "json", resultRecordCount: "5",
  });
  const r = await fetch(`${url}?${params}`);
  if (!r.ok) throw new Error(`HIFLD utility HTTP ${r.status}`);
  const data = await r.json();
  const features = data?.features || [];
  if (!features.length) return null;
  const p = features[0].attributes;
  return {
    utility_name: p.NAME || null, utility_type: p.TYPE || null, holding_company: p.HOLDING_CO || null,
    website: p.WEBSITE || null, telephone: p.TELEPHONE || null, control_area: p.CNTRL_AREA || null,
    overlapping_territories: features.slice(1).map((f) => ({ name: f.attributes.NAME, type: f.attributes.TYPE })),
  };
}

// ── ELECTRIC: HIFLD transmission lines near the point — public ArcGIS ──
async function fetchTransmissionLines(bbox) {
  const [w, s, e, n] = bbox.map(Number);
  const url = "https://services2.arcgis.com/LYMgRMwHfrWWEg3s/arcgis/rest/services/HIFLD_US_Electric_Power_Transmission_Lines/FeatureServer/0/query";
  const params = new URLSearchParams({
    where: "1=1",
    geometry: JSON.stringify({ xmin: w, ymin: s, xmax: e, ymax: n, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "OWNER,VOLTAGE,VOLT_CLASS", returnGeometry: "true", f: "geojson", resultRecordCount: "500",
  });
  const r = await fetch(`${url}?${params}`);
  if (!r.ok) throw new Error(`HIFLD transmission HTTP ${r.status}`);
  const fc = await r.json();
  if (fc.error) throw new Error(fc.error.message || "HIFLD error");
  return { features: fc.features || [] };
}

// ── ELECTRIC: provider contact from the ElectricProvider directory entity ──
async function findProviderContact(base44, lat, lon, state, owner_name) {
  let candidates = [];
  if (state) {
    candidates = await base44.asServiceRole.entities.ElectricProvider.filter({ STATE: String(state).toUpperCase() }, undefined, 2000);
  }
  if (!candidates.length) {
    candidates = await base44.asServiceRole.entities.ElectricProvider.list(undefined, 3000);
  }
  if (!candidates.length) return { match: null };
  const norm = (x) => (x || "").toString().toLowerCase().replace(/[^a-z0-9]/g, "");
  let nameMatch = null;
  if (owner_name) {
    const t = norm(owner_name);
    nameMatch = candidates.find((c) => { const x = norm(c.NAME); return x === t || x.includes(t) || t.includes(x); });
  }
  const ranked = candidates
    .filter((c) => c.LATITUDE != null && c.LONGITUDE != null)
    .map((c) => ({ ...c, distance_miles: round2(haversineMiles(lat, lon, Number(c.LATITUDE), Number(c.LONGITUDE))) }))
    .sort((a, b) => a.distance_miles - b.distance_miles);
  const c = nameMatch || ranked[0] || null;
  if (!c) return { match: null };
  return {
    match: {
      name: c.NAME, type: c.TYPE || null, phone: c.TELEPHONE || null, website: c.WEBSITE || null,
      address: [c.ADDRESS, c.CITY, c.STATE, c.ZIP].filter(Boolean).join(", "),
      distance_miles: c.distance_miles ?? null,
    },
  };
}

// ── OPTIONAL OSM context — Overpass, direct. Never blocks the main map. ──
async function fetchOsmContext(lat, lon, radius_m) {
  const endpoints = [
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  const q = `[out:json][timeout:15];(
    node(around:${radius_m},${lat},${lon})[power~"^(tower|transformer|substation)$"];
    way(around:${radius_m},${lat},${lon})[power~"^(transformer|substation|line|minor_line)$"];
    node(around:${radius_m},${lat},${lon})[telecom];
    way(around:${radius_m},${lat},${lon})[communication=line];
  );(._;>;);out body;`;
  let data = null, lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "SiteHawk-SCIP/1.0" },
        body: "data=" + encodeURIComponent(q),
      });
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue; }
      data = await r.json();
      break;
    } catch (e) { lastErr = e.message; }
  }
  if (!data) throw new Error(lastErr || "Overpass unavailable");
  const nodesById = {};
  for (const el of data.elements || []) if (el.type === "node") nodesById[el.id] = { lat: el.lat, lon: el.lon };
  const electricPoints = [], electricLines = [], fiberPoints = [], fiberLines = [];
  for (const el of data.elements || []) {
    const t = el.tags; if (!t) continue;
    const p = el.lat != null ? { lat: el.lat, lon: el.lon } : null;
    const line = el.type === "way" && el.nodes?.length ? el.nodes.map((id) => nodesById[id]).filter(Boolean).map((nn) => [nn.lon, nn.lat]) : null;
    if (t.power === "line" || t.power === "minor_line") { if (line?.length >= 2) electricLines.push({ kind: t.power, coords: line }); }
    else if (t.power) { if (p) electricPoints.push({ kind: t.power, lat: p.lat, lon: p.lon }); }
    else if (t.communication === "line") { if (line?.length >= 2) fiberLines.push({ kind: "line", coords: line }); }
    else if (t.telecom) { if (p) fiberPoints.push({ kind: "telecom", lat: p.lat, lon: p.lon }); }
  }
  return {
    electric: { points: electricPoints, lines: electricLines, count: electricPoints.length + electricLines.length },
    fiber: { points: fiberPoints, lines: fiberLines, count: fiberPoints.length + fiberLines.length },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const cLat = Number(body.lat);
    const cLon = Number(body.lon);
    const radius_miles = Number(body.radius_miles || 1.0);
    const state = body.state || null;
    const include_osm = body.include_osm === true;
    const search_result_id = body.search_result_id || null;
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    // Optionally reuse already-populated SearchResult fields.
    let sr = null;
    if (search_result_id) {
      sr = await base44.asServiceRole.entities.SearchResult.get(search_result_id).catch(() => null);
    }

    const diagnostics = {};

    // ── Run all production sources in parallel (each isolated, never throws) ──
    // Sources are fetched DIRECTLY (no function-to-function invoke) so a single
    // slow/failed source never blocks the utility map.
    const bbox = bboxFor(cLat, cLon, Math.max(radius_miles, 0.75));
    const [cf, fcc, util, transmission] = await Promise.all([
      fetchCarrierFinder(cLat, cLon, radius_miles, state).catch((e) => { diagnostics.carrierfinder = e.message; return null; }),
      fetchFccFiber(cLat, cLon).catch((e) => { diagnostics.fcc = e.message; return null; }),
      fetchElectricUtility(cLat, cLon).catch((e) => { diagnostics.electric_utility = e.message; return null; }),
      fetchTransmissionLines(bbox).catch((e) => { diagnostics.transmission = e.message; return null; }),
    ]);

    // Electric provider contact — match the ElectricProvider directory by the
    // serving utility name and/or nearest coordinates.
    const contact = await findProviderContact(base44, cLat, cLon, state, util?.utility_name || null)
      .catch((e) => { diagnostics.electric_contact = e.message; return null; });

    // ── FIBER ──────────────────────────────────────────────────────────────
    const lit = Array.isArray(cf?.lit_buildings) ? cf.lit_buildings.filter((b) => b.lat != null && b.lon != null) : [];
    const fiber_points = lit.map((b) => ({
      kind: "lit_building",
      lat: b.lat,
      lon: b.lon,
      operator: b.carrier || null,
      label: [b.street, b.city].filter(Boolean).join(", ") || null,
      xnet: b.xnet_description || null,
      distance_miles: round2(haversineMiles(cLat, cLon, b.lat, b.lon)),
    })).sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity));

    // Telco central office point (contact-grade geometry).
    const telco = cf?.telco || null;
    if (telco?.co_lat != null && telco?.co_lon != null) {
      fiber_points.push({
        kind: "central_office",
        lat: telco.co_lat,
        lon: telco.co_lon,
        operator: telco.name || telco.parent || null,
        label: `Central Office${telco.co_city ? ` — ${telco.co_city}` : ""}`,
        distance_miles: round2(haversineMiles(cLat, cLon, telco.co_lat, telco.co_lon)),
      });
    }

    const nearest_fiber = fiber_points.length
      ? fiber_points.reduce((a, b) => (b.distance_miles ?? Infinity) < (a.distance_miles ?? Infinity) ? b : a)
      : null;

    // Fiber summary (provider info that has no precise geometry → side panel).
    const fiber_summary = {
      // Reuse SearchResult fields when already populated.
      nearest_distance_miles: nearest_fiber?.distance_miles ?? (sr?.fiber_distance_miles ?? null),
      nearest_operator: nearest_fiber?.operator ?? (sr?.fiber_operator ?? null),
      lit_building_count: lit.length,
      incumbent_telco: telco ? { name: telco.name, parent: telco.parent, phone: telco.phone, exchange: telco.exchange } : null,
      fcc_fiber_providers: fcc?.providers?.fiber ?? null,
      fcc_total_providers: fcc?.providers?.total ?? null,
      fcc_fiber_served_pct: fcc?.fiber?.servedPct ?? null,
      fcc_resolution: fcc?.resolution ?? null,
      has_fiber: (fcc?.providers?.fiber ?? 0) > 0 || lit.length > 0 || sr?.has_fiber === true,
    };

    // ── ELECTRIC / POWER ─────────────────────────────────────────────────────
    const utility_contact = contact?.match ? {
      name: contact.match.name,
      type: contact.match.type,
      phone: contact.match.phone,
      website: contact.match.website,
      address: contact.match.address,
      distance_miles: round2(contact.match.distance_miles),
    } : null;

    // Transmission lines → keep nearest few with geometry for distance lines.
    const tfeatures = Array.isArray(transmission?.features) ? transmission.features : [];
    const power_lines = [];
    for (const f of tfeatures) {
      const g = f.geometry;
      if (!g) continue;
      const segments = g.type === "MultiLineString" ? g.coordinates : g.type === "LineString" ? [g.coordinates] : [];
      let best = { distance_miles: Infinity, point: null };
      for (const seg of segments) {
        const near = nearestOnLine(cLat, cLon, seg);
        if (near.distance_miles < best.distance_miles) best = near;
      }
      if (best.point) {
        power_lines.push({
          kind: "transmission",
          owner: f.properties?.OWNER || null,
          voltage: f.properties?.VOLTAGE || null,
          volt_class: f.properties?.VOLT_CLASS || null,
          coords: segments[0] || [],
          distance_miles: round2(best.distance_miles),
          nearest_point: best.point,
        });
      }
    }
    power_lines.sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity));
    const nearest_transmission = power_lines[0] || null;

    const power_summary = {
      serving_utility: util?.utility_name ?? sr?.power_utility ?? null,
      utility_type: util?.utility_type ?? null,
      holding_company: util?.holding_company ?? null,
      utility_website: util?.website ?? null,
      utility_phone: util?.telephone ?? null,
      control_area: util?.control_area ?? null,
      overlapping_territories: util?.overlapping_territories ?? null,
      contact: utility_contact,
      nearest_transmission_distance_miles: nearest_transmission?.distance_miles ?? (sr?.transmission_line_distance_miles ?? null),
      nearest_transmission_voltage: nearest_transmission?.voltage ?? (sr?.transmission_line_voltage ?? null),
      nearest_transmission_owner: nearest_transmission?.owner ?? null,
    };

    // ── OPTIONAL OSM CONTEXT (off by default, never blocks) ──────────────────
    let osm = null;
    if (include_osm) {
      const radius_m = Math.round(radius_miles * 1609.34);
      osm = await fetchOsmContext(cLat, cLon, radius_m).catch((e) => { diagnostics.osm = e.message; return null; });
    }

    const result = {
      target_lat: cLat,
      target_lon: cLon,
      radius_miles,
      generated_at: new Date().toISOString(),
      // Map-ready geometry
      fiber_points: fiber_points.slice(0, 40),
      power_lines: power_lines.slice(0, 20),
      nearest_fiber,
      nearest_transmission,
      utility_contact,
      // Side summary panels (provider/company info, no fake precise points)
      fiber_summary,
      power_summary,
      // Optional OSM context (null unless include_osm=true)
      osm,
      osm_included: include_osm,
      osm_warning: include_osm && diagnostics.osm ? `OSM context unavailable: ${diagnostics.osm}` : null,
      diagnostics,
    };

    return Response.json(result);
  } catch (error) {
    console.error("runUtilityInfrastructureAnalysis error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});