import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * parcelFullLookup — unified parcel + zoning + ordinance + FEMA enrichment.
 *
 * Strategy:
 *   1. Realie (primary)        → owner, mailing addr, parcel ID, acreage, boundary
 *   2. Zoneomics (cross-ref)   → zoning code, setbacks, height, fallback boundary/acreage
 *   3. extractTelecomOrdinance → fall zone, CUP/PE flags, LDC reference (full only)
 *   4. Jurisdiction entity     → P&Z dept contact (full only)
 *   5. femaFloodLookup         → FEMA risk letter
 *   6. skipTrace (gated)       → phone, email (only if include_skip_trace=true)
 *
 * Payload:
 *   { lat, lng, address?, enrich_depth?: "full"|"light", include_skip_trace?: bool, tower_height_ft?: number }
 */

// ─────────────────────── helpers ───────────────────────

const REALIE_URL = "https://app.realie.ai/api/public/property/location/";
const ZONEOMICS_URL = "https://api.zoneomics.com/v2/zoneDetail";

const sqYdsToAcres = (sy) => (sy ? sy / 4840 : null);
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// Convert Zoneomics WKT MULTIPOLYGON string → GeoJSON MultiPolygon
function wktToGeoJSON(wkt) {
  if (!wkt || typeof wkt !== "string") return null;
  try {
    const isMulti = wkt.trim().toUpperCase().startsWith("MULTIPOLYGON");
    if (!isMulti && !wkt.trim().toUpperCase().startsWith("POLYGON")) return null;

    // Strip type prefix, leading/trailing parens
    const inner = wkt.replace(/^[A-Z]+\s*/i, "").trim().replace(/^\(+|\)+$/g, "");

    // For MULTIPOLYGON: split by )),(( to get polygons
    const polyChunks = isMulti
      ? inner.split(/\)\)\s*,\s*\(\(/)
      : [inner.replace(/^\(+|\)+$/g, "")];

    const polygons = polyChunks.map((polyStr) => {
      // Each polygon has rings separated by "),("
      const ringChunks = polyStr.replace(/^\(+|\)+$/g, "").split(/\)\s*,\s*\(/);
      return ringChunks.map((ring) =>
        ring
          .split(",")
          .map((pt) => {
            const [lng, lat] = pt.trim().split(/\s+/).map(Number);
            return [lng, lat];
          })
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      );
    });

    return { type: "MultiPolygon", coordinates: polygons };
  } catch (e) {
    console.log(`[WARN] WKT parse failed: ${e.message}`);
    return null;
  }
}

// Normalize any GeoJSON-ish object to MultiPolygon shape
function normalizeBoundary(geo) {
  if (!geo || !geo.type) return null;
  if (geo.type === "MultiPolygon") return geo;
  if (geo.type === "Polygon") return { type: "MultiPolygon", coordinates: [geo.coordinates] };
  return null;
}

// Fetch with timeout
async function fetchJSON(url, opts = {}, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: r.ok, status: r.status, json };
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────── source fetchers ───────────────────────

async function fetchRealieParcel(lat, lng, apiKey) {
  // Realie location search — narrowest radius to get the parcel at the point
  const url = `${REALIE_URL}?latitude=${lat}&longitude=${lng}&radius=0.05&limit=5`;
  const { ok, status, json } = await fetchJSON(url, { headers: { Authorization: apiKey } });
  if (!ok) return { error: `Realie HTTP ${status}` };

  const items = json.properties || json.results || (Array.isArray(json) ? json : []);
  if (!items.length) return { error: "no_parcel_at_point" };

  // Pick closest to clicked point
  const p = items[0];
  return {
    raw: p,
    owner_name: p.ownerName || p.owner_name || p.owner || null,
    parcel_id: p.apn || p.parcelId || p.parcel_id || p.parcel_number || null,
    parcel_address: p.address || p.fullAddress || p.site_address || null,
    owner_mailing_address:
      p.ownerMailingAddress ||
      [p.owner_mailing_address, p.owner_mailing_city, p.owner_mailing_state, p.owner_mailing_zip]
        .filter(Boolean)
        .join(", ") ||
      null,
    acreage: p.acres || p.acreage || p.lotSizeAcres || null,
    lat: p.latitude || p.lat || lat,
    lng: p.longitude || p.lon || p.lng || lng,
    boundary_geojson: normalizeBoundary(p.geometry || p.boundary || p.parcel_geometry),
  };
}

async function fetchZoneomics(lat, lng, apiKey) {
  const url = new URL(ZONEOMICS_URL);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("output_fields", "zoning,controls,parcels");

  const { ok, status, json } = await fetchJSON(url.toString());
  if (!ok) return { error: `Zoneomics HTTP ${status}` };

  const d = json?.data || {};
  const zd = d.zone_details || {};
  const ctl = d.controls || {};
  const parcel = (d.parcels && d.parcels[0]) || null;

  // Extract numeric setbacks / height from controls (Zoneomics returns these as strings often)
  const num = (v) => {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  return {
    raw: d,
    zoning: {
      classification_code: zd.zone_code || null,
      classification_name: zd.zone_name || null,
      zone_type: zd.zone_type || null,
      zone_sub_type: zd.zone_sub_type || null,
      max_height_ft: num(ctl.max_building_height) || num(ctl.height_max),
      setback_front_ft: num(ctl.front_setback) || num(ctl.setback_front),
      setback_side_ft: num(ctl.side_setback) || num(ctl.setback_side),
      setback_rear_ft: num(ctl.rear_setback) || num(ctl.setback_rear),
      min_lot_area_sqft: num(ctl.min_lot_area) || num(ctl.lot_area_min),
      link: zd.link || null,
    },
    parcel: parcel
      ? {
          apn: parcel.apn || null,
          address: parcel.address || null,
          land_use: parcel.land_use || null,
          acreage:
            parcel.area_unit === "sq.yds"
              ? sqYdsToAcres(parcel.area)
              : parcel.area_unit === "acres"
              ? parcel.area
              : null,
          owner_name: parcel.owner_info?.owner_name || null,
          owner_address: parcel.owner_info?.owner_address || null,
          boundary_geojson: wktToGeoJSON(parcel.boundary),
          lat: parcel.lat,
          lng: parcel.lng,
        }
      : null,
  };
}

// ─────────────────────── enrichment merge logic ───────────────────────

function mergeParcel(realie, zoneo, inputLat, inputLng, sources) {
  const r = realie?.error ? null : realie;
  const z = zoneo?.parcel || null;

  // Boundary: prefer Realie, fall back to Zoneomics
  let boundary = r?.boundary_geojson || null;
  let boundarySource = boundary ? "realie" : null;
  if (!boundary && z?.boundary_geojson) {
    boundary = z.boundary_geojson;
    boundarySource = "zoneomics";
    console.log(`[INFO] BOUNDARY_FALLBACK: zoneomics used (realie missing) lat=${inputLat} lng=${inputLng}`);
    sources.fallbacks.push("boundary:zoneomics");
  }

  const acreageRealie = r?.acreage ? round2(r.acreage) : null;
  const acreageZoneo = z?.acreage ? round2(z.acreage) : null;
  const acreage = acreageRealie ?? acreageZoneo;

  // Acreage cross-ref
  let acreageMatch = null;
  let acreageDeltaPct = null;
  if (acreageRealie && acreageZoneo) {
    acreageDeltaPct = round2((Math.abs(acreageRealie - acreageZoneo) / acreageRealie) * 100);
    acreageMatch = acreageDeltaPct <= 5; // within 5% = match
  }

  return {
    owner_name: r?.owner_name || z?.owner_name || null,
    parcel_address: r?.parcel_address || z?.address || null,
    parcel_id: r?.parcel_id || z?.apn || null,
    parcel_size_acres: acreage,
    owner_mailing_address: r?.owner_mailing_address || z?.owner_address || null,
    coordinates: { lat: r?.lat || z?.lat || inputLat, lng: r?.lng || z?.lng || inputLng },
    boundary_geojson: boundary,
    _source: r ? (boundarySource === "realie" ? "realie" : "cross_referenced") : "zoneomics",
    _boundary_source: boundarySource,
    _acreage_match: acreageMatch,
    _acreage_realie: acreageRealie,
    _acreage_zoneomics: acreageZoneo,
    _acreage_delta_pct: acreageDeltaPct,
  };
}

// ─────────────────────── handler ───────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      lat,
      lng,
      address = null,
      enrich_depth = "full",
      include_skip_trace = false,
      tower_height_ft = 199,
    } = body;

    if (lat == null || lng == null) {
      return Response.json({ error: "lat and lng required" }, { status: 400 });
    }

    const realieKey = Deno.env.get("REALIE_API_KEY");
    const zoneoKey = Deno.env.get("ZONEOMICS_API_KEY");
    if (!realieKey || !zoneoKey) {
      return Response.json({ error: "REALIE_API_KEY or ZONEOMICS_API_KEY not set" }, { status: 500 });
    }

    const sources = { calls_made: [], calls_skipped: [], errors: [], fallbacks: [] };

    // ─── Stage 1: parallel Realie + Zoneomics ───
    const [realieRes, zoneoRes] = await Promise.all([
      fetchRealieParcel(lat, lng, realieKey).catch((e) => ({ error: e.message })),
      fetchZoneomics(lat, lng, zoneoKey).catch((e) => ({ error: e.message })),
    ]);
    sources.calls_made.push("realie", "zoneomics");
    if (realieRes?.error) sources.errors.push(`realie:${realieRes.error}`);
    if (zoneoRes?.error) sources.errors.push(`zoneomics:${zoneoRes.error}`);

    const parcel = mergeParcel(realieRes, zoneoRes, lat, lng, sources);

    const zoning = zoneoRes?.zoning
      ? { ...zoneoRes.zoning, _source: "zoneomics" }
      : { _source: "zoneomics", _error: "no_zoning_data" };

    // ─── Light depth: stop here ───
    if (enrich_depth === "light") {
      sources.calls_skipped.push("extractTelecomOrdinance", "jurisdiction_entity", "femaFloodLookup", "skipTrace");
      return Response.json({
        ok: true,
        lookup_id: `pfl_${new Date().toISOString()}`,
        enrich_depth: "light",
        input: { lat, lng, address },
        parcel,
        zoning,
        telecom_ordinance: null,
        planning_zoning_dept: null,
        fema: null,
        contact: { _status: "skipped" },
        _meta: { duration_ms: Date.now() - t0, ...sources },
      });
    }

    // ─── Stage 2: full enrichment in parallel ───
    const [ordRes, jurisRes, femaRes] = await Promise.all([
      // Telecom ordinance (fall zone, CUP/PE)
      base44.functions
        .invoke("extractTelecomOrdinance", { lat, lng, address: parcel.parcel_address })
        .then((r) => ({ ok: true, data: r.data }))
        .catch((e) => ({ ok: false, error: e.message })),

      // Jurisdiction entity lookup — use Zoneomics city_name as the match key
      (async () => {
        const cityName = zoneoRes?.raw?.meta?.city_name;
        if (!cityName) return { ok: false, error: "no_city_name" };
        try {
          const list = await base44.asServiceRole.entities.Jurisdiction.filter({});
          // Loose match: jurisdiction name contains the city
          const match = list.find((j) =>
            (j.name || "").toLowerCase().includes(cityName.toLowerCase())
          );
          return { ok: !!match, data: match || null };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      })(),

      // FEMA
      base44.functions
        .invoke("femaFloodLookup", { lat, lon: lng })
        .then((r) => ({ ok: true, data: r.data }))
        .catch((e) => ({ ok: false, error: e.message })),
    ]);

    sources.calls_made.push("extractTelecomOrdinance", "jurisdiction_entity", "femaFloodLookup");
    if (!ordRes.ok) sources.errors.push(`ordinance:${ordRes.error}`);
    if (!femaRes.ok) sources.errors.push(`fema:${femaRes.error}`);

    // ─── Fall zone resolution with fallback ───
    const ord = ordRes?.data || {};
    const ordinanceFallZone =
      ord.fall_zone_ft ||
      ord.fall_zone ||
      ord.telecom?.fall_zone_ft ||
      null;

    const fallZoneFt = ordinanceFallZone ?? tower_height_ft;
    const fallZoneSource = ordinanceFallZone ? "ordinance" : "default_1x_height";
    if (!ordinanceFallZone) {
      console.log(`[INFO] FALL_ZONE_FALLBACK: default_1x_height used (${tower_height_ft}ft) lat=${lat} lng=${lng}`);
      sources.fallbacks.push("fall_zone:default_1x_height");
    }

    const telecom_ordinance = {
      fall_zone_ft: fallZoneFt,
      fall_zone_source: fallZoneSource,
      fall_zone_evidence:
        ord.fall_zone_evidence || ord.telecom?.fall_zone_evidence || (ordinanceFallZone ? null : "No fall-zone clause found in local ordinance — using industry-standard 1× tower height as conservative default."),
      tower_height_max_ft: ord.max_tower_height_ft || ord.height_limit_ft || null,
      requires_cup: ord.requires_cup ?? null,
      requires_pe_letter: ord.requires_pe_letter ?? null,
      stealth_required: ord.stealth_required ?? null,
      ldc_section_reference: ord.ldc_section_reference || ord.section_reference || null,
      _source: "extractTelecomOrdinance",
    };

    // ─── P&Z dept contact ───
    const j = jurisRes?.data;
    const hasContact = j && (j.zoning_contact_name || j.zoning_contact_phone || j.zoning_contact_email);
    const planning_zoning_dept = hasContact
      ? {
          name: j.zoning_contact_name || j.zoning_jurisdiction || j.name,
          phone: j.zoning_contact_phone || null,
          address: j.zoning_jurisdiction || null,
          email: j.zoning_contact_email || null,
          contact_source: "jurisdiction_entity",
          _jurisdiction_id: j.id,
        }
      : {
          name: null,
          phone: null,
          address: null,
          email: null,
          contact_source: "missing",
          _jurisdiction_id: j?.id || null,
          _note: j ? "Jurisdiction matched but contact fields empty" : "No jurisdiction match — populate Jurisdiction entity to enable",
        };
    if (planning_zoning_dept.contact_source === "missing") {
      sources.fallbacks.push("pz_contact:missing");
    }

    // ─── FEMA ───
    const fema = femaRes.ok
      ? {
          risk_factor_letter: femaRes.data.fema_zone || null,
          zone_description: femaRes.data.fema_zone_description || null,
          risk_level: femaRes.data.fema_risk_level || null,
          sfha: femaRes.data.sfha ?? null,
          bfe_ft: femaRes.data.static_bfe ?? null,
          _source: "femaFloodLookup",
        }
      : { _source: "femaFloodLookup", _error: femaRes.error };

    // ─── Skip trace (gated) ───
    let contact = { _status: "skipped" };
    if (include_skip_trace && parcel.owner_name) {
      sources.calls_made.push("skipTrace");
      try {
        const st = await base44.functions.invoke("skipTrace", {
          owner_name: parcel.owner_name,
          mailing_address: parcel.owner_mailing_address,
        });
        const d = st.data || {};
        contact = {
          phone: d.phones?.[0]?.number || d.phone || null,
          phone_source: d.phones?.[0]?.source || d.phone_source || "Endato",
          email: d.emails?.[0]?.address || d.email || null,
          email_source: d.emails?.[0]?.source || d.email_source || "Endato",
          confidence_score: d.confidence_score || null,
          skip_traced_at: new Date().toISOString(),
          _status: d.phones?.length || d.emails?.length || d.phone || d.email ? "success" : "no_hit",
        };
      } catch (e) {
        sources.errors.push(`skipTrace:${e.message}`);
        contact = { _status: "error", _error: e.message };
      }
    } else {
      sources.calls_skipped.push("skipTrace");
    }

    return Response.json({
      ok: true,
      lookup_id: `pfl_${new Date().toISOString()}`,
      enrich_depth: "full",
      input: { lat, lng, address },
      parcel,
      zoning,
      telecom_ordinance,
      planning_zoning_dept,
      fema,
      contact,
      _meta: {
        duration_ms: Date.now() - t0,
        calls_made: sources.calls_made,
        calls_skipped: sources.calls_skipped,
        fallbacks: sources.fallbacks,
        errors: sources.errors,
      },
    });
  } catch (error) {
    console.log(`[ERROR] parcelFullLookup: ${error.message}`);
    return Response.json({ error: error.message, _meta: { duration_ms: Date.now() - t0 } }, { status: 500 });
  }
});