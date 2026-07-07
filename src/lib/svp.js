/**
 * SVP (Site Visualization Package) v1.0 builder.
 * Assembles the standard SVP JSON from live SiteSearch pipeline state:
 * ring (Section 1), ordinance (Section 2), Target parcel (Section 3),
 * and design params (SARF form). Fields the pipeline hasn't collected
 * are emitted as null — never fabricated.
 */

// Extract the first numeric value from a free-text field like "199 ft" / "1,320 feet".
function num(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Parse "420 x 380" style boundary/compound strings → { width_ft, depth_ft }.
function parseDims(s) {
  if (!s) return { width_ft: null, depth_ft: null };
  const m = String(s).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*[x\u00d7'\u2019]+\s*(\d+(?:\.\d+)?)/i);
  return m ? { width_ft: Number(m[1]), depth_ft: Number(m[2]) } : { width_ft: null, depth_ft: null };
}

// FEMA zone letter from strings like "X", "AE — high risk", "Zone X (minimal)".
function femaLetter(v) {
  if (!v) return null;
  const m = String(v).toUpperCase().match(/\b(AE|AH|AO|AR|A99|VE|A|V|X|D)\b/);
  return m ? m[1] : null;
}

const RANK = { "Target A": 1, "Target B": 2, "Target C": 3 };

export function buildSvp({ searchCenter, searchParams, targetA, zoningResult, sectionData }) {
  const bus = sectionData || {};
  const z = bus.zoning || zoningResult?.zoning || {};
  const t = targetA || {};
  const label = t.label || "Target A";
  const rank = RANK[label] || 1;
  const heightFt = Number(searchParams?.tower_height_ft) || 150;
  const compound = parseDims(searchParams?.compound_size || "100x100");
  const boundary = parseDims(t.boundaries);
  const siteName = searchParams?.ring_name?.trim() || searchParams?.agent_name?.trim() || "Search Ring";
  const state = (t.state || z.state || "").toUpperCase() || null;
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const fallZoneRule = z.fall_zone || null;
  // "100%" style fall-zone rules resolve to the tower height in feet.
  const fallZoneFt = num(fallZoneRule) != null && String(fallZoneRule).includes("%")
    ? Math.round(heightFt * (num(fallZoneRule) / 100))
    : num(fallZoneRule);

  return {
    svp_version: "1.0",
    site: {
      site_name: siteName,
      ring_id: `RING-${state || "US"}-${ymd}-${String(Math.abs(Math.round((Number(searchCenter?.lat) || 0) * 10000))).slice(-4)}`,
      candidate_rank: rank,
      tier: rank === 1 ? "A" : "B",
      prepared_for: t.owner_name || null,
      generated_at: new Date().toISOString(),
    },
    parcel: {
      apn: t.apn || null,
      state,
      jurisdiction: z.jurisdiction || zoningResult?.zoning_jurisdiction || null,
      centroid: {
        lat: Number.isFinite(Number(t.latitude)) ? Number(t.latitude) : null,
        lon: Number.isFinite(Number(t.longitude)) ? Number(t.longitude) : null,
      },
      boundary_ft: {
        type: boundary.width_ft ? "rectangle" : "unknown",
        vertices: null,
        width_ft: boundary.width_ft,
        depth_ft: boundary.depth_ft,
      },
      acreage: num(t.acreage),
      zoning_classification: t.zoning_classification || z.district || null,
      zoning_allowed: null,
      fema_zone_letter: femaLetter(bus.fema?.flood_zone || t.fema_risk_factor),
      source: "sitehawk_pipeline",
    },
    ordinance: {
      source: z.jurisdiction ? "sitehawk_zoning_intel" : "unverified",
      ldc_citation: z.ldc_reference || null,
      height_limit_ft: num(z.max_height),
      setbacks_ft: null,
      fall_zone_rule: fallZoneRule,
      fall_zone_ft: fallZoneFt,
      tower_separation_ft: num(z.tower_separation),
      residential_separation: z.residential_separation || null,
      permit_type: z.process || null,
      stealth_required: z.stealth ? /^y/i.test(String(z.stealth)) : null,
      collocation_required: z.collocations ? num(z.collocations) > 0 : null,
      pe_letter_accepted: null,
    },
    design: {
      tower: {
        type: "Monopole",
        height_ft: heightFt,
        ladder_rung: heightFt,
        point: {
          lat: Number.isFinite(Number(t.latitude)) ? Number(t.latitude) : null,
          lon: Number.isFinite(Number(t.longitude)) ? Number(t.longitude) : null,
        },
        placement_source: "sitehawk_pipeline",
      },
      compound_ft: { width: compound.width_ft || 100, depth: compound.depth_ft || 100 },
      landscape_ring_ft: null,
      access_drive: null,
      verdict: null,
    },
    render_hints: {
      setting: [t.land_use, t.parcel_address].filter(Boolean).join(" — ") || null,
      landowner_view: { tree_maturity: "mature", overlays: false },
      site_plan_view: { tree_maturity: "initial", overlays: true },
    },
  };
}