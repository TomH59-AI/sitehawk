// SCIP Book — maps a ScipRecord onto the NEWSCIP_812026 template:
// page 1 = Property Data field sheet, pages 2–8 = paired map exhibits.
// Blank fields overlay values from record.book_qc.filled (Gemini QC).

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function zr(record, terms) {
  const rep = record?.zoning_report || {};
  const want = norm(terms).split(" ");
  for (const [k, v] of Object.entries(rep)) {
    const nk = norm(k);
    if (want.every((w) => nk.includes(w))) {
      const val = v && typeof v === "object" ? v.value : v;
      if (val != null && String(val).trim() !== "") return String(val);
    }
  }
  return null;
}

const target = (r) => r?.parcel_targets?.[r?.active_target_index || 0] || {};
const pick = (...vals) => {
  for (const v of vals) if (v != null && String(v).trim() !== "") return String(v);
  return null;
};
const url = (...cands) => {
  for (const c of cands) if (typeof c === "string" && c.startsWith("http")) return c;
  return null;
};

function proximityCaption(kind, item) {
  if (!item) return `Distance from Target A: No data available — RF Proximity analysis returned no ${kind.toLowerCase()} result.`;
  const name = pick(item.name, item.airport_name, item.licensee, item.call_letters, item.site_name, kind);
  const miles = item.distance_miles;
  const feet = item.distance_feet;
  const distance = item.distance_label || [miles != null ? `${miles} mi` : null, feet != null ? `${Number(feet).toLocaleString()} ft` : null].filter(Boolean).join(" / ");
  return distance
    ? `Distance from Target A to ${name}: ${distance} (straight-line). Source: RF Proximity analysis.`
    : `Distance from Target A to ${name}: No data available — RF Proximity analysis returned no distance.`;
}

function milesBetween(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 3958.8, d = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * d) / 2) ** 2 +
    Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(((lon2 - lon1) * d) / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2);
}

// ── Page 1: Property Data sections ─────────────────────────────────────────
export function buildPropertySections(record) {
  const r = record || {};
  const t = target(r);
  const ec = r.existing_conditions || {};
  const oc = r.owner_contacts || {};
  const power = r.power_airport_maps?.power || {};
  const airport = r.power_airport_maps?.airport || {};
  const dist = milesBetween(Number(r.latitude), Number(r.longitude), Number(t.latitude), Number(t.longitude));

  const sections = [
    { title: "SITE ACQUISITION", rows: [
      ["agent_name", "Agent Name", r.agent_name],
      ["agent_phone", "Agent Phone", r.agent_phone],
      ["agent_email", "Agent E-mail", r.agent_email],
      ["submittal_date", "Submittal Date", r.submittal_date],
    ]},
    { title: "SEARCH RING INFORMATION", rows: [
      ["site_name", "Site Name", r.site_name],
      ["ring_lat", "Latitude", r.latitude],
      ["ring_lon", "Longitude", r.longitude],
      ["search_radius", "Search Radius", r.search_radius ? `${r.search_radius} mi` : null],
      ["sarf_height", "SARF Height", r.sarf_height ? `${r.sarf_height} ft AGL` : null],
    ]},
    { title: "PROJECT INFORMATION", rows: [
      ["tower_type", "Tower Type", zr(r, "tower type")],
      ["tower_height", "Tower Height", r.sarf_height ? `${r.sarf_height} ft` : null],
      ["centerlines", "Centerlines available", zr(r, "centerline")],
      ["ground_elevation", "Ground Elevation", r.hawk_maps?.center_amsl_ft != null ? `${r.hawk_maps.center_amsl_ft} ft AMSL` : null],
      ["compound_size", "Compound Size (S.F. & dimensions)", zr(r, "compound")],
      ["target_lat", "Latitude", t.latitude],
      ["target_lon", "Longitude", t.longitude],
      ["dist_from_src", "Distance from Search Ring Center", dist ? `${dist} mi` : null],
    ]},
    { title: "SITE INFORMATION (from Property Appraiser's Office)", rows: [
      ["parcel_county", "Parcel County", pick(r.county, t.county)],
      ["parcel_id", "Parcel ID Number", t.apn],
      ["owner_deed", "Owner Name (on Deed)", t.owner_name],
      ["parcel_address", "Parcel Street Address", t.parcel_address],
      ["parcel_city", "Parcel City", t.parcel_city],
      ["parcel_state", "Parcel State", r.state],
      ["parcel_zip", "Parcel Zip", t.parcel_zip],
      ["parcel_size", "Parcel Size (acres, MOL)", t.acreage != null ? `${t.acreage} ac` : null],
      ["parcel_dims", "Parcel Dimensions (feet)", t.boundaries],
      ["conforming_size", "Conforming Size?", zr(r, "conforming")],
      ["taxes_paid", "Taxes Paid-to-Date?", zr(r, "taxes")],
    ]},
    { title: "OWNER INFORMATION", rows: [
      ["owner_names", "Name(s)", t.owner_name],
      ["owner_contact_person", "Contact Person", null],
      ["owner_mailing", "Mailing Address", t.mailing_address],
      ["owner_email", "E-mail Address", oc.best_email],
      ["owner_phone", "Phone Number", oc.best_phone],
    ]},
    { title: "EXISTING CONDITIONS", rows: [
      ["flood_zone", "Flood Zone(s)", pick(ec.flood_zone, t.fema_risk_factor)],
      ["wetland_concerns", "Wetland Concerns?", ec.wetland_concerns],
      ["water_mgmt_district", "Water Management District", ec.water_management_district],
      ["haz_waste", "Hazardous Waste Concerns?", ec.hazardous_waste],
      ["access_notes", "Access Notes (ROW, driveway, code)", ec.access_notes],
      ["power_provider", "Power Provider (name & phone)", pick(power.company, power.name) ? [pick(power.company, power.name), power.phone].filter(Boolean).join(" — ") : null],
      ["fiber_available", "Fiber Available?", zr(r, "fiber")],
      ["telco_provider", "Telco Provider (name & phone)", zr(r, "telco")],
      ["nearest_airport", "Nearest Airport (name & distance)", pick(airport.name, airport.airport_name) ? [pick(airport.name, airport.airport_name), pick(airport.distance_miles && `${airport.distance_miles} mi`, airport.distance)].filter(Boolean).join(" — ") : null],
      ["local_police", "Local Police (municipality & phone)", ec.local_police],
      ["local_fire", "Local Fire Dept (municipality & phone)", ec.local_fire],
    ]},
    { title: "SITE NOTES", rows: [
      ["site_notes", "Please elaborate on any site development concerns (i.e. terrain, foliage, obstructions, generators or microwaves prohibited)", pick(zr(r, "site notes"), r.description)],
    ]},
    { title: "ZONING OVERVIEW", rows: [
      ["zoning_jurisdiction", "Zoning Jurisdiction", r.zoning_jurisdiction],
      ["zoning_contact", "Zoning Contact Information", zr(r, "zoning contact")],
      ["zoning_process", "Zoning Process", zr(r, "zoning process")],
      ["zoning_fees", "Zoning Fees", zr(r, "zoning fee")],
      ["zoning_timeframe", "Zoning Approval Timeframe", zr(r, "zoning approval")],
      ["zoning_classification", "Property Zoning District Classification", pick(t.zoning_classification, r.hawk_maps?.zone_code)],
      ["min_lot", "Meets minimum lot requirements?", zr(r, "minimum lot")],
    ]},
    { title: "TOWER SPECIFICS", rows: [
      ["ldc_ref", "LDC Section Reference(s)", zr(r, "ldc")],
      ["max_tower_height", "Maximum Tower Height", zr(r, "maximum tower height")],
      ["stealth", "Stealth Required?", zr(r, "stealth")],
      ["collocations", "Required Collocations (#)", zr(r, "collocation")],
      ["res_separation", "Residential Separation (ft or %)", zr(r, "residential separation")],
      ["tower_separation", "Tower Separation (ft or %)", zr(r, "tower separation")],
      ["measured_from", "Measured from base or center", zr(r, "measured")],
      ["fall_zone", "Fall Zone Requirements", zr(r, "fall zone")],
      ["landscaping", "Special Tower Landscaping?", zr(r, "landscaping")],
    ]},
    { title: "SITE PLAN OVERVIEW", rows: [
      ["sp_jurisdiction", "Site Plan Jurisdiction", pick(zr(r, "site plan jurisdiction"), r.zoning_jurisdiction)],
      ["sp_contact", "Site Plan Contact Information", zr(r, "site plan contact")],
      ["sp_fees", "Site Plan Fees", zr(r, "site plan fee")],
      ["sp_timeframe", "Timeframe for approval", zr(r, "site plan timeframe")],
      ["sp_amend", "Existing Site Plan to Amend?", zr(r, "amend")],
      ["sp_concurrent", "Concurrent to Zoning or BP?", zr(r, "concurrent")],
      ["sp_deadlines", "Submittal deadlines?", zr(r, "deadline")],
      ["sp_format", "Electronic, hard copy, or both?", zr(r, "electronic")],
    ]},
    { title: "SITE PLAN FILING DOCUMENTS", rows: [
      ["site_plan_notes", "Please elaborate on any site plan concerns, fees, etc.", zr(r, "site plan notes")],
    ]},
    { title: "BUILDING PERMIT INFORMATION", rows: [
      ["bp_jurisdiction", "Building Permit Jurisdiction", zr(r, "building permit jurisdiction")],
      ["bp_contact", "Building Department Contact Info", zr(r, "building department contact")],
      ["bp_gc", "Does GC have to submit?", zr(r, "gc")],
      ["bp_fees", "Building Permit Fees", zr(r, "building permit fee")],
      ["bp_timeframe", "Building Permit Timeframe", zr(r, "building permit timeframe")],
      ["bp_bond", "Bond Required?", zr(r, "bond")],
      ["bp_e911", "E911 Address assigned?", zr(r, "e911")],
    ]},
    { title: "BUILDING PERMIT NOTES", rows: [
      ["bp_expire", "When does the building permit expire once it's been pulled?", zr(r, "expire")],
    ]},
  ];

  const filled = r.book_qc?.filled || {};
  return sections.map((s) => ({
    title: s.title,
    rows: s.rows.map(([key, label, value]) => {
      const v = value != null && String(value).trim() !== "" ? String(value) : null;
      const qcVal = !v && filled[key] != null && String(filled[key]).trim() !== "" ? String(filled[key]) : null;
      return { key, label, value: v || qcVal, fromQc: !!qcVal };
    }),
  }));
}

// ── Pages 2–8: map exhibit pairs ────────────────────────────────────────────
export function buildMapPages(record) {
  const r = record || {};
  const hm = r.hawk_maps || {};
  const rf = r.rf_enrichment?.[String(r.active_target_index || 0)] || {};
  const pam = r.power_airport_maps || {};
  const airport = rf?.rf?.airport || pam.airport || null;
  const tower = rf?.rf?.tower || null;
  return [
    { id: "aerial_topo", title: "AERIAL MAP  &  TOPO MAP", slots: [
      { label: "AERIAL MAP", url: url(hm.aerial_url), caption: "High-resolution aerial / satellite view of the candidate parcel, access route, and surrounding land uses." },
      { label: "TOPO MAP", url: url(hm.topography_url), caption: "USGS topographic map showing ground elevations, contours, and terrain affecting siting and access." },
    ]},
    { id: "fema_zoning", title: "FEMA MAP  &  ZONING MAP", slots: [
      { label: "FEMA MAP", url: url(hm.floodplain_url), caption: "FEMA Flood Insurance Rate Map (FIRM) panel showing flood zone designations at the candidate site." },
      { label: "ZONING MAP", url: url(hm.zoning_url), caption: "Official zoning map of the governing jurisdiction showing the parcel's zoning district classification." },
    ]},
    { id: "flu_wetlands", title: "FLU MAP  &  WETLANDS MAP", slots: [
      { label: "FLU MAP", url: null, caption: "Comprehensive plan Future Land Use (FLU) map showing the long-range land use designation of the parcel." },
      { label: "WETLANDS MAP", url: null, caption: "National Wetlands Inventory (USFWS) map showing mapped wetlands and surface waters on or near the parcel." },
    ]},
    { id: "airport_tower", title: "NEAREST AIRPORT  &  NEAREST CELL TOWER MAP", slots: [
      { label: "NEAREST AIRPORT MAP", url: url(airport?.map_url, airport?.url, airport?.image_url), caption: proximityCaption("Airport", airport) },
      { label: "NEAREST CELL TOWER MAP", url: url(tower?.map_url, tower?.url), caption: proximityCaption("Cell tower", tower) },
    ]},
    { id: "parcel_wind", title: "PARCEL MAP  &  WIND SPEED MAP", slots: [
      { label: "PARCEL MAP", url: null, caption: "County property appraiser parcel map showing boundaries, dimensions, parcel ID, and adjacent tracts." },
      { label: "WIND SPEED MAP", url: null, caption: "ASCE 7 basic wind speed map for the site location — basis for tower structural design requirements." },
    ]},
    { id: "map2d_viewshed", title: "MAP 2D  &  VIEWSHED MAP", slots: [
      { label: "MAP 2D", url: url(r.map_image_url), caption: "SiteHawk-generated 2D site map — candidate point, search ring, access, and proposed compound layout." },
      { label: "VIEWSHED MAP", url: url(r.viewshed?.aerial_ring_url), caption: "Viewshed (line-of-sight) analysis showing areas with potential visibility of the proposed tower." },
    ]},
    { id: "fiber", title: "FIBER OPTICS MAP", slots: [
      { label: "FIBER OPTICS MAP", url: url(rf?.coverage?.png_url), caption: "Fiber optic routes nearest to the candidate — backhaul availability and distance-to-fiber." },
      { label: "SUPPLEMENTAL EXHIBIT (OPTIONAL)", url: null, caption: "Reserved frame for an additional exhibit (second fiber view, carrier map, or close-up) if required.", optional: true },
    ]},
  ];
}

// Blank text fields (for the Gemini QC run) and missing map exhibits.
export function collectMissingFields(record) {
  const out = [];
  for (const s of buildPropertySections(record)) {
    for (const row of s.rows) {
      if (!row.value) out.push({ key: row.key, label: row.label, section: s.title });
    }
  }
  return out;
}

export function collectMissingMaps(record) {
  const out = [];
  for (const p of buildMapPages(record)) {
    for (const slot of p.slots) {
      if (!slot.url && !slot.optional) out.push({ page: p.title, label: slot.label });
    }
  }
  return out;
}