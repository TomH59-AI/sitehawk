// Jurisdiction Resource Registry — shared constants for the SCIP card and the
// admin Resource Manager. One source of truth for types, labels, and statuses.

export const RESOURCE_TYPES = [
  { value: "zoning_ordinance", label: "Zoning Ordinance" },
  { value: "zoning_map", label: "Zoning Map / GIS" },
  { value: "parcel_gis", label: "Parcel GIS" },
  { value: "wireless_telecom_ordinance", label: "Wireless / Telecom Code" },
  { value: "planning_department", label: "Planning Department" },
  { value: "building_department", label: "Building Department" },
  { value: "permit_portal", label: "Permit Portal" },
  { value: "permit_search", label: "Permit Search" },
  { value: "planning_application", label: "Planning Application" },
  { value: "building_permit_forms", label: "Applications & Forms" },
  { value: "conditional_use_or_special_use", label: "Conditional / Special Use Process" },
  { value: "fee_schedule", label: "Fee Schedule" },
  { value: "public_hearing_process", label: "Public Hearing Process" },
  { value: "contact_page", label: "Contacts Page" },
  { value: "other", label: "Other" },
];

export const resourceTypeLabel = (v) =>
  RESOURCE_TYPES.find((t) => t.value === v)?.label || v;

export const RESOURCE_STATUS = {
  verified: { label: "Verified", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  needs_review: { label: "Needs Review", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-800 border-amber-300" },
  broken: { label: "Broken", dot: "bg-red-500", badge: "bg-red-100 text-red-800 border-red-300" },
  unavailable: { label: "Unavailable", dot: "bg-red-500", badge: "bg-red-100 text-red-800 border-red-300" },
};

export const JURISDICTION_TYPES = [
  { value: "municipality", label: "Municipality" },
  { value: "city", label: "City" },
  { value: "county", label: "County" },
  { value: "township", label: "Township" },
  { value: "village", label: "Village" },
  { value: "unincorporated_county", label: "Unincorporated County" },
  { value: "special_district", label: "Special District" },
];

export const DEPARTMENTS = [
  { value: "planning", label: "Planning" },
  { value: "zoning", label: "Zoning" },
  { value: "building", label: "Building" },
  { value: "permitting", label: "Permitting" },
  { value: "engineering", label: "Engineering" },
  { value: "clerk", label: "Clerk" },
  { value: "fire", label: "Fire" },
  { value: "public_works", label: "Public Works" },
  { value: "other", label: "Other" },
];

export const SOURCE_PLATFORMS = [
  "Official jurisdiction website",
  "Municode",
  "eCode360",
  "American Legal",
  "Accela",
  "Citizenserve",
  "Tyler EnerGov",
  "ArcGIS",
  "Other",
];

// CSV import/export template columns (exact order matters for the template).
export const CSV_COLUMNS = [
  "jurisdiction_name",
  "state",
  "county",
  "jurisdiction_type",
  "official_website_url",
  "resource_type",
  "resource_title",
  "resource_url",
  "source_platform",
  "resource_status",
  "verified_on",
  "resource_notes",
  "department",
  "contact_name",
  "contact_title",
  "contact_email",
  "contact_phone",
  "contact_website",
  "contact_notes",
];