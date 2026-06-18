/**
 * colocationOpportunities — Hawk Colocation Intelligence backend.
 *
 * Strategy (quota-conscious):
 * 1. Query the Supabase FCC ASR bbox table first — FREE, unlimited.
 * 2. Only call OpenCellID if FCC returns < 5 towers (meaning sparse ASR area).
 *    This caps OpenCellID pulls to truly rural / no-ASR situations.
 * 3. Merge: FCC towers win; OpenCellID points >100m from any FCC tower are added.
 * 4. Returns up to 50 towers sorted by distance, with full detail fields:
 *    owner, structure_type, radio_types, frequency, height_ft,
 *    latitude, longitude, address, city, state, fcc_url, asrn,
 *    distance_miles, source.
 *
 * Input:  { lat, lon, radius_miles? (default 3, max 5) }
 * Output: { towers, count, source, fcc_count, ocid_count }
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const FCC_SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const FCC_ANON_KEY     = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";
const EARTH_MI = 3958.8;
const MI_TO_KM = 1.60934;

function haversineMi(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function carrierName(mcc, mnc) {
  if (mcc !== 310 && mcc !== 311 && mcc !== 312 && mcc !== 313) return `MCC ${mcc} / MNC ${mnc}`;
  const VZ  = new Set([12, 13, 590, 890, 910, 480]);
  const ATT = new Set([410, 150, 170, 280, 380, 980, 560]);
  const TMO = new Set([260, 200, 210, 220, 230, 240, 250, 270, 310, 490, 660, 800]);
  if (VZ.has(mnc))  return 'Verizon';
  if (ATT.has(mnc)) return 'AT&T';
  if (TMO.has(mnc)) return 'T-Mobile';
  return `MNC ${mnc}`;
}

// Map FCC structure type codes (single-letter ASR codes + text) to labels + category
const FCC_STRUCT_MAP = {
  "B":  { label: "Building/Rooftop",    category: "rooftop" },
  "T":  { label: "Tower",               category: "tower"   },
  "M":  { label: "Monopole",            category: "tower"   },
  "G":  { label: "Guyed Tower",         category: "tower"   },
  "L":  { label: "Lattice Tower",       category: "tower"   },
  "S":  { label: "Self-Support Tower",  category: "tower"   },
  "P":  { label: "Power/Utility Pole",  category: "utility" },
  "W":  { label: "Water Tower/Tank",    category: "elevated"},
  "C":  { label: "Camouflaged/Stealth", category: "concealed"},
  "O":  { label: "Other Structure",     category: "other"   },
};

function classifyStructure(raw) {
  if (!raw) return { label: "Unknown", category: "unknown" };
  // Single-letter FCC ASR codes
  const upper = raw.trim().toUpperCase();
  if (FCC_STRUCT_MAP[upper]) return FCC_STRUCT_MAP[upper];
  // Full-text fallback
  const s = raw.toLowerCase();
  if (s.includes("monopole") || s.includes("self-support") || s.includes("lattice") || s.includes("guyed") || s.includes("tower"))
    return { label: raw, category: "tower" };
  if (s.includes("building") || s.includes("roof") || s.includes("penthouse"))
    return { label: raw, category: "rooftop" };
  if (s.includes("water") || s.includes("tank") || s.includes("silo") || s.includes("stack") || s.includes("chimney"))
    return { label: raw, category: "elevated" };
  if (s.includes("power") || s.includes("utility") || s.includes("transmission"))
    return { label: raw, category: "utility" };
  if (s.includes("tree") || s.includes("camouflage") || s.includes("stealth") || s.includes("concealed"))
    return { label: raw, category: "concealed" };
  return { label: raw, category: "other" };
}

// ─── FCC ASR via Supabase PostgREST ──────────────────────────────────────────
async function queryFccBbox(latN, lonN, radiusMiles) {
  const radiusKm = radiusMiles * MI_TO_KM;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));
  const latMin = latN - dLat, latMax = latN + dLat;
  const lonMin = lonN - dLon, lonMax = lonN + dLon;

  const cols = [
    "tower_registration_number",
    "callsign",
    "licensee",
    "structure_type",
    "latitude_deg",
    "longitude_deg",
    "total_structure_count",     // height proxy
    "site_address",
    "city",
    "state",
    "fcc_url",
  ].join(",");

  const url = `${FCC_SUPABASE_URL}/rest/v1/cell_towers?select=${cols}`
    + `&latitude_deg=gte.${latMin}&latitude_deg=lte.${latMax}`
    + `&longitude_deg=gte.${lonMin}&longitude_deg=lte.${lonMax}`
    + `&limit=150`;

  const r = await fetch(url, {
    headers: { apikey: FCC_ANON_KEY, Authorization: `Bearer ${FCC_ANON_KEY}` },
  });

  if (!r.ok) {
    console.error("[colocationOpportunities] FCC bbox query failed:", r.status);
    return [];
  }

  const rows = await r.json();
  if (!Array.isArray(rows)) return [];

  return rows
    .map((t) => {
      const tLat = parseFloat(t.latitude_deg);
      const tLon = parseFloat(t.longitude_deg);
      if (!Number.isFinite(tLat) || !Number.isFinite(tLon)) return null;
      const distMi = Math.round(haversineMi(latN, lonN, tLat, tLon) * 100) / 100;
      if (distMi > radiusMiles) return null;
      const { label, category } = classifyStructure(t.structure_type);
      const addressParts = [t.site_address, t.city, t.state].filter(Boolean);
      return {
        source: "FCC ASR",
        asrn: t.tower_registration_number || null,
        call_letters: t.callsign || null,
        owner: t.licensee || "Unknown",
        structure_type: t.structure_type || null,
        structure_label: label,
        structure_category: category,
        height_ft: t.total_structure_count != null ? Math.round(Number(t.total_structure_count)) : null,
        latitude: tLat,
        longitude: tLon,
        address: t.site_address || null,
        city: t.city || null,
        state: t.state || null,
        full_address: addressParts.length ? addressParts.join(", ") : null,
        fcc_url: t.fcc_url || null,
        radio_types: [],   // FCC ASR doesn't carry radio type at this level
        carriers: t.licensee ? [t.licensee] : [],
        frequency: null,   // not in ASR bbox table; would need frequency table join
        range_m: null,
        distance_miles: distMi,
      };
    })
    .filter(Boolean);
}

// ─── OpenCellID (Unwired Labs) ────────────────────────────────────────────────
// Called ONLY when FCC returns < 5 results (protects daily quota).
async function queryOpenCellId(latN, lonN, radiusMiles, token) {
  const radiusKm = radiusMiles * MI_TO_KM;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));

  // OpenCellID BBOX limit is 4,000,000 m² (~2km × 2km square) — cap at 0.6 mi half-side
  const ocidRadiusMiles = Math.min(radiusMiles, 0.6);
  const ocidRadiusKm = ocidRadiusMiles * MI_TO_KM;
  const ocidDLat = ocidRadiusKm / 111.32;
  const ocidDLon = ocidRadiusKm / (111.32 * Math.cos((latN * Math.PI) / 180));
  const url = `https://opencellid.org/cell/getInArea?key=${encodeURIComponent(token)}`
    + `&BBOX=${latN - ocidDLat},${lonN - ocidDLon},${latN + ocidDLat},${lonN + ocidDLon}`
    + `&format=json&limit=300`;

  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  if (data?.error) {
    console.error("[colocationOpportunities] OpenCellID error:", data.error);
    return [];
  }

  const cells = data?.cells || [];
  console.log(`[colocationOpportunities] OpenCellID returned ${cells.length} raw cells`);

  // Cluster cells at 100m resolution (0.001 deg ≈ 111 m)
  const clusters = new Map();
  for (const c of cells) {
    const tLat = parseFloat(c.lat), tLon = parseFloat(c.lon);
    if (!Number.isFinite(tLat) || !Number.isFinite(tLon)) continue;
    const key = `${tLat.toFixed(3)},${tLon.toFixed(3)}`;
    if (!clusters.has(key)) {
      clusters.set(key, { lat: tLat, lon: tLon, cells: [] });
    }
    clusters.get(key).cells.push(c);
  }

  return Array.from(clusters.values()).map(({ lat: tLat, lon: tLon, cells: cls }) => {
    const distMi = Math.round(haversineMi(latN, lonN, tLat, tLon) * 100) / 100;
    // Collect unique carriers and radio types from the cluster
    const carriers = [...new Set(cls.map((c) => carrierName(Number(c.mcc), Number(c.mnc))))];
    const radioTypes = [...new Set(cls.map((c) => c.radio).filter(Boolean))];
    // Use the widest range_m in the cluster
    const ranges = cls.map((c) => parseFloat(c.range)).filter(Number.isFinite);
    const range_m = ranges.length ? Math.max(...ranges) : null;

    return {
      source: "OpenCellID",
      asrn: null,
      call_letters: null,
      owner: carriers.join(" / "),
      structure_type: radioTypes.join(", ") || "Cell Site",
      structure_label: radioTypes.join(", ") || "Cell Site",
      structure_category: "signal_only",
      height_ft: null,
      latitude: tLat,
      longitude: tLon,
      address: null,
      city: null,
      state: null,
      full_address: null,
      fcc_url: null,
      radio_types: radioTypes,
      carriers,
      frequency: null,
      range_m,
      distance_miles: distMi,
    };
  }).filter((t) => t.distance_miles <= radiusMiles);
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_miles = 3 } = await req.json();
    if (lat == null || lon == null)
      return Response.json({ error: "lat and lon required" }, { status: 400 });

    const latN = Number(lat);
    const lonN = Number(lon);
    const radiusMiles = Math.min(Number(radius_miles) || 3, 5);

    // 1. FCC ASR — always, no quota cost
    const fccTowers = await queryFccBbox(latN, lonN, radiusMiles);
    console.log(`[colocationOpportunities] FCC ASR: ${fccTowers.length} towers within ${radiusMiles} mi`);

    // 2. OpenCellID — only if FCC result is sparse (< 5) to protect daily quota
    const uwToken = Deno.env.get("UNWIREDLABS_TOKEN");
    let ocidTowers = [];
    if (uwToken && fccTowers.length < 5) {
      console.log("[colocationOpportunities] FCC sparse — querying OpenCellID (quota event)");
      ocidTowers = await queryOpenCellId(latN, lonN, radiusMiles, uwToken).catch((e) => {
        console.error("[colocationOpportunities] OpenCellID failed:", e.message);
        return [];
      });
      console.log(`[colocationOpportunities] OpenCellID returned ${ocidTowers.length} clustered sites`);
    } else if (!uwToken) {
      console.log("[colocationOpportunities] UNWIREDLABS_TOKEN not set — skipping OpenCellID");
    } else {
      console.log(`[colocationOpportunities] FCC has ${fccTowers.length} towers — skipping OpenCellID (quota-save)`);
    }

    // 3. Merge: FCC wins; add OCID only if > 100 m from every FCC tower
    const merged = [...fccTowers];
    for (const oc of ocidTowers) {
      const tooClose = fccTowers.some(
        (f) => haversineMi(f.latitude, f.longitude, oc.latitude, oc.longitude) < 0.062
      );
      if (!tooClose) merged.push(oc);
    }

    // Sort by distance, cap at 50
    merged.sort((a, b) => a.distance_miles - b.distance_miles);
    const towers = merged.slice(0, 50);

    const sourceLabel = fccTowers.length > 0 && ocidTowers.length > 0
      ? "FCC ASR + OpenCellID"
      : fccTowers.length > 0 ? "FCC ASR" : "OpenCellID";

    return Response.json({
      towers,
      count: towers.length,
      fcc_count: fccTowers.length,
      ocid_count: ocidTowers.length,
      source: sourceLabel,
    });
  } catch (err) {
    console.error("[colocationOpportunities] error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
});