// generateScipWorkbook — Phase 1 of the in-app SCIP document engine.
//
// Ports the canonical SkyWave/Anthemnet 138-row SCIP xlsx template (FF628C83
// sage-green headers, Calibri, col A 33.43 / col B 56.71, image rows at
// 380pt / SARF at 420pt) into a Base44 backend function using ExcelJS.
//
// INPUT (POST JSON) — one of:
//   { record }  — the assembled print record GenerateScipButton builds from
//                 live pipeline state (site/agent/targetA/zoning/maps/conditions).
//   { scipId }  — a ScipRecord id; the function loads it and adapts its fields
//                 into the same internal shape. `record` wins if both sent.
//
// OUTPUT: { ok, filename, signed_url, bytes, images_embedded, images_missing }
//   The workbook is stored as a PRIVATE file (owner PII inside) and returned
//   as a time-limited signed URL — never a public file_url.
//
// NOTE: This function is intentionally not wired to any UI yet (Turtle Up).
// Wiring lands in GenerateScipButton after Tom approves a sample output.

import ExcelJS from "npm:exceljs@4.4.0";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ── Template constants (ported 1:1 from scip_generator.py) ─────────────────
const HEADER_GREEN = "FF628C83"; // signature Anthemnet sage/teal green
const DARK_TEXT = "FF1A1A1A";
const FONT = "Calibri";
const COL_A_WIDTH = 33.42578125;
const COL_B_WIDTH = 56.7109375;

const ROW_HEIGHTS: Record<number, number> = {
  1: 51.0, 6: 15.75, 12: 15.75, 14: 420.0, 23: 15.75, 29: 15.75, 35: 15.75,
  41: 15.75, 50: 15.75, 52: 45.75, 54: 15.75, 55: 15.75, 56: 15.75,
  57: 380.0, 58: 380.0, 59: 380.0, 60: 380.0, 61: 380.0, 62: 380.0,
  63: 380.0, 64: 380.0, 65: 380.0, 66: 380.0, 78: 15.75, 80: 75.75,
  82: 380.0, 83: 380.0, 84: 380.0, 85: 380.0, 86: 380.0, 87: 380.0,
  88: 380.0, 89: 380.0, 90: 380.0, 100: 15.75, 101: 15.75, 112: 30.75,
  121: 15.75, 123: 30.75, 131: 15.75, 132: 15.75, 133: 30.75, 134: 15.75,
  138: 15.75,
};

const SECTION_HEADER_ROWS = new Set([
  2, 7, 13, 15, 24, 36, 42, 51, 53, 55, 67, 79, 81,
  91, 101, 111, 113, 122, 124, 132, 134,
]);

// Image slots: template row → key into the resolved image-URL map.
const IMAGE_ROWS: Record<number, string> = {
  14: "sarf",
  57: "overhead", 58: "vs_north", 59: "vs_south", 60: "vs_east", 61: "vs_west",
  62: "access_row", 63: "access_road", 64: "power", 65: "telco", 66: "sketch",
  82: "aerial", 83: "topo", 84: "fema", 85: "zoning", 86: "flum",
  87: "wetlands", 88: "parcel", 89: "wind", 90: "airport",
};

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

// ── Normalize input → one internal shape ───────────────────────────────────
// Accepts the GenerateScipButton print record OR a raw ScipRecord entity and
// produces { site, agent, target, zoning, conditions, images, deed }.
function normalize(src: Record<string, any>, fromEntity: boolean) {
  if (!fromEntity) {
    // Assembled print record (SiteHawkScipDoc shape).
    const maps = src.maps || {};
    const vs = src.viewshed || {};
    const dirs: Record<string, string> = {};
    for (const d of vs.directions || []) {
      const key = "vs_" + String(d.short || d.label || "").trim().charAt(0).toLowerCase();
      if (d.map_url) dirs[{ n: "vs_north", s: "vs_south", e: "vs_east", w: "vs_west" }[key.slice(3)] || key] = d.map_url;
    }
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
        overhead: urlOf(vs.aerial_ring_url) || urlOf(maps.aerial),
        ...dirs,
        power: urlOf(maps.power), telco: urlOf(maps.telco),
        access_row: urlOf(maps.access_row), access_road: urlOf(maps.access_road),
        sketch: urlOf(maps.sketch),
        aerial: urlOf(maps.aerial), topo: urlOf(maps.topo), fema: urlOf(maps.fema),
        zoning: urlOf(maps.zoning), flum: urlOf(maps.flum), wetlands: urlOf(maps.wetlands),
        parcel: urlOf(maps.parcel), wind: urlOf(maps.wind), airport: urlOf(maps.airport),
      },
      extras: {
        taxesPaid: src.taxes_paid, conformingSize: src.conforming_size,
        parcelDims: src.parcel_dimensions, meetsLotReq: src.meets_lot_req,
        landownerNotes: src.landowner_notes, siteNotes: src.site_notes,
        directions: src.directions_to_site,
        powerStr: src.power_provider_str, telcoStr: src.telco_provider_str,
        fiberStr: src.fiber_provider_str, airportStr: src.airport_str,
        distanceFromCenter: src.distance_from_center,
      },
      deed: src.deed || src.transfers || null,
    };
  }

  // Raw ScipRecord entity.
  const idx = num(src.active_target_index) ?? 0;
  const t = (src.parcel_targets || [])[idx] || {};
  const hm = src.hawk_maps || {};
  const pam = src.power_airport_maps || {};
  const vs = src.viewshed || {};
  const zRep = src.zoning_report || {};
  const dirs: Record<string, string> = {};
  for (const d of vs.directions || []) {
    const s = String(d.short || "").toUpperCase();
    const key = { N: "vs_north", S: "vs_south", E: "vs_east", W: "vs_west" }[s];
    if (key && d.map_url) dirs[key] = d.map_url;
  }
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
    zoning: { jurisdiction: src.zoning_jurisdiction, report: zRep, district: hm.zone_code },
    conditions: src.existing_conditions || {},
    images: {
      sarf: src.map_image_url,
      overhead: vs.aerial_ring_url || hm.aerial_url,
      ...dirs,
      power: urlOf(pwr.map_url ?? pwr.url), airport: urlOf(arpt.map_url ?? arpt.url),
      aerial: hm.aerial_url, topo: hm.topography_url,
      fema: hm.floodplain_url, zoning: hm.zoning_url,
    },
    extras: {
      powerStr: pwr.name ? `⚡ ${pwr.name}${pwr.phone ? " | " + fmtPhone(pwr.phone) : ""}` : "",
      airportStr: arpt.name ? `${arpt.name}${arpt.distance_miles ? ` (${arpt.distance_miles} mi)` : ""}` : "",
    },
    deed: null,
  };
}

// ── The 138-row map (ported 1:1; icons preserved) ───────────────────────────
function buildRows(n: ReturnType<typeof normalize>): Record<number, [string, string]> {
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
  const fz = tbd(c.flood_zone ?? t.fema_risk_factor, "TBD — See FEMA FIRM Map");

  return {
    1: ["SITEHAWK", "SITE CANDIDATE INFORMATION PACKAGE"],
    2: ["SITE ACQUISITION", ""],
    3: ["  👤 Agent Name", tbd(agent.name)],
    4: ["  📞 Agent Phone", fmtPhone(agent.phone) || "TBD"],
    5: ["  📧 Agent E-mail", tbd(agent.email)],
    6: ["  📅 Submittal Date", today],
    7: ["SEARCH RING INFORMATION", ""],
    8: ["  📌 Site Name", tbd(site.name)],
    9: ["  🌐 Latitude", latS],
    10: ["  🌐 Longitude", lonS],
    11: ["  📏 Search Radius", site.radius ? `${site.radius} mi` : "TBD"],
    12: ["  🗼 SARF Height", sarfH],
    13: ["", ""],
    14: ["  🎯 SARF MAP — Satellite Search Ring", ""],
    15: ["PROJECT INFORMATION", ""],
    16: ["  🗼 Tower Type", "Self-Supporting"],
    17: ["  📏 Tower Height", sarfH],
    18: ["  📏 Centerlines Available", site.sarfHeight ? `${Number(site.sarfHeight) - 10}'` : "TBD"],
    19: ["  🏔️ Ground Elevation", site.groundElevFt ? `${Math.round(Number(site.groundElevFt))}' AMSL (USGS 3DEP)` : "TBD — USGS"],
    20: ["  📐 Compound Size (S.F. & dims)", "75' x 75'  (5,625 SF)"],
    21: ["  🌐 Latitude", tbd(num(t.latitude)?.toFixed(6), latS)],
    22: ["  🌐 Longitude", tbd(num(t.longitude)?.toFixed(6), lonS)],
    23: ["  📏 Distance from Search Ring Center", tbd(x.distanceFromCenter)],
    24: ["SITE INFORMATION (from Property Appraiser's Office)", ""],
    25: ["  📐 Parcel County", county],
    26: ["  🆔 Parcel ID Number", tbd(t.apn)],
    27: ["  👤 Owner Name (on Deed)", tbd(t.owner_name)],
    28: ["  📍 Parcel Street Address", tbd(t.parcel_address)],
    29: ["  📍 Parcel City", tbd(t.parcel_city)],
    30: ["  🏛️ Parcel State", state || "TBD"],
    31: ["  📮 Parcel Zip", tbd(t.parcel_zip)],
    32: ["  📐 Parcel Size (acres, MOL)", t.acreage ? `${t.acreage} ac` : "TBD"],
    33: ["  📏 Parcel Dimensions (feet)", tbd(t.boundaries ?? x.parcelDims, "TBD — verify survey")],
    34: ["  ✅ Conforming Size?", tbd(x.conformingSize)],
    35: ["  💰 Taxes Paid-to-Date / Annual Taxes", tbd(x.taxesPaid, "TBD — verify PA")],
    36: ["OWNER INFORMATION", ""],
    37: ["  👤 Name(s)", tbd(t.owner_name)],
    38: ["  👤 Contact Person", tbd(t.contact_person, "TBD — skip-trace required")],
    39: ["  📍 Mailing Address", tbd(t.mailing_address)],
    40: ["  📧 E-mail Address", tbd(t.owner_email, "TBD — skip-trace required")],
    41: ["  📞 Phone Number", tbd(fmtPhone(t.owner_phone), "TBD — skip-trace required")],
    42: ["LEASE INFORMATION", ""],
    43: ["  📅 Effective Date (signed or anticipated)", "Upon Full Execution"],
    44: ["  📅 Length of Initial Term", "5 Years"],
    45: ["  🔄 Length & Number of Renewal Terms", "5 year terms @ 7 renewal terms"],
    46: ["  ⏱️ Option Period(s)", "2 @ 12 months"],
    47: ["  💰 Base Lease Fee", "$1,350 / month"],
    48: ["  📈 Escalation Rate", "3% annually"],
    49: ["  🤝 Collocation Revenue (if applicable)", "N/A"],
    50: ["  💰 Capital Contribution (if applicable)", "N/A"],
    51: ["LANDOWNER NOTES", ""],
    52: ["  📝 Concerns / Lease Notes", tbd(x.landownerNotes, "No concerns identified at this time.")],
    53: ["DIRECTIONS TO SITE", ""],
    54: ["  🛣️ General Directions", tbd(x.directions,
      `Navigate to ${latS}, ${lonS} via GPS. Parcel located in ${county} County${state ? ", " + state : ""}.`)],
    55: ["PHOTOGRAPHS", ""],
    56: ["  Premises, Access, Nearest Power/Telco (include below)", ""],
    57: ["  📌 Proposed Site (overhead)", ""],
    58: ["  ⬆️ North from Site — 3D RF Viewshed", ""],
    59: ["  ⬇️ South from Site — 3D RF Viewshed", ""],
    60: ["  ➡️ East from Site — 3D RF Viewshed", ""],
    61: ["  ⬅️ West from Site — 3D RF Viewshed", ""],
    62: ["  🛣️ Access — ROW Connection", ""],
    63: ["  🛣️ Access — Along Road", ""],
    64: ["  ⚡ Power (nearest pole)", ""],
    65: ["  📡 Telco (nearest demarc)", ""],
    66: ["  📐 Site Sketch (within entire parcel)", ""],
    67: ["EXISTING CONDITIONS", ""],
    68: ["  🌊 Flood Zone(s)", fz],
    69: ["  🌿 Wetland Concerns?", tbd(c.wetland_concerns)],
    70: ["  💧 Water Management District", tbd(c.water_management_district)],
    71: ["  ☣️  Hazardous Waste Concerns?", tbd(c.hazardous_waste, "None detected ✅")],
    72: ["  🛣️ Access Notes (ROW, driveway, code)", tbd(c.access_notes, "TBD — verify driveway permit requirements")],
    73: ["  ⚡ Power Provider (name & phone)", tbd(x.powerStr)],
    74: ["  📡 Fiber Available?", tbd(x.fiberStr, "TBD — verify with county")],
    75: ["  📡 Telco Provider (name & phone)", tbd(x.telcoStr)],
    76: ["  ✈️ Nearest Airport (name & distance)", tbd(x.airportStr)],
    77: ["  🚔 Local Police (municipality & phone)", tbd(c.local_police)],
    78: ["  🚒 Local Fire Dept (municipality & phone)", tbd(c.local_fire)],
    79: ["SITE NOTES", ""],
    80: ["  📝 Site Development Concerns", tbd(x.siteNotes,
      `No major development concerns identified. Parcel is ${t.acreage ? t.acreage + " ac" : "TBD"} — adequate for 75'×75' compound. ` +
      `Flood zone: ${fz}. Wetlands: ${tbd(c.wetland_concerns)}. Zoning: ${zoningCode}.`)],
    81: ["MAPS — Insert Snippets", ""],
    82: ["  🛰️ Aerial", ""],
    83: ["  🏔️ Topography", ""],
    84: ["  🌊 Floodplain Map", ""],
    85: ["  📋 Zoning Map", ""],
    86: ["  🗺️ FLU Map", ""],
    87: ["  🌿 Wetlands Map", ""],
    88: ["  📐 Parcel Map", ""],
    89: ["  💨 Wind Speed Map", ""],
    90: ["  ✈️ Airport Map", ""],
    91: ["ZONING OVERVIEW", ""],
    92: ["  📋 Zoning Jurisdiction", tbd(z.jurisdiction)],
    93: ["  📞 Zoning Contact Information", zr(rep["zoning_contact"] ?? rep["contact"]) === "TBD" ? "TBD — contact county planning dept" : zr(rep["zoning_contact"] ?? rep["contact"])],
    94: ["  📋 Zoning Process", zr(rep["zoning_process"] ?? rep["process"])],
    95: ["  💰 Zoning Fees", zr(rep["zoning_fees"] ?? rep["fees"])],
    96: ["  ⏱️ Zoning Approval Timeframe", zr(rep["zoning_timeframe"] ?? rep["timeframe"])],
    97: ["  📋 Property Zoning District", zoningCode],
    98: ["  🗺️ Property Future Land Use", zr(rep["future_land_use"])],
    99: ["  🏡 Property Current Usage", tbd(t.land_use)],
    100: ["  ✅ Meets minimum lot requirements?", tbd(x.meetsLotReq ?? zr(rep["meets_min_lot"]))],
    101: ["TOWER SPECIFICS", ""],
    102: ["  📋 LDC Section Reference(s)", zr(rep["ldc_section"])],
    103: ["  📏 Maximum Tower Height", zr(rep["max_height_ft"] ?? rep["max_height"])],
    104: ["  🎭 Stealth Required?", zr(rep["stealth_required"])],
    105: ["  🤝 Required Collocations (#)", zr(rep["collocation_required"])],
    106: ["  📏 Residential Separation (ft or %)", zr(rep["residential_separation_ft"] ?? rep["residential_separation"])],
    107: ["  📏 Tower Separation (ft or %)", zr(rep["tower_separation_ft"] ?? rep["tower_separation"])],
    108: ["  📐 Measured from base or center", zr(rep["measured_from"])],
    109: ["  ⬇️ Fall Zone Requirements", zr(rep["fall_zone_ft"] ?? rep["fall_zone"])],
    110: ["  🌲 Special Tower Landscaping?", zr(rep["landscaping"])],
    111: ["ZONING NOTES", ""],
    112: ["  📝 Zoning Concerns / Fees / Notes", zr(rep["zoning_notes"] ?? rep["notes"]) === "TBD" ? "See jurisdiction LDC for full requirements." : zr(rep["zoning_notes"] ?? rep["notes"])],
    113: ["SITE PLAN OVERVIEW", ""],
    114: ["  🏛️ Site Plan Jurisdiction", tbd(zr(rep["site_plan_jurisdiction"]), county)],
    115: ["  📞 Site Plan Contact Information", tbd(zr(rep["site_plan_contact"]), "TBD — contact planning dept")],
    116: ["  💰 Site Plan Fees", zr(rep["site_plan_fees"])],
    117: ["  ⏱️ Timeframe for Approval", zr(rep["site_plan_timeframe"])],
    118: ["  📋 Existing Site Plan to Amend?", zr(rep["site_plan_amend"])],
    119: ["  🔄 Concurrent to Zoning or BP?", zr(rep["site_plan_concurrent"])],
    120: ["  📅 Submittal Deadlines?", zr(rep["site_plan_deadlines"])],
    121: ["  📄 Electronic, hard copy, or both?", tbd(zr(rep["site_plan_format"]), "TBD — verify with jurisdiction")],
    122: ["SITE PLAN NOTES", ""],
    123: ["  📝 Site Plan Concerns / Fees / Notes", tbd(zr(rep["site_plan_notes"]), "See jurisdiction for site plan requirements.")],
    124: ["BUILDING PERMIT INFORMATION", ""],
    125: ["  🏛️ Building Permit Jurisdiction", tbd(zr(rep["bp_jurisdiction"]), county)],
    126: ["  📞 Building Department Contact Info", tbd(zr(rep["bp_contact"]), "TBD — contact building dept")],
    127: ["  🔨 Does GC have to submit?", zr(rep["bp_gc_required"])],
    128: ["  💰 Building Permit Fees", zr(rep["bp_fees"])],
    129: ["  ⏱️ Building Permit Timeframe", zr(rep["bp_timeframe"])],
    130: ["  💳 Bond Required?", zr(rep["bp_bond_required"])],
    131: ["  📍 E911 Address Assigned?", zr(rep["bp_e911"])],
    132: ["BUILDING PERMIT NOTES", ""],
    133: ["  📝 BP Concerns / Fees / Notes", tbd(zr(rep["bp_notes"]), "See jurisdiction for building permit requirements.")],
    134: ["APPROVALS — Name and Date", ""],
    135: ["  ✅ Project Manager", ""],
    136: ["  ✅ Program Manager", ""],
    137: ["  ✅ CEO", ""],
    138: ["  ✅ Carrier", ""],
  };
}

// ── Workbook builder (exported for smoke tests) ─────────────────────────────
export async function buildScipWorkbook(n: ReturnType<typeof normalize>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SiteHawk — SkyWave LLC";
  wb.created = new Date();

  const ws = wb.addWorksheet("Candidate", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.getColumn("A").width = COL_A_WIDTH;
  ws.getColumn("B").width = COL_B_WIDTH;

  const rows = buildRows(n);
  const thin = { style: "thin" as const, color: { argb: "FFDDDDDD" } };

  for (let r = 1; r <= 138; r++) {
    const [aVal, bVal] = rows[r] || ["", ""];
    if (ROW_HEIGHTS[r]) ws.getRow(r).height = ROW_HEIGHTS[r];

    if (r === 1) {
      ws.mergeCells("A1:B1");
      const cell = ws.getCell("A1");
      cell.value = `${aVal}  |  ${bVal}`;
      cell.font = { name: FONT, size: 14, bold: true, color: { argb: DARK_TEXT } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      continue;
    }

    if (SECTION_HEADER_ROWS.has(r)) {
      ws.mergeCells(`A${r}:B${r}`);
      const cell = ws.getCell(`A${r}`);
      cell.value = aVal;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_GREEN } };
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      continue;
    }

    const aCell = ws.getCell(`A${r}`);
    const bCell = ws.getCell(`B${r}`);
    aCell.value = aVal;
    aCell.font = { name: FONT, size: 10, bold: true, color: { argb: DARK_TEXT } };
    aCell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
    aCell.border = { left: thin, right: thin, top: thin, bottom: thin };
    bCell.value = bVal;
    bCell.font = { name: FONT, size: 10, color: { argb: DARK_TEXT } };
    bCell.alignment = { horizontal: "left", vertical: "top", wrapText: true, indent: 1 };
    bCell.border = { left: thin, right: thin, top: thin, bottom: thin };
  }

  // ── Images: fetch every available URL, embed at its exact template row ──
  const embedded: string[] = [];
  const missing: string[] = [];
  const jobs = Object.entries(IMAGE_ROWS).map(async ([rowStr, key]) => {
    const row = Number(rowStr);
    const url = (n.images as Record<string, string>)[key];
    if (!url) { missing.push(key); return; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ext = /\.jpe?g($|\?)/i.test(url) ? "jpeg" : "png";
      const imgId = wb.addImage({ buffer: buf, extension: ext });
      const isSarf = row === 14;
      // 380pt ≈ 507px, 420pt ≈ 560px of row height; Mapbox statics are 4:3.
      const height = isSarf ? 548 : 496;
      const width = Math.round(height * (4 / 3));
      ws.addImage(imgId, {
        tl: { col: 1.02, row: row - 0.99 },
        ext: { width, height },
        editAs: "oneCell",
      });
      embedded.push(key);
    } catch (_e) {
      missing.push(key);
      const bCell = ws.getCell(`B${row}`);
      bCell.value = `Image pending — ${key.replace(/_/g, " ")}`;
      bCell.font = { name: FONT, size: 10, italic: true, color: { argb: "FF888888" } };
    }
  });
  await Promise.allSettled(jobs);

  // ── Sheet 2: Site Contact Summary ────────────────────────────────────────
  const ws2 = wb.addWorksheet("Site Contact Summary");
  ws2.getColumn("A").width = COL_A_WIDTH;
  ws2.getColumn("B").width = COL_B_WIDTH;
  const c = n.conditions as Record<string, string>;
  const x = n.extras as Record<string, string>;
  const summary: Array<[string, string] | ["__HDR__", string]> = [
    ["__HDR__", "SITE CONTACT SUMMARY"],
    ["  👤 Site Acquisition Agent", `${tbd(n.agent.name)} | ${fmtPhone(n.agent.phone)} | ${tbd(n.agent.email)}`],
    ["  👤 Property Owner", `${tbd((n.target as any).owner_name)} | ${tbd(fmtPhone((n.target as any).owner_phone), "phone TBD")}`],
    ["  📋 Zoning Jurisdiction", tbd((n.zoning as any).jurisdiction)],
    ["  ⚡ Power Provider", tbd(x.powerStr)],
    ["  📡 Telco Provider", tbd(x.telcoStr)],
    ["  ✈️ Nearest Airport", tbd(x.airportStr)],
    ["  🚔 Local Police", tbd(c.local_police)],
    ["  🚒 Local Fire Department", tbd(c.local_fire)],
  ];
  summary.forEach(([a, b], i) => {
    const r = i + 1;
    ws2.getRow(r).height = 18;
    if (a === "__HDR__") {
      ws2.mergeCells(`A${r}:B${r}`);
      const cell = ws2.getCell(`A${r}`);
      cell.value = b;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_GREEN } };
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    } else {
      ws2.getCell(`A${r}`).value = a;
      ws2.getCell(`A${r}`).font = { name: FONT, size: 10, bold: true, color: { argb: DARK_TEXT } };
      ws2.getCell(`B${r}`).value = b;
      ws2.getCell(`B${r}`).font = { name: FONT, size: 10, color: { argb: DARK_TEXT } };
    }
  });

  const out = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { bytes: new Uint8Array(out), embedded, missing };
}

// ── HTTP handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
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
      normalized = normalize(rec, true);
    } else {
      return Response.json({ error: "Provide { record } or { scipId }" }, { status: 400 });
    }

    const { bytes, embedded, missing } = await buildScipWorkbook(normalized);

    const siteName = String((normalized.site as any).name || "Site")
      .replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "Site";
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `${siteName}_SCIP_${stamp}.xlsx`;

    const file = new File([bytes], filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const { file_uri } = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri });

    return Response.json({
      ok: true, filename, signed_url,
      bytes: bytes.byteLength,
      images_embedded: embedded, images_missing: missing,
    });
  } catch (e) {
    return Response.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
});