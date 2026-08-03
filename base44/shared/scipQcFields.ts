const clean = (value: unknown) => value == null ? "" : String(value).trim();
const meaningful = (value: unknown) => {
  const text = clean(value).toLowerCase();
  return !!text && !["tbd", "none", "null", "undefined", "n/a"].includes(text) && !text.startsWith("tbd —");
};
const target = (record: any) => record?.parcel_targets?.[record?.active_target_index || 0] || {};
const zoningValue = (record: any, terms: string) => {
  const wanted = terms.toLowerCase().split(" ");
  for (const [key, raw] of Object.entries(record?.zoning_report || {})) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    if (!wanted.every((word) => normalized.includes(word))) continue;
    const value = raw && typeof raw === "object" ? (raw as any).value : raw;
    if (meaningful(value)) return value;
  }
  return null;
};

const FIELDS: Array<[string, string, string, (record: any) => unknown]> = [
  ["agent_name", "Agent Name", "SITE ACQUISITION", (r) => r.agent_name],
  ["agent_phone", "Agent Phone", "SITE ACQUISITION", (r) => r.agent_phone],
  ["agent_email", "Agent E-mail", "SITE ACQUISITION", (r) => r.agent_email],
  ["submittal_date", "Submittal Date", "SITE ACQUISITION", (r) => r.submittal_date],
  ["site_name", "Site Name", "SEARCH RING INFORMATION", (r) => r.site_name],
  ["ring_lat", "Latitude", "SEARCH RING INFORMATION", (r) => r.latitude],
  ["ring_lon", "Longitude", "SEARCH RING INFORMATION", (r) => r.longitude],
  ["search_radius", "Search Radius", "SEARCH RING INFORMATION", (r) => r.search_radius],
  ["sarf_height", "SARF Height", "SEARCH RING INFORMATION", (r) => r.sarf_height],
  ["tower_type", "Tower Type", "PROJECT INFORMATION", (r) => zoningValue(r, "tower type")],
  ["tower_height", "Tower Height", "PROJECT INFORMATION", (r) => r.sarf_height],
  ["centerlines", "Centerlines available", "PROJECT INFORMATION", (r) => zoningValue(r, "centerline")],
  ["ground_elevation", "Ground Elevation", "PROJECT INFORMATION", (r) => r.hawk_maps?.center_amsl_ft],
  ["compound_size", "Compound Size (S.F. & dimensions)", "PROJECT INFORMATION", (r) => zoningValue(r, "compound")],
  ["target_lat", "Latitude", "PROJECT INFORMATION", (r) => target(r).latitude],
  ["target_lon", "Longitude", "PROJECT INFORMATION", (r) => target(r).longitude],
  ["dist_from_src", "Distance from Search Ring Center", "PROJECT INFORMATION", (r) => target(r).distance_from_center],
  ["parcel_county", "Parcel County", "SITE INFORMATION", (r) => target(r).county || r.county],
  ["parcel_id", "Parcel ID Number", "SITE INFORMATION", (r) => target(r).apn],
  ["owner_deed", "Owner Name (on Deed)", "SITE INFORMATION", (r) => target(r).owner_name],
  ["parcel_address", "Parcel Street Address", "SITE INFORMATION", (r) => target(r).parcel_address],
  ["parcel_city", "Parcel City", "SITE INFORMATION", (r) => target(r).parcel_city || target(r).city],
  ["parcel_state", "Parcel State", "SITE INFORMATION", (r) => r.state],
  ["parcel_zip", "Parcel Zip", "SITE INFORMATION", (r) => target(r).parcel_zip],
  ["parcel_size", "Parcel Size (acres, MOL)", "SITE INFORMATION", (r) => target(r).acreage],
  ["parcel_dims", "Parcel Dimensions (feet)", "SITE INFORMATION", (r) => target(r).boundaries],
  ["conforming_size", "Conforming Size?", "SITE INFORMATION", (r) => zoningValue(r, "conforming")],
  ["taxes_paid", "Taxes Paid-to-Date?", "SITE INFORMATION", (r) => zoningValue(r, "taxes")],
  ["owner_names", "Name(s)", "OWNER INFORMATION", (r) => target(r).owner_name],
  ["owner_contact_person", "Contact Person", "OWNER INFORMATION", (r) => r.owner_contacts?.contact_person],
  ["owner_mailing", "Mailing Address", "OWNER INFORMATION", (r) => target(r).mailing_address],
  ["owner_email", "E-mail Address", "OWNER INFORMATION", (r) => r.owner_contacts?.best_email],
  ["owner_phone", "Phone Number", "OWNER INFORMATION", (r) => r.owner_contacts?.best_phone],
  ["flood_zone", "Flood Zone(s)", "EXISTING CONDITIONS", (r) => r.existing_conditions?.flood_zone || target(r).fema_risk_factor],
  ["wetland_concerns", "Wetland Concerns?", "EXISTING CONDITIONS", (r) => r.existing_conditions?.wetland_concerns],
  ["water_mgmt_district", "Water Management District", "EXISTING CONDITIONS", (r) => r.existing_conditions?.water_management_district],
  ["haz_waste", "Hazardous Waste Concerns?", "EXISTING CONDITIONS", (r) => r.existing_conditions?.hazardous_waste],
  ["access_notes", "Access Notes (ROW, driveway, code)", "EXISTING CONDITIONS", (r) => r.existing_conditions?.access_notes],
  ["power_provider", "Power Provider (name & phone)", "EXISTING CONDITIONS", (r) => r.power_airport_maps?.power?.company || r.power_airport_maps?.power?.name],
  ["fiber_available", "Fiber Available?", "EXISTING CONDITIONS", (r) => zoningValue(r, "fiber")],
  ["telco_provider", "Telco Provider (name & phone)", "EXISTING CONDITIONS", (r) => zoningValue(r, "telco")],
  ["nearest_airport", "Nearest Airport (name & distance)", "EXISTING CONDITIONS", (r) => r.power_airport_maps?.airport?.name],
  ["local_police", "Local Police (municipality & phone)", "EXISTING CONDITIONS", (r) => r.existing_conditions?.local_police],
  ["local_fire", "Local Fire Dept (municipality & phone)", "EXISTING CONDITIONS", (r) => r.existing_conditions?.local_fire],
  ["site_notes", "Site development concerns (terrain, foliage, obstructions, generators or microwaves prohibited)", "SITE NOTES", (r) => r.description || zoningValue(r, "site notes")],
  ["zoning_jurisdiction", "Zoning Jurisdiction", "ZONING OVERVIEW", (r) => r.zoning_jurisdiction],
  ["zoning_contact", "Zoning Contact Information", "ZONING OVERVIEW", (r) => zoningValue(r, "zoning contact")],
  ["zoning_process", "Zoning Process", "ZONING OVERVIEW", (r) => zoningValue(r, "zoning process")],
  ["zoning_fees", "Zoning Fees", "ZONING OVERVIEW", (r) => zoningValue(r, "zoning fee")],
  ["zoning_timeframe", "Zoning Approval Timeframe", "ZONING OVERVIEW", (r) => zoningValue(r, "zoning approval")],
  ["zoning_classification", "Property Zoning District Classification", "ZONING OVERVIEW", (r) => target(r).zoning_classification || r.hawk_maps?.zone_code],
  ["min_lot", "Meets minimum lot requirements?", "ZONING OVERVIEW", (r) => zoningValue(r, "minimum lot")],
  ["ldc_ref", "LDC Section Reference(s)", "TOWER SPECIFICS", (r) => zoningValue(r, "ldc")],
  ["max_tower_height", "Maximum Tower Height", "TOWER SPECIFICS", (r) => zoningValue(r, "maximum tower height")],
  ["stealth", "Stealth Required?", "TOWER SPECIFICS", (r) => zoningValue(r, "stealth")],
  ["collocations", "Required Collocations (#)", "TOWER SPECIFICS", (r) => zoningValue(r, "collocation")],
  ["res_separation", "Residential Separation (ft or %)", "TOWER SPECIFICS", (r) => zoningValue(r, "residential separation")],
  ["tower_separation", "Tower Separation (ft or %)", "TOWER SPECIFICS", (r) => zoningValue(r, "tower separation")],
  ["measured_from", "Measured from base or center", "TOWER SPECIFICS", (r) => zoningValue(r, "measured")],
  ["fall_zone", "Fall Zone Requirements", "TOWER SPECIFICS", (r) => zoningValue(r, "fall zone")],
  ["landscaping", "Special Tower Landscaping?", "TOWER SPECIFICS", (r) => zoningValue(r, "landscaping")],
  ["sp_jurisdiction", "Site Plan Jurisdiction", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "site plan jurisdiction")],
  ["sp_contact", "Site Plan Contact Information", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "site plan contact")],
  ["sp_fees", "Site Plan Fees", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "site plan fee")],
  ["sp_timeframe", "Timeframe for approval", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "site plan timeframe")],
  ["sp_amend", "Existing Site Plan to Amend?", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "amend")],
  ["sp_concurrent", "Concurrent to Zoning or BP?", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "concurrent")],
  ["sp_deadlines", "Submittal deadlines?", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "deadline")],
  ["sp_format", "Electronic, hard copy, or both?", "SITE PLAN OVERVIEW", (r) => zoningValue(r, "electronic")],
  ["site_plan_notes", "Site plan concerns, fees, etc.", "SITE PLAN FILING DOCUMENTS", (r) => zoningValue(r, "site plan notes")],
  ["bp_jurisdiction", "Building Permit Jurisdiction", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "building permit jurisdiction")],
  ["bp_contact", "Building Department Contact Info", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "building department contact")],
  ["bp_gc", "Does GC have to submit?", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "gc")],
  ["bp_fees", "Building Permit Fees", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "building permit fee")],
  ["bp_timeframe", "Building Permit Timeframe", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "building permit timeframe")],
  ["bp_bond", "Bond Required?", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "bond")],
  ["bp_e911", "E911 Address assigned?", "BUILDING PERMIT INFORMATION", (r) => zoningValue(r, "e911")],
  ["bp_expire", "When does the building permit expire once it's been pulled", "BUILDING PERMIT NOTES", (r) => zoningValue(r, "expire")],
];

export function collectMissingScipFields(record: any) {
  return FIELDS.filter(([, , , getter]) => !meaningful(getter(record)))
    .map(([key, label, section]) => ({ key, label, section }));
}

export function scipQcContext(record: any) {
  const selected = target(record);
  return {
    site_name: record?.site_name,
    latitude: selected.latitude ?? record?.latitude,
    longitude: selected.longitude ?? record?.longitude,
    address: selected.parcel_address,
    county: record?.county || selected.county,
    state: record?.state,
    jurisdiction: record?.zoning_jurisdiction,
  };
}

export function applyQcFills(sections: any[], filled: Record<string, string> = {}) {
  return (sections || []).map((section) => ({
    ...section,
    rows: (section.rows || []).map((row) => {
      const descriptor = FIELDS.find(([, label]) => label === row.label);
      const value = descriptor ? filled[descriptor[0]] : null;
      return value && !meaningful(row.value) ? { ...row, value } : row;
    }),
  }));
}