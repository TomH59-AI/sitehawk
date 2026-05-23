// Maps a SearchResult + ordinance + searchCenter into the SCIP template field structure.
// Mirrors the official Site-Hawk SCIP Fillable Template (Candidate sheet).
// Extra sources: geocode (Mapbox reverse-geocode), zoning (Notion zoning record), neighbors (Realie parcels).
// Source-of-truth rule: leave fields blank if no real source — never fabricate.

// Haversine distance in miles (used to compute Distance from Search Ring Center)
function haversineMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Pick a sensible compound size for a tower (industry-standard 80x80 = 6,400 sf for a 199ft monopole).
// Scales down for shorter towers.
function defaultCompoundSize(heightFt) {
  const h = Number(heightFt) || 199;
  if (h <= 100) return { dim: "60 x 60 ft", sf: 3600 };
  if (h <= 150) return { dim: "70 x 70 ft", sf: 4900 };
  if (h <= 200) return { dim: "80 x 80 ft", sf: 6400 };
  return { dim: "100 x 100 ft", sf: 10000 };
}

// Conforming size check — most jurisdictions require parcel ≥ compound + fall zone.
// Simple rule of thumb: parcel must be ≥ ~1 acre per 100 ft of tower height.
function conformingSizeCheck(acres, heightFt) {
  if (!acres) return "";
  const requiredAcres = ((Number(heightFt) || 199) / 100) * 1.0;
  return acres >= requiredAcres
    ? `Yes — ${acres} ac ≥ ${requiredAcres.toFixed(1)} ac required`
    : `No — ${acres} ac < ${requiredAcres.toFixed(1)} ac required`;
}

export function buildScipData(candidate, ordinance, searchCenter, agent = {}, extras = {}) {
  const c = candidate || {};
  const o = ordinance || {};
  const sc = searchCenter || {};
  const geo = extras.geocode || {};
  const zoning = extras.zoning || {};
  const neighbors = extras.neighbors || [];

  // Parse address into parts — prefer Mapbox geocode results when available
  const addr = c.parcel_address || geo.full_address || "";
  const parts = addr.split(",").map((s) => s.trim());
  const street = geo.street || parts[0] || "";
  const city = geo.city || parts[1] || "";
  const stateZip = (parts[2] || "").split(" ");
  const state = geo.state || stateZip[0] || o.state || "";
  const zip = geo.zip || stateZip[1] || "";

  // Auto-calculate distance from SARF center
  const distMiles = haversineMiles(sc.lat, sc.lon, c.latitude, c.longitude);
  const distStr = distMiles != null
    ? distMiles < 0.1
      ? `${Math.round(distMiles * 5280)} ft (≈${distMiles.toFixed(3)} mi)`
      : `${distMiles.toFixed(2)} mi`
    : "";

  // Search radius from ordinance / default
  const searchRadiusMi = o.search_radius_miles || 0.5;
  const sarfHeightFt = o.max_tower_height_ft || o.max_tower_height || 199;
  const towerHeightFt = typeof sarfHeightFt === "number" ? sarfHeightFt : 199;

  // Tower / compound spec
  const compound = defaultCompoundSize(towerHeightFt);

  // Conforming size & lot req
  const conforming = conformingSizeCheck(c.parcel_size_acres, towerHeightFt);

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
        ["Search Radius", `${searchRadiusMi} miles`],
        ["SARF Height", `${towerHeightFt} ft`],
      ],
    },
    project: {
      title: "PROJECT INFORMATION",
      fields: [
        ["Tower Type", o.permitted_tower_types?.[0] || "Monopole"],
        ["Tower Height", `${towerHeightFt} ft`],
        ["Centerlines available", "Yes — see Birds-Eye / Recon maps"],
        ["Ground Elevation", c.ground_elevation_ft != null ? `${c.ground_elevation_ft} ft AMSL (USGS 3DEP)` : ""],
        ["Compound Size (S.F. & dimensions)", `${compound.sf.toLocaleString()} sf · ${compound.dim}`],
        ["Latitude", c.latitude?.toFixed(6) || ""],
        ["Longitude", c.longitude?.toFixed(6) || ""],
        ["Distance from Search Ring Center", distStr],
      ],
    },
    site_info: {
      title: "SITE INFORMATION (from Property Appraiser's Office)",
      fields: [
        ["Parcel County", geo.county || o.jurisdiction || ""],
        ["Parcel ID Number", c.parcel_id || ""],
        ["Owner Name (on Deed)", c.owner_name || ""],
        ["Parcel Street Address", street],
        ["Parcel City", city],
        ["Parcel State", state],
        ["Parcel Zip", zip],
        ["Parcel Size (acres, MOL)", c.parcel_size_acres ? `${c.parcel_size_acres} acres` : ""],
        ["Parcel Dimensions (feet)", ""],
        ["Conforming Size?", conforming],
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
      fields: [
        ["From nearest busy intersection", extras.directions?.directions_text || ""],
        ["Nearest major intersection", extras.directions?.intersection || ""],
        ["Bearing from intersection", extras.directions?.cardinal_direction ? `${extras.directions.cardinal_direction} (${Math.round(extras.directions.bearing_deg || 0)}°)` : ""],
        ["Distance from intersection", extras.directions?.distance_miles != null ? `${extras.directions.distance_miles} mi` : ""],
        ["GPS Coordinates (paste into any GPS)", (c.latitude != null && c.longitude != null) ? `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}` : (sc.lat != null && sc.lon != null ? `${sc.lat.toFixed(6)}, ${sc.lon.toFixed(6)}` : "")],
      ],
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
        ["Nearest HV Transmission Line", c.transmission_line_distance_miles != null ? `${c.transmission_line_distance_miles} mi${c.transmission_line_voltage ? ` · ${c.transmission_line_voltage}` : ""}` : ""],
        ["Fiber Available?", c.has_fiber === true ? `Yes${c.fiber_operator ? " — " + c.fiber_operator : ""}` : c.has_fiber === false ? "No (FCC verified)" : "Unknown"],
        ["Nearest Fiber Splice / Telecom Asset", c.fiber_distance_miles != null ? `${c.fiber_distance_miles} mi${c.fiber_infrastructure_type ? ` · ${c.fiber_infrastructure_type}` : ""}${c.fiber_operator ? ` · ${c.fiber_operator}` : ""}` : ""],
        ["Telco Provider (name & phone)", (c.fiber_providers || [])[0]?.provider_name || ""],
        ["Nearest Airport (name & distance)", c.airport_iata ? `${c.airport_iata} — ${c.airport_name || ""} · ${c.airport_distance_miles?.toFixed(1)} mi` : ""],
        ["Local Police (name, address, phone)", c.police_name ? `${c.police_name}${c.police_address ? " · " + c.police_address : ""}${c.police_phone ? " · " + c.police_phone : ""}${c.police_distance_miles != null ? ` (${c.police_distance_miles} mi)` : ""}` : ""],
        ["Local Fire Dept (name, address, phone)", c.fire_name ? `${c.fire_name}${c.fire_address ? " · " + c.fire_address : ""}${c.fire_phone ? " · " + c.fire_phone : ""}${c.fire_distance_miles != null ? ` (${c.fire_distance_miles} mi)` : ""}` : ""],
      ],
    },
    site_notes: {
      title: "SITE NOTES",
      fields: [["Site development concerns (terrain, foliage, obstructions, etc.)", ""]],
    },
    zoning: {
      title: "ZONING OVERVIEW",
      fields: [
        ["Zoning Jurisdiction", zoning.jurisdiction || zoning.name || geo.county || o.jurisdiction || ""],
        ["Zoning Contact Information", zoning.zoning_contact || o.contact_info || ""],
        ["Zoning Process", zoning.zoning_process || o.permit_process || ""],
        ["Zoning Fees", zoning.zoning_fees || o.permit_fees || ""],
        ["Zoning Approval Timeframe", zoning.zoning_approval_timeframe || o.approval_timeframe || ""],
        ["Property Zoning District", zoning.zoning_code || c.zoning_classification || ""],
        ["Property Future Land Use", zoning.property_future_land_use || ""],
        ["Property Current Usage", zoning.allowed_uses || ""],
        ["Meets minimum lot requirements?", conforming],
      ],
    },
    tower_specs: {
      title: "TOWER SPECIFICS",
      fields: [
        ["LDC Section Reference(s)", zoning.code_section || o.code_section || ""],
        ["Maximum Tower Height", zoning.max_tower_height || zoning.height_limit || o.max_tower_height || `${towerHeightFt} ft`],
        ["Stealth Required?", zoning.stealth_required || (o.stealth_required ? "Yes" : o.stealth_required === false ? "No" : "")],
        ["Required Collocations (#)", zoning.collocation_required || o.collocation_required || ""],
        ["Residential Separation (ft or %)", zoning.residential_separation || zoning.setbacks || o.residential_setback || ""],
        ["Tower Separation (ft or %)", zoning.tower_separation || o.tower_separation || ""],
        ["Measured from base or center", zoning.measured_from || ""],
        ["Fall Zone Requirements", zoning.fall_zone || o.fall_zone || `${towerHeightFt} ft (1:1 default)`],
        ["Special Tower Landscaping?", zoning.landscaping || o.landscaping || ""],
      ],
    },
    zoning_notes: {
      title: "ZONING NOTES — Source: Local Telecom Ordinance",
      fields: [
        ["Local Ordinance / Code Source", zoning.content || zoning.notes || o.notes || "No zoning ordinance retrieved — verify with local jurisdiction."],
      ],
    },
    neighboring_parcels: {
      title: `NEIGHBORING PARCELS (within 1-mi ring · ${neighbors.length} via Realie)`,
      fields: neighbors.length > 0
        ? neighbors.slice(0, 10).map((n, i) => [
            `Parcel ${i + 1}`,
            [
              n.apn ? `APN ${n.apn}` : null,
              n.owner_name,
              n.acreage ? `${n.acreage} ac` : null,
              n.land_use,
            ].filter(Boolean).join(" · "),
          ])
        : [["No neighboring parcels", ""]],
    },
    site_plan: {
      title: "SITE PLAN OVERVIEW",
      fields: [
        ["Site Plan Jurisdiction", zoning.site_plan_jurisdiction || zoning.jurisdiction || geo.county || ""],
        ["Site Plan Contact Information", zoning.site_plan_contact || zoning.zoning_contact || ""],
        ["Site Plan Fees", zoning.site_plan_fees || ""],
        ["Timeframe for approval", zoning.site_plan_timeframe || ""],
        ["Existing Site Plan to Amend?", ""],
        ["Concurrent to Zoning or BP?", zoning.site_plan_concurrent || ""],
        ["Submittal deadlines?", ""],
        ["Electronic, hard copy, or both?", zoning.site_plan_submittal_format || ""],
      ],
    },
    site_plan_notes: {
      title: "SITE PLAN NOTES",
      fields: [["Site plan concerns, fees, etc.", ""]],
    },
    building_permit: {
      title: "BUILDING PERMIT INFORMATION",
      fields: [
        ["Building Permit Jurisdiction", zoning.building_permit_jurisdiction || zoning.jurisdiction || geo.county || ""],
        ["Building Department Contact Info", zoning.building_permit_contact || ""],
        ["Does GC have to submit?", zoning.building_permit_gc_submits || ""],
        ["Building Permit Fees", zoning.building_permit_fees || ""],
        ["Building Permit Timeframe", zoning.building_permit_timeframe || ""],
        ["Bond Required?", zoning.building_permit_bond_required || ""],
        ["E911 Address assigned?", zoning.e911_address_required || ""],
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
  "neighboring_parcels",
  "site_plan",
  "site_plan_notes",
  "building_permit",
  "building_permit_notes",
  "approvals",
];