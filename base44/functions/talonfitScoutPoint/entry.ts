import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { lookupNotionOrdinance } from '../../shared/notionOrdinanceLookup.ts';

/**
 * talonfitScoutPoint — TalonFit® live-point screen.
 *
 * Given a clicked coordinate it pulls the parcel from Realie (boundaries, APN,
 * owner, zoning classification) and the governing telecom-tower ordinance from
 * the Notion-backed zoning-lookup service, then grades the point:
 *   green  → max allowable tower height at that exact spot
 *   red    → EJECTED + the binding reason
 *   amber  → VERIFY (ordinance language missing/unclear — never a false green)
 * Nothing is fabricated: absent inputs are reported as unverified.
 */
const REALIE_LOCATION = "https://app.realie.ai/api/public/property/location/";
const ZONING_LOOKUP_URL = "https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/zoning-lookup";
const MACRO_FLOOR_FT = 100;

const FT_PER_DEG_LAT = 364000;

function toFeet(lat0: number, lon: number, lat: number) {
  const ftPerDegLon = FT_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
  return { x: lon * ftPerDegLon, y: lat * FT_PER_DEG_LAT };
}

function rings(geometry: any): number[][][] {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function pointInRing(px: number, py: number, ring: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p: any, a: any, b: any) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

// Returns { inParcel, edgeDistFt } for the clicked point against parcel geometry.
function parcelGeometryCheck(geometry: any, lat: number, lon: number) {
  const polys = rings(geometry);
  if (!polys.length) return null;
  const p = toFeet(lat, lon, lat);
  let inParcel = false;
  let edgeDist = Infinity;
  polys.forEach((ring, idx) => {
    const pts = ring.map(([rlon, rlat]) => toFeet(lat, rlon, rlat));
    if (idx === 0 && pointInRing(p.x, p.y, pts)) inParcel = true;
    for (let i = 0; i < pts.length - 1; i++) {
      edgeDist = Math.min(edgeDist, distToSegment(p, pts[i], pts[i + 1]));
    }
  });
  return { inParcel, edgeDistFt: Number.isFinite(edgeDist) ? Math.round(edgeDist) : null };
}

async function realieAtPoint(lat: number, lon: number, apiKey: string) {
  const url = `${REALIE_LOCATION}?${new URLSearchParams({
    latitude: String(lat), longitude: String(lon), radius: "0.15", limit: "1",
    includeUnassignedAddress: "true",
  })}`;
  const r = await fetch(url, { headers: { Authorization: apiKey } });
  if (!r.ok) { console.error("Realie HTTP", r.status); return null; }
  const data = await r.json().catch(() => null);
  const p = data?.property || (Array.isArray(data?.properties) ? data.properties[0] : null);
  if (!p) return null;
  return {
    address: p.address || p.fullAddress || p.situsAddress || null,
    apn: p.parcelId || p.parcelNumber || p.apn || null,
    owner: p.ownerName || p.owner || null,
    acreage: p.lotSizeAcres ?? p.acres ?? p.acreage ?? null,
    zoning: p.zoningCode || p.zoning || null,
    land_use: p.useDescription || null,
    county: p.county || null,
    city: p.city || p.situsCity || null,
    state: p.state || null,
    geometry: p.geometry || null,
  };
}

async function ordinanceAtPoint(lat: number, lon: number) {
  const r = await fetch(`${ZONING_LOOKUP_URL}?lat=${lat}&lon=${lon}`);
  if (!r.ok) { console.error("zoning-lookup HTTP", r.status); return null; }
  const d = await r.json().catch(() => null);
  const o = d?.ordinance;
  if (!o) return {
    jurisdiction: [d?.city || d?.county, d?.state].filter(Boolean).join(", ") || null,
    city: d?.city || null, county: d?.county || null, state: d?.state || null,
    missing: true,
  };
  return {
    city: d?.city || null, county: d?.county || null, state: d?.state || null,
    jurisdiction: o.jurisdiction || [d?.city || d?.county, d?.state].filter(Boolean).join(", ") || null,
    height_limit_ft: o.max_tower_height_ft ?? null,
    setback_ft: o.setback_ft ?? null,
    fall_zone_ft: o.fall_zone_ft ?? null,
    allowable_zones: o.allowable_zones || [],
    pe_fall_zone_allowed: o.pe_fall_zone_allowed ?? null,
    permit_type: o.permit_type || null,
    section_ref: o.ldc_display || o.section_ref || null,
    summary: o.ordinance_summary || null,
    missing: false,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, has_pe_letter: hasPeLetter } = await req.json().catch(() => ({}));
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }
    const apiKey = Deno.env.get("REALIE_API_KEY");
    if (!apiKey) return Response.json({ error: "REALIE_API_KEY not set" }, { status: 500 });

    let ordinance;
    const [parcel, ordinanceInitial] = await Promise.all([
      realieAtPoint(Number(lat), Number(lon), apiKey),
      ordinanceAtPoint(Number(lat), Number(lon)),
    ]);
    ordinance = ordinanceInitial;

    // Notion zoning knowledge base — fill ordinance gaps from the archived
    // "{Jurisdiction}, {ST} — Telecom Ordinance" page. Notion never overrides a
    // value the primary registry already has; it only fills what's missing.
    const needsNotion = !ordinance || ordinance.missing ||
      ordinance.height_limit_ft == null || ordinance.setback_ft == null || ordinance.fall_zone_ft == null;
    if (needsNotion) {
      const jur = ordinance?.city || ordinance?.county || parcel?.city || parcel?.county || null;
      const st = ordinance?.state || parcel?.state || null;
      if (jur && st) {
        try {
          const { accessToken } = await base44.asServiceRole.connectors.getConnection("notion");
          const notion = accessToken ? await lookupNotionOrdinance(accessToken, jur, st) : null;
          if (notion) {
            const merged = ordinance && !ordinance.missing ? ordinance : {
              jurisdiction: `${jur}, ${st}`, allowable_zones: [], pe_fall_zone_allowed: null,
              permit_type: null, missing: false,
            };
            if (merged.height_limit_ft == null && notion.height_limit_ft != null) merged.height_limit_ft = notion.height_limit_ft;
            if (merged.setback_ft == null && notion.setback_ft != null) merged.setback_ft = notion.setback_ft;
            if (merged.fall_zone_ft == null && notion.fall_zone_ft != null) merged.fall_zone_ft = notion.fall_zone_ft;
            if (!merged.section_ref && notion.section_ref) merged.section_ref = notion.section_ref;
            if (!merged.summary && notion.summary) merged.summary = notion.summary;
            merged.notion_page_url = notion.page_url;
            merged.source = merged.source ? `${merged.source} + Notion` : "Notion zoning KB";
            ordinance = merged;
          }
        } catch (e) {
          console.warn("Notion ordinance lookup skipped:", e?.message || String(e));
        }
      }
    }

    const unverified: string[] = [];
    if (!parcel) unverified.push("parcel");
    if (!parcel?.zoning) unverified.push("zoning_code");
    if (!ordinance || ordinance.missing) unverified.push("ordinance");

    // ── Grade the point ──────────────────────────────────────────────────────
    let verdict = "fit";
    let reason: string | null = null;
    let maxHeightFt: number | null = null;
    let binding: string | null = null;

    const geo = parcel?.geometry ? parcelGeometryCheck(parcel.geometry, Number(lat), Number(lon)) : null;
    const cap = ordinance?.height_limit_ft ?? null;
    const setback = ordinance?.setback_ft ?? 0;

    if (!parcel) {
      verdict = "ejected";
      reason = "No parcel record found at this coordinate — nothing to site on.";
    } else if (geo && geo.inParcel === false) {
      verdict = "ejected";
      reason = "Point falls outside the parcel boundary (ERR_EXT_P).";
    } else if (ordinance?.allowable_zones?.length && parcel.zoning &&
               !ordinance.allowable_zones.some((z: string) => String(z).toUpperCase() === String(parcel.zoning).toUpperCase())) {
      verdict = "ejected";
      reason = `Zoning ${parcel.zoning} is not a permitted tower district (allowed: ${ordinance.allowable_zones.join(", ")}).`;
    } else if (geo?.edgeDistFt != null) {
      const clear = geo.edgeDistFt - setback;
      if (clear <= 0) {
        verdict = "ejected";
        reason = `Only ${geo.edgeDistFt} ft to the nearest property line — inside the ${setback} ft required setback (ERR_STBK).`;
      } else if (ordinance?.fall_zone_ft != null) {
        // A PE-certified engineered fall zone halves the required radius.
        const required = hasPeLetter ? Math.round(ordinance.fall_zone_ft / 2) : ordinance.fall_zone_ft;
        if (clear < required) {
          verdict = "ejected";
          reason = `Fall zone of ${required} ft${hasPeLetter ? " (PE-engineered)" : ""} spills over the property line — only ${clear} ft of clearance (ERR_FZ_S).`;
        } else {
          maxHeightFt = cap;
          binding = cap != null ? "Ordinance height cap" : null;
        }
      } else {
        // Standard 100%-of-height fall zone (50% with a PE letter): height ≤ clearance.
        const fzHeight = hasPeLetter ? clear * 2 : clear;
        maxHeightFt = cap != null ? Math.min(cap, fzHeight) : fzHeight;
        binding = cap != null && cap <= fzHeight
          ? "Ordinance height cap"
          : `Fall-zone clearance to property line${hasPeLetter ? " (PE-engineered 50%)" : ""}`;
      }
      if (verdict === "fit" && maxHeightFt != null && maxHeightFt < MACRO_FLOOR_FT) {
        verdict = "ejected";
        reason = `Max buildable height only ${Math.round(maxHeightFt)} ft — below the ${MACRO_FLOOR_FT} ft macro-viability floor (ERR_H_MIN).`;
      }
    } else {
      verdict = "verify";
      reason = "No parcel boundary geometry available — fall zone and setbacks cannot be measured at this point.";
    }

    if (verdict === "fit" && (!ordinance || ordinance.missing || maxHeightFt == null)) {
      verdict = "verify";
      reason = "Ordinance height/fall-zone language not on file for this jurisdiction — verify with the jurisdiction before relying on this point.";
    }

    return Response.json({
      lat: Number(lat), lon: Number(lon),
      parcel, ordinance,
      edge_distance_ft: geo?.edgeDistFt ?? null,
      verdict,
      reason,
      max_height_ft: maxHeightFt != null ? Math.round(maxHeightFt) : null,
      binding_constraint: binding,
      pe_letter_applied: !!hasPeLetter,
      unverified_fields: unverified,
      screened_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("talonfitScoutPoint error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});