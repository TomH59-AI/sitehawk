// Maps a SearchResult + ordinance + searchCenter into the SCIP template field structure.
// Mirrors the official Site-Hawk SCIP Fillable Template (Candidate sheet).

export function buildScipData(candidate, ordinance, searchCenter, agent = {}) {
  const c = candidate || {};
  const o = ordinance || {};
  const sc = searchCenter || {};

  // Parse address into parts
  const addr = c.parcel_address || "";
  const parts = addr.split(",").map((s) => s.trim());
  const street = parts[0] || "";
  const city = parts[1] || "";
  const stateZip = (parts[2] || "").split(" ");
  const state = stateZip[0] || o.state || "";
  const zip = stateZip[1] || "";

  return {
    site_acquisition: {
      title: "SITE ACQUISITION",
      fields: [
        ["Agent Name", agent.name || ""],
        ["Agent Phone", agent.phone || ""],
        ["Agent E-mail", agent.email || ""],
        ["Submittal Date", new Date().toLocaleDateString()],
      ],
    },
    search_ring: {
      title: "SEARCH RING INFORMATION",
      fields: [
        ["Site Name", c.site_name || ""],
        ["Latitude", sc.lat ? sc.lat.toFixed(6) : ""],
        ["Longitude", sc.lon ? sc.lon.toFixed(6) : ""],
        ["Search Radius", "0.5 miles"],
        ["SARF Height", "199 ft"],
      ],
    },
    project: {
      title: "PROJECT INFORMATION",
      fields: [
        ["Tower Type", o.permitted_tower_types?.[0] || "Monopole"],
        ["Tower Height", o.max_tower_height || "199 ft"],
        ["Centerlines available", ""],
        ["Ground Elevation", ""],
        ["Compound Size (S.F. & dimensions)", ""],
        ["Latitude", c.latitude?.toFixed(6) || ""],
        ["Longitude", c.longitude?.toFixed(6) || ""],
        ["Distance from Search Ring Center", ""],
      ],
    },
    site_info: {
      title: "SITE INFORMATION (from Property Appraiser's Office)",
      fields: [
        ["Parcel County", o.jurisdiction || ""],
        ["Parcel ID Number", c.parcel_id || ""],
        ["Owner Name (on Deed)", c.owner_name || ""],
        ["Parcel Street Address", street],
        ["Parcel City", city],
        ["Parcel State", state],
        ["Parcel Zip", zip],
        ["Parcel Size (acres, MOL)", c.parcel_size_acres ? `${c.parcel_size_acres} acres` : ""],
        ["Parcel Dimensions (feet)", ""],
        ["Conforming Size?", ""],
        ["Taxes Paid-to-Date?", ""],
      ],
    },
    owner: {
      title: "OWNER INFORMATION",
      fields: [
        ["Name(s)", c.owner_name || ""],
        ["Contact Person", ""],
        ["Mailing Address", c.owner_mailing_address || ""],
        ["E-mail Address", c.email || ""],
        ["Phone Number", c.phone || ""],
      ],
    },
    lease: {
      title: "LEASE INFORMATION",
      fields: [
        ["Effective Date (signed or anticipated)", ""],
        ["Length of Initial Term", ""],
        ["Length & Number of Renewal Terms", ""],
        ["Option Period(s)", ""],
        ["Base Lease Fee", ""],
        ["Escalation Rate", ""],
        ["Collocation Revenue (if applicable)", ""],
        ["Capital Contribution (if applicable)", ""],
      ],
    },
    landowner_notes: {
      title: "LANDOWNER NOTES",
      fields: [
        ["Concerns with landowner or lease terms", ""],
        ["Is property within HOA or CDD?", ""],
      ],
    },
    directions: {
      title: "DIRECTIONS TO SITE",
      fields: [["General directions", ""]],
    },
    existing_conditions: {
      title: "EXISTING CONDITIONS",
      fields: [
        ["Flood Zone(s)", c.fema_risk_factor ? `${c.fema_risk_factor}${c.fema_sfha ? " (SFHA)" : ""}` : ""],
        ["Wetland Concerns?", c.wetlands_present ? `YES — ${c.wetland_proximity || ""} · ${(c.wetland_types || []).join(", ")}` : c.wetlands_present === false ? "None detected (NWI)" : ""],
        ["Water Management District", ""],
        ["Hazardous Waste Concerns?", ""],
        ["Access Notes (ROW, driveway, code)", ""],
        ["Power Provider (name & phone)", [c.power_utility, c.utility_phone].filter(Boolean).join(" · ")],
        ["Fiber Available?", c.has_fiber === true ? `Yes${c.fiber_operator ? " — " + c.fiber_operator : ""}` : c.has_fiber === false ? "No (FCC verified)" : "Unknown"],
        ["Telco Provider (name & phone)", (c.fiber_providers || [])[0]?.provider_name || ""],
        ["Nearest Airport (name & distance)", c.airport_iata ? `${c.airport_iata} — ${c.airport_name || ""} · ${c.airport_distance_miles?.toFixed(1)} mi` : ""],
        ["Local Police (municipality & phone)", ""],
        ["Local Fire Dept (municipality & phone)", ""],
      ],
    },
    site_notes: {
      title: "SITE NOTES",
      fields: [["Site development concerns (terrain, foliage, obstructions, etc.)", ""]],
    },
    zoning: {
      title: "ZONING OVERVIEW",
      fields: [
        ["Zoning Jurisdiction", o.jurisdiction || ""],
        ["Zoning Contact Information", o.contact_info || ""],
        ["Zoning Process", o.permit_process || ""],
        ["Zoning Fees", o.permit_fees || ""],
        ["Zoning Approval Timeframe", o.approval_timeframe || ""],
        ["Property Zoning District", c.zoning_classification || ""],
        ["Property Future Land Use", ""],
        ["Property Current Usage", ""],
        ["Meets minimum lot requirements?", ""],
      ],
    },
    tower_specs: {
      title: "TOWER SPECIFICS",
      fields: [
        ["LDC Section Reference(s)", o.code_section || ""],
        ["Maximum Tower Height", o.max_tower_height || ""],
        ["Stealth Required?", o.stealth_required ? "Yes" : o.stealth_required === false ? "No" : ""],
        ["Required Collocations (#)", o.collocation_required || ""],
        ["Residential Separation (ft or %)", o.residential_setback || ""],
        ["Tower Separation (ft or %)", o.tower_separation || ""],
        ["Measured from base or center", ""],
        ["Fall Zone Requirements", o.fall_zone || ""],
        ["Special Tower Landscaping?", o.landscaping || ""],
      ],
    },
    zoning_notes: {
      title: "ZONING NOTES",
      fields: [["Zoning concerns, fees, etc.", o.notes || ""]],
    },
    site_plan: {
      title: "SITE PLAN OVERVIEW",
      fields: [
        ["Site Plan Jurisdiction", ""],
        ["Site Plan Contact Information", ""],
        ["Site Plan Fees", ""],
        ["Timeframe for approval", ""],
        ["Existing Site Plan to Amend?", ""],
        ["Concurrent to Zoning or BP?", ""],
        ["Submittal deadlines?", ""],
        ["Electronic, hard copy, or both?", ""],
      ],
    },
    site_plan_notes: {
      title: "SITE PLAN NOTES",
      fields: [["Site plan concerns, fees, etc.", ""]],
    },
    building_permit: {
      title: "BUILDING PERMIT INFORMATION",
      fields: [
        ["Building Permit Jurisdiction", ""],
        ["Building Department Contact Info", ""],
        ["Does GC have to submit?", ""],
        ["Building Permit Fees", ""],
        ["Building Permit Timeframe", ""],
        ["Bond Required?", ""],
        ["E911 Address assigned?", ""],
      ],
    },
    building_permit_notes: {
      title: "BUILDING PERMIT NOTES",
      fields: [["BP concerns, fees, etc.", ""]],
    },
    approvals: {
      title: "APPROVALS — Name and Date",
      fields: [
        ["Project Manager", ""],
        ["Program Manager", ""],
        ["CEO", ""],
        ["Carrier", ""],
      ],
    },
  };
}

export const SCIP_SECTION_ORDER = [
  "site_acquisition",
  "search_ring",
  "project",
  "site_info",
  "owner",
  "lease",
  "landowner_notes",
  "directions",
  "existing_conditions",
  "site_notes",
  "zoning",
  "tower_specs",
  "zoning_notes",
  "site_plan",
  "site_plan_notes",
  "building_permit",
  "building_permit_notes",
  "approvals",
];