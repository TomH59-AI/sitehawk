// AnthemNet SCIP — maps a ScipRecord into the AnthemNet Site Candidate
// Information Package layout. Auto-populates every field the pipeline already
// knows; anything unknown is returned blank and reported in `missing`.

const isBlank = (v) => v == null || String(v).trim() === "";

const fmt = (v, suffix = "") => (isBlank(v) ? null : `${v}${suffix}`);

// Haversine distance in miles.
function distMiles(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 3958.8, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Parse "City, ST Zip" pieces out of a parcel address when present.
function splitAddress(addr) {
  if (isBlank(addr)) return { street: null, city: null, state: null, zip: null };
  const parts = String(addr).split(",").map((s) => s.trim());
  const street = parts[0] || null;
  const city = parts.length > 1 ? parts[1] : null;
  const tail = parts.length > 2 ? parts[parts.length - 1] : "";
  const m = tail.match(/([A-Z]{2})\s*(\d{5})?/);
  return { street, city, state: m?.[1] || null, zip: m?.[2] || null };
}

export function buildAnthemNet(record) {
  const t = record.parcel_targets?.[record.active_target_index || 0] || {};
  const ec = record.existing_conditions || {};
  const hm = record.hawk_maps || {};
  const pa = record.power_airport_maps || {};
  const zr = record.zoning_report || {};
  const z = (sec, key) => zr?.[sec]?.[key]?.value ?? null;
  const addr = splitAddress(t.parcel_address);

  const dist = distMiles(Number(record.latitude), Number(record.longitude), Number(t.latitude), Number(t.longitude));

  const sections = [
    {
      title: "SITE ACQUISITION",
      rows: [
        ["Agent Name", record.agent_name],
        ["Agent Phone", record.agent_phone],
        ["Agent E-mail", record.agent_email],
        ["Submittal Date", record.submittal_date],
      ],
    },
    {
      title: "SEARCH RING INFORMATION",
      rows: [
        ["Site Name", record.site_name],
        ["Latitude", fmt(record.latitude)],
        ["Longitude", fmt(record.longitude)],
        ["Search Radius", fmt(record.search_radius, " mi")],
        ["SARF Height", fmt(record.sarf_height, " ft AGL")],
      ],
    },
    {
      title: "PROJECT INFORMATION",
      rows: [
        ["Tower Type", "Monopole"],
        ["Tower Height", fmt(record.sarf_height, " ft AGL")],
        ["Centerlines Available", null],
        ["Ground Elevation", fmt(hm.center_amsl_ft, " ft AMSL")],
        ["Compound Size (S.F. & dimensions)", "100' × 100' (10,000 S.F.)"],
        ["Latitude", fmt(t.latitude)],
        ["Longitude", fmt(t.longitude)],
        ["Distance from Search Ring Center", dist != null ? `${dist.toFixed(2)} mi` : null],
      ],
    },
    {
      title: "SITE INFORMATION (from Property Appraiser's Office)",
      rows: [
        ["Parcel County", record.county],
        ["Parcel ID Number", t.apn],
        ["Owner Name (on Deed)", t.owner_name],
        ["Parcel Street Address", addr.street || t.parcel_address],
        ["Parcel City", addr.city],
        ["Parcel State", addr.state || record.state],
        ["Parcel Zip", addr.zip],
        ["Parcel Size (acres, MOL)", fmt(t.acreage, " ac MOL")],
        ["Parcel Dimensions (feet)", t.boundaries],
        ["Conforming Size?", null],
        ["Taxes Paid-to-Date?", null],
      ],
    },
    {
      title: "OWNER INFORMATION",
      rows: [
        ["Name(s)", t.owner_name],
        ["Contact Person", null],
        ["Mailing Address", t.mailing_address],
        ["E-mail Address", null],
        ["Phone Number", null],
      ],
    },
    {
      title: "LEASE INFORMATION",
      rows: [
        ["Effective Date (signed or anticipated)", "Upon Full Execution"],
        ["Length of Initial Term", "5 Years"],
        ["Length & Number of Renewal Terms", "5 year terms @ 7 renewal terms"],
        ["Option Period(s)", "2 @ 12 months"],
        ["Base Lease Fee", "$1,350.00"],
        ["Escalation Rate", "3%"],
        ["Collocation Revenue (if applicable)", "N/A"],
        ["Capital Contribution (if applicable)", "N/A"],
        ["Landowner / lease term concerns", null],
        ["Is property within HOA or CDD?", null],
        ["General Directions", null],
      ],
    },
    {
      title: "EXISTING CONDITIONS",
      rows: [
        ["Flood Zone(s)", ec.flood_zone || t.fema_risk_factor],
        ["Wetland Concerns?", ec.wetland_concerns],
        ["Water Management District", ec.water_management_district],
        ["Hazardous Waste Concerns?", ec.hazardous_waste],
        ["Access Notes (ROW, driveway, code)", ec.access_notes],
        ["Power Provider (name & phone)", [pa.power?.company_name || pa.power?.provider, pa.power?.phone].filter(Boolean).join(" · ") || null],
        ["Fiber Available?", null],
        ["Telco Provider (name & phone)", null],
        ["Nearest Airport (name & distance)", [pa.airport?.name, pa.airport?.distance_miles != null ? `${pa.airport.distance_miles} mi` : null].filter(Boolean).join(" · ") || null],
        ["Local Police (municipality & phone)", ec.local_police],
        ["Local Fire Dept (municipality & phone)", ec.local_fire],
      ],
    },
    {
      title: "SITE NOTES",
      rows: [["Site development concerns (terrain, foliage, obstructions, generators or microwaves prohibited)", record.description]],
    },
    {
      title: "ZONING OVERVIEW",
      rows: [
        ["Zoning Jurisdiction", z("zoning_overview", "zoning_jurisdiction") || record.zoning_jurisdiction],
        ["Zoning Contact Information", z("zoning_overview", "zoning_contact_information")],
        ["Zoning Process", z("zoning_overview", "zoning_process")],
        ["Zoning Fees", z("zoning_overview", "zoning_fees")],
        ["Zoning Approval Timeframe", z("zoning_overview", "zoning_approval_timeframe")],
        ["Property Zoning District", z("zoning_overview", "property_zoning_district") || t.zoning_classification],
        ["Property Future Land Use", z("zoning_overview", "property_future_land_use")],
        ["Property Current Usage", z("zoning_overview", "property_current_usage") || t.land_use],
        ["Meets minimum lot requirements?", z("zoning_overview", "meets_minimum_lot_requirements")],
      ],
    },
    {
      title: "TOWER SPECIFICS",
      rows: [
        ["LDC Section Reference(s)", z("tower_specifics", "ldc_section_reference")],
        ["Maximum Tower Height", z("tower_specifics", "maximum_tower_height")],
        ["Stealth Required?", z("tower_specifics", "stealth_required")],
        ["Required Collocations (#)", z("tower_specifics", "required_collocations")],
        ["Residential Separation (ft or %)", z("tower_specifics", "residential_separation")],
        ["Tower Separation (ft or %)", z("tower_specifics", "tower_separation")],
        ["Measured from base or center", z("tower_specifics", "measured_from")],
        ["Fall Zone Requirements", z("tower_specifics", "fall_zone_requirements")],
        ["Special Tower Landscaping?", z("tower_specifics", "special_tower_landscaping")],
      ],
    },
    {
      title: "SITE PLAN OVERVIEW",
      rows: [
        ["Site Plan Jurisdiction", z("site_plan", "site_plan_jurisdiction")],
        ["Site Plan Contact Information", z("site_plan", "site_plan_contact_information")],
        ["Site Plan Fees", z("site_plan", "site_plan_fees")],
        ["Timeframe for approval", z("site_plan", "timeframe_for_approval")],
        ["Existing Site Plan to Amend?", z("site_plan", "existing_site_plan_to_amend")],
        ["Concurrent to Zoning or BP?", z("site_plan", "concurrent_to_zoning_or_bp")],
        ["Submittal deadlines?", z("site_plan", "submittal_deadlines")],
        ["Electronic, hard copy, or both?", z("site_plan", "submittal_format")],
      ],
    },
    {
      title: "BUILDING PERMIT INFORMATION",
      rows: [
        ["Building Permit Jurisdiction", z("building_permit", "building_permit_jurisdiction")],
        ["Building Department Contact Info", z("building_permit", "building_department_contact_info")],
        ["Does GC have to submit?", z("building_permit", "gc_submits")],
        ["Building Permit Fees", z("building_permit", "building_permit_fees")],
        ["Building Permit Timeframe", z("building_permit", "building_permit_timeframe")],
        ["Bond Required?", z("building_permit", "bond_required")],
        ["E911 Address assigned?", z("building_permit", "e911_address_assigned")],
      ],
    },
    {
      title: "APPROVALS — NAME AND DATE",
      rows: [
        ["Project Manager", null],
        ["Program Manager", null],
        ["CEO", null],
        ["Carrier", null],
      ],
    },
  ];

  const maps = [
    { label: "SARF (Search Ring)", url: record.map_image_url },
    { label: "Aerial", url: hm.aerial_url },
    { label: "Topography", url: hm.topography_url },
    { label: "Floodplain Map", url: hm.floodplain_url },
    { label: "Zoning Map", url: hm.zoning_url },
    { label: "FLU Map", url: null },
    { label: "Wetlands Map", url: null },
    { label: "Parcel Map", url: null },
    { label: "Wind Speed Map", url: null },
    { label: "Power Map", url: pa.power?.map_url || pa.power?.url || null },
    { label: "Airport Map", url: pa.airport?.map_url || pa.airport?.url || null },
  ];

  const photos = [
    "Proposed Site", "North from Site", "South from Site", "East from Site", "West from Site",
    "Access — ROW Connection", "Access — Along", "Power (nearest pole)", "Telco (nearest demarc)",
    "Site Sketch (within entire parcel)",
  ];

  // Everything blank → the "what's missing" report.
  const missing = [];
  for (const s of sections) {
    for (const [label, value] of s.rows) {
      if (isBlank(value)) missing.push(`${s.title} → ${label}`);
    }
  }
  for (const m of maps) if (!m.url) missing.push(`MAPS → ${m.label}`);
  missing.push("PHOTOGRAPHS → all 10 (field photos — user provides)");

  return { sections, maps, photos, missing };
}