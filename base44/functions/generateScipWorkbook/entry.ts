// generateScipWorkbook — NEW SCIP 8.1.2026.
//
// Builds the downloadable SCIP workbook on the new EIGHT-PAGE template
// (replaces the legacy 138-row single-sheet SkyWave/Anthemnet layout):
//   Tab 1 — Property Data (SCIP) + SARF map
//   Tab 2 — Aerial & Topo · Tab 3 — FEMA & Zoning · Tab 4 — FLU & Wetlands
//   Tab 5 — Nearest Airport & Nearest Cell Tower · Tab 6 — Parcel & Wind Speed
//   Tab 7 — Map 2D & Viewshed · Tab 8 — Fiber Optics & Supplemental Exhibit
// The layout itself is rendered by the shared base44/shared/scipBookWorkbook
// module (also used by scipBookSheet for the live Google Sheet).
//
// INPUT (POST JSON) — one of:
//   { record }  — the assembled print record GenerateScipButton builds.
//   { scipId }  — a ScipRecord id. `record` wins if both sent.
// OUTPUT: { ok, filename, signed_url, bytes, images_embedded, images_missing }
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { renderBookWorkbook } from "../../shared/scipBookWorkbook.ts";
import { applyQcFills } from "../../shared/scipQcFields.ts";
import { supervisedResponse } from "../../shared/siteHawkSupervisor.ts";

// ── Small helpers ───────────────────────────────────────────────────────────
const tbd = (v: unknown, label = "TBD"): string => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s && !["none", "null", "nan", "{}", "undefined"].includes(s.toLowerCase()) ? s : label;
};

const fmtPhone = (p: unknown): string => {
  if (!p) return "";
  const d = String(p).replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p);
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// zoning_report rows on ScipRecord are { value, source, confidence } objects;
// the assembled print record uses plain strings. Accept either.
const zr = (v: unknown): string => {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return tbd((v as Record<string, unknown>).value);
  }
  return tbd(v);
};

const urlOf = (u: unknown): string =>
  typeof u === "string" ? u : ((u as Record<string, unknown>)?.url as string) || "";

const proximityCaption = (kind: string, item: Record<string, any> | null): string => {
  if (!item) return `Distance from Target A: No data available — RF Proximity analysis returned no ${kind.toLowerCase()} result.`;
  const name = tbd(item.name ?? item.airport_name ?? item.licensee ?? item.call_letters ?? item.site_name, kind);
  const distance = item.distance_label || [item.distance_miles != null ? `${item.distance_miles} mi` : "", item.distance_feet != null ? `${Number(item.distance_feet).toLocaleString("en-US")} ft` : ""].filter(Boolean).join(" / ");
  return distance
    ? `Distance from Target A to ${name}: ${distance} (straight-line). Source: RF Proximity analysis.`
    : `Distance from Target A to ${name}: No data available — RF Proximity analysis returned no distance.`;
};

// ── Normalize input → one internal shape ───────────────────────────────────
function normalize(src: Record<string, any>, fromEntity: boolean) {
  if (!fromEntity) {
    // Assembled print record (SiteHawkScipDoc shape).
    const maps = src.maps || {};
    const vs = src.viewshed || {};
    return {
      site: {
        name: src.site_name, lat: src.latitude, lon: src.longitude,
        radius: src.radius_miles ?? src.search_radius,
        sarfHeight: src.tower_height_ft ?? src.sarf_height,
        county: src.county, state: src.state,
        groundElevFt: src.center_amsl_ft ?? src.ground_elevation,
        submittal: src.generated_at ?? src.submittal_date,
      },
      agent: { name: src.agent_name, phone: src.agent_phone, email: src.agent_email },
      target: src.targetA || {},
      zoning: src.zoning || {},
      conditions: src.conditions || {},
      images: {
        sarf: urlOf(maps.sarf) || src.map_image_url,
        aerial: urlOf(maps.aerial), topo: urlOf(maps.topo), fema: urlOf(maps.fema),
        zoning: urlOf(maps.zoning), flum: urlOf(maps.flum), wetlands: urlOf(maps.wetlands),
        parcel: urlOf(maps.parcel), wind: urlOf(maps.wind), airport: urlOf(maps.airport),
        celltower: urlOf(maps.celltower),
        map2d: urlOf(maps.regional) || urlOf(maps.streets) || urlOf(maps.sarf),
        viewshed: urlOf(vs.aerial_ring_url),
        fiber: "",
      },
      qc: src.book_qc || {},
      extras: {
        taxesPaid: src.taxes_paid, conformingSize: src.conforming_size,
        parcelDims: src.parcel_dimensions, meetsLotReq: src.meets_min_lot,
        siteNotes: src.site_notes, compoundSize: src.compound_size, centerlines: src.centerlines,
        powerStr: src.power_provider_str, telcoStr: src.telco_provider_str,
        fiberStr: src.fiber_provider_str, airportStr: src.airport_str,
        airportCaption: proximityCaption("Airport", maps.airport && typeof maps.airport === "object" ? maps.airport : null),
        towerCaption: proximityCaption("Cell tower", maps.celltower && typeof maps.celltower === "object" ? maps.celltower : null),
        distanceFromCenter: src.distance_from_center,
      },
    };
  }

  // Raw ScipRecord entity.
  const idx = num(src.active_target_index) ?? 0;
  const t = (src.parcel_targets || [])[idx] || {};
  const hm = src.hawk_maps || {};
  const pam = src.power_airport_maps || {};
  const vs = src.viewshed || {};
  const rf = (src.rf_enrichment || {})[String(idx)] || {};
  const pwr = pam.power || {};
  const arpt = pam.airport || {};
  return {
    site: {
      name: src.site_name, lat: src.latitude, lon: src.longitude,
      radius: src.search_radius, sarfHeight: src.sarf_height,
      county: src.county, state: src.state,
      groundElevFt: hm.center_amsl_ft, submittal: src.submittal_date,
    },
    agent: { name: src.agent_name, phone: src.agent_phone, email: src.agent_email },
    target: t,
    zoning: { jurisdiction: src.zoning_jurisdiction, report: src.zoning_report || {}, district: hm.zone_code },
    conditions: src.existing_conditions || {},
    images: {
      sarf: src.map_image_url,
      aerial: hm.aerial_url, topo: hm.topography_url,
      fema: hm.floodplain_url, zoning: hm.zoning_url,
      flum: "", wetlands: "",
      airport: urlOf(rf?.rf?.airport?.map_url ?? rf?.rf?.airport?.url ?? arpt.map_url) || urlOf(arpt.url),
      celltower: urlOf(rf?.rf?.tower?.map_url ?? rf?.rf?.tower?.url),
      parcel: "", wind: "",
      map2d: src.map_image_url, viewshed: vs.aerial_ring_url || "",
      fiber: urlOf(rf?.coverage?.png_url),
    },
    qc: src.book_qc || {},
    extras: {
      powerStr: pwr.name ? `${pwr.name}${pwr.phone ? " | " + fmtPhone(pwr.phone) : ""}` : "",
      airportStr: arpt.name ? `${arpt.name}${arpt.distance_miles ? ` (${arpt.distance_miles} mi)` : ""}` : "",
      airportCaption: proximityCaption("Airport", rf?.rf?.airport || arpt || null),
      towerCaption: proximityCaption("Cell tower", rf?.rf?.tower || null),
    },
  };
}

// ── Page 1 sections (NEW SCIP 8.1.2026 property sheet) ──────────────────────
function buildSections(n: ReturnType<typeof normalize>) {
  const { site, agent, target: t, zoning: z, conditions: c, extras: x } = n as any;
  const rep = (z.report || z) as Record<string, unknown>;
  const lat = num(site.lat), lon = num(site.lon);
  const latS = lat !== null ? lat.toFixed(6) : "";
  const lonS = lon !== null ? lon.toFixed(6) : "";
  const county = tbd(t.county ?? site.county);
  const state = tbd(site.state, "");
  const zoningCode = tbd(t.zoning_classification ?? z.district);
  const today = new Date(site.submittal || Date.now()).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const sarfH = site.sarfHeight ? `${site.sarfHeight}'` : "TBD";
  const row = (label: string, value: string) => ({ label, value });

  return [
    { title: "SITE ACQUISITION", rows: [
      row("Agent Name", tbd(agent.name)),
      row("Agent Phone", fmtPhone(agent.phone) || "TBD"),
      row("Agent E-mail", tbd(agent.email)),
      row("Submittal Date", today),
    ]},
    { title: "SEARCH RING INFORMATION", rows: [
      row("Site Name", tbd(site.name)),
      row("Latitude", latS),
      row("Longitude", lonS),
      row("Search Radius", site.radius ? `${site.radius} mi` : "TBD"),
      row("SARF Height", sarfH),
    ]},
    { title: "PROJECT INFORMATION", rows: [
      row("Tower Type", tbd(zr(rep["tower_type"]))),
      row("Tower Height", sarfH),
      row("Centerlines available", tbd(x.centerlines)),
      row("Ground Elevation", site.groundElevFt ? `${Math.round(Number(site.groundElevFt))}' AMSL (USGS 3DEP)` : "TBD — USGS"),
      row("Compound Size (S.F. & dimensions)", tbd(x.compoundSize ?? zr(rep["compound_size"]))),
      row("Latitude", tbd(num(t.latitude)?.toFixed(6), latS)),
      row("Longitude", tbd(num(t.longitude)?.toFixed(6), lonS)),
      row("Distance from Search Ring Center", tbd(x.distanceFromCenter)),
    ]},
    { title: "SITE INFORMATION (from Property Appraiser's Office)", rows: [
      row("Parcel County", county),
      row("Parcel ID Number", tbd(t.apn)),
      row("Owner Name (on Deed)", tbd(t.owner_name)),
      row("Parcel Street Address", tbd(t.parcel_address)),
      row("Parcel City", tbd(t.parcel_city ?? t.city, "No data available — Realie")),
      row("Parcel State", state || "TBD"),
      row("Parcel Zip", tbd(t.parcel_zip)),
      row("Parcel Size (acres, MOL)", t.acreage ? `${t.acreage} ac` : "TBD"),
      row("Parcel Dimensions (feet)", tbd(t.boundaries ?? x.parcelDims, "TBD — verify survey")),
      row("Conforming Size?", tbd(x.conformingSize)),
      row("Taxes Paid-to-Date?", tbd(x.taxesPaid, "TBD — verify PA")),
    ]},
    { title: "OWNER INFORMATION", rows: [
      row("Name(s)", tbd(t.owner_name)),
      row("Contact Person", tbd(t.contact_person, "TBD — skip-trace required")),
      row("Mailing Address", tbd(t.mailing_address)),
      row("E-mail Address", tbd(t.owner_email, "TBD — skip-trace required")),
      row("Phone Number", tbd(fmtPhone(t.owner_phone), "TBD — skip-trace required")),
    ]},
    { title: "EXISTING CONDITIONS", rows: [
      row("Flood Zone(s)", tbd(c.flood_zone ?? t.fema_risk_factor, "TBD — See FEMA FIRM Map")),
      row("Wetland Concerns?", tbd(c.wetland_concerns ?? c.wetlands)),
      row("Water Management District", tbd(c.water_management_district)),
      row("Hazardous Waste Concerns?", tbd(c.hazardous_waste)),
      row("Access Notes (ROW, driveway, code)", tbd(c.access_notes, "TBD — verify driveway permit requirements")),
      row("Power Provider (name & phone)", tbd(x.powerStr ?? c.power_provider)),
      row("Fiber Available?", tbd(x.fiberStr ?? c.fiber, "TBD — verify with county")),
      row("Telco Provider (name & phone)", tbd(x.telcoStr ?? c.telco_provider)),
      row("Nearest Airport (name & distance)", tbd(x.airportStr ?? c.airport)),
      row("Local Police (municipality & phone)", tbd(c.local_police)),
      row("Local Fire Dept (municipality & phone)", tbd(c.local_fire)),
    ]},
    { title: "SITE NOTES", rows: [
      row("Site development concerns (terrain, foliage, obstructions, generators or microwaves prohibited)",
        tbd(x.siteNotes)),
    ]},
    { title: "ZONING OVERVIEW", rows: [
      row("Zoning Jurisdiction", tbd(z.jurisdiction)),
      row("Zoning Contact Information", tbd(zr(rep["zoning_contact"] ?? rep["contact"]), "TBD — contact county planning dept")),
      row("Zoning Process", zr(rep["zoning_process"] ?? rep["process"])),
      row("Zoning Fees", zr(rep["zoning_fees"] ?? rep["fees"])),
      row("Zoning Approval Timeframe", zr(rep["zoning_timeframe"] ?? rep["timeframe"])),
      row("Property Zoning District Classification", zoningCode),
      row("Meets minimum lot requirements?", tbd(x.meetsLotReq ?? zr(rep["meets_min_lot"]))),
    ]},
    { title: "TOWER SPECIFICS", rows: [
      row("LDC Section Reference(s)", zr(rep["ldc_section"] ?? rep["ldc_reference"])),
      row("Maximum Tower Height", zr(rep["max_height_ft"] ?? rep["max_height"])),
      row("Stealth Required?", zr(rep["stealth_required"] ?? rep["stealth"])),
      row("Required Collocations (#)", zr(rep["collocation_required"] ?? rep["collocations"])),
      row("Residential Separation (ft or %)", zr(rep["residential_separation_ft"] ?? rep["residential_separation"])),
      row("Tower Separation (ft or %)", zr(rep["tower_separation_ft"] ?? rep["tower_separation"])),
      row("Measured from base or center", zr(rep["measured_from"])),
      row("Fall Zone Requirements", zr(rep["fall_zone_ft"] ?? rep["fall_zone"])),
      row("Special Tower Landscaping?", zr(rep["landscaping"])),
    ]},
    { title: "SITE PLAN OVERVIEW", rows: [
      row("Site Plan Jurisdiction", tbd(zr(rep["site_plan_jurisdiction"]), county)),
      row("Site Plan Contact Information", tbd(zr(rep["site_plan_contact"]), "TBD — contact planning dept")),
      row("Site Plan Fees", zr(rep["site_plan_fees"])),
      row("Timeframe for approval", zr(rep["site_plan_timeframe"])),
      row("Existing Site Plan to Amend?", zr(rep["site_plan_amend"])),
      row("Concurrent to Zoning or BP?", zr(rep["site_plan_concurrent"])),
      row("Submittal deadlines?", zr(rep["site_plan_deadlines"])),
      row("Electronic, hard copy, or both?", tbd(zr(rep["site_plan_format"]), "TBD — verify with jurisdiction")),
    ]},
    { title: "SITE PLAN FILING DOCUMENTS", rows: [
      row("Site plan concerns, fees, etc.", tbd(zr(rep["site_plan_notes"]), "See jurisdiction for site plan requirements.")),
    ]},
    { title: "BUILDING PERMIT INFORMATION", rows: [
      row("Building Permit Jurisdiction", tbd(zr(rep["bp_jurisdiction"]), county)),
      row("Building Department Contact Info", tbd(zr(rep["bp_contact"]), "TBD — contact building dept")),
      row("Does GC have to submit?", zr(rep["bp_gc_required"])),
      row("Building Permit Fees", zr(rep["bp_fees"])),
      row("Building Permit Timeframe", zr(rep["bp_timeframe"])),
      row("Bond Required?", zr(rep["bp_bond_required"])),
      row("E911 Address assigned?", zr(rep["bp_e911"])),
    ]},
    { title: "BUILDING PERMIT NOTES", rows: [
      row("When does the building permit expire once it's been pulled", tbd(zr(rep["bp_notes"]), "See jurisdiction for building permit requirements.")),
    ]},
  ];
}

// ── Pages 2–8 (paired map exhibits, NEW SCIP 8.1.2026) ──────────────────────
function buildMapPages(n: ReturnType<typeof normalize>) {
  const images = n.images as Record<string, string>;
  const extras = n.extras as Record<string, string>;
  const slot = (label: string, key: string, caption: string) => ({ label, url: images[key] || null, caption });
  return [
    { title: "AERIAL MAP & TOPO MAP", slots: [
      slot("AERIAL MAP", "aerial", "High-resolution aerial / satellite view of the candidate parcel, access route, and surrounding land uses."),
      slot("TOPO MAP", "topo", "USGS topographic map showing ground elevations, contours, and terrain affecting siting and access."),
    ]},
    { title: "FEMA MAP & ZONING MAP", slots: [
      slot("FEMA MAP", "fema", "FEMA Flood Insurance Rate Map (FIRM) panel showing flood zone designations at the candidate site."),
      slot("ZONING MAP", "zoning", "Official zoning map of the governing jurisdiction showing the parcel's zoning district classification."),
    ]},
    { title: "FLU MAP & WETLANDS MAP", slots: [
      slot("FLU MAP", "flum", "Comprehensive plan Future Land Use (FLU) map showing the long-range land use designation of the parcel."),
      slot("WETLANDS MAP", "wetlands", "National Wetlands Inventory (USFWS) map showing mapped wetlands and surface waters on or near the parcel."),
    ]},
    { title: "NEAREST AIRPORT & NEAREST CELL TOWER MAP", slots: [
      slot("NEAREST AIRPORT MAP", "airport", extras.airportCaption),
      slot("NEAREST CELL TOWER MAP", "celltower", extras.towerCaption),
    ]},
    { title: "PARCEL MAP & WIND SPEED MAP", slots: [
      slot("PARCEL MAP", "parcel", "County property appraiser parcel map showing boundaries, dimensions, parcel ID, and adjacent tracts."),
      slot("WIND SPEED MAP", "wind", "ASCE 7 basic wind speed map for the site location — basis for tower structural design requirements."),
    ]},
    { title: "MAP 2D & VIEWSHED MAP", slots: [
      slot("MAP 2D", "map2d", "SiteHawk-generated 2D site map — candidate point, search ring, access, and proposed compound layout."),
      slot("VIEWSHED MAP", "viewshed", "Viewshed (line-of-sight) analysis showing areas with potential visibility of the proposed tower."),
    ]},
    { title: "FIBER OPTICS MAP & SUPPLEMENTAL EXHIBIT", slots: [
      slot("FIBER OPTICS MAP", "fiber", "Fiber optic routes nearest to the candidate — backhaul availability and distance-to-fiber."),
      slot("SUPPLEMENTAL EXHIBIT (OPTIONAL)", "supplemental", "Reserved frame for an additional exhibit (second fiber view, carrier map, or close-up) if required."),
    ]},
  ];
}

// ── HTTP handler ─────────────────────────────────────────────────────────────
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    if (!(await base44.auth.isAuthenticated())) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) ?? {};
    let normalized;
    if (body.record && typeof body.record === "object") {
      normalized = normalize(body.record, false);
    } else if (body.scipId) {
      const rec = await base44.entities.ScipRecord.get(String(body.scipId));
      if (!rec) return Response.json({ error: "ScipRecord not found" }, { status: 404 });
      if (!rec.book_qc?.print_ready) {
        return Response.json({ error: "Gemini QC is not complete; printing remains locked" }, { status: 409 });
      }
      normalized = normalize(rec, true);
    } else {
      return Response.json({ error: "Provide { record } or { scipId }" }, { status: 400 });
    }

    const images = normalized.images as Record<string, string>;
    const { bytes, embedded, missing } = await renderBookWorkbook({
      sections: applyQcFills(buildSections(normalized), normalized.qc?.filled || {}),
      mapPages: buildMapPages(normalized),
      sarfUrl: images.sarf || null,
    });

    const siteName = String((normalized.site as any).name || "Site")
      .replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Site";
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `${siteName}_SCIP_${stamp}.xlsx`;

    const file = new File([bytes], filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri });

    const proposedResult = {
      ok: true, filename, signed_url,
      bytes: bytes.byteLength,
      images_embedded: embedded, images_missing: missing,
    };
    return await supervisedResponse({
      original_user_request: 'Generate the requested SiteHawk SCIP workbook.',
      proposed_action: 'Release the private signed download for the generated SCIP workbook.',
      supporting_evidence: { normalized_record: normalized, images_embedded: embedded, images_missing: missing },
      risk_level: 'high',
    }, proposedResult);
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}