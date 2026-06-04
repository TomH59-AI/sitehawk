// Shared merge-field definitions + substitution for saved postcard templates.
// Templates store copy with {{tokens}}; these are filled in per recipient/sender
// when previewing or mailing so users write the design once and reuse it.

export const MERGE_FIELDS = [
  { token: "owner_name", label: "Property Owner Name" },
  { token: "parcel_address", label: "Parcel Address" },
  { token: "mailing_address", label: "Mailing Address" },
  { token: "sender_name", label: "Your Name" },
  { token: "sender_company", label: "Your Company" },
  { token: "sender_phone", label: "Your Phone" },
  { token: "sender_email", label: "Your Email" },
];

// Replace {{token}} occurrences (whitespace-tolerant) with values from `data`.
// Unknown / empty tokens are left blank.
export function renderTemplate(body = "", data = {}) {
  return body.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, key) => {
    const v = data[key];
    return v == null ? "" : String(v);
  });
}

// Build the merge-data object for a CRM deal + sender contact info.
export function mergeDataFromDeal(deal = {}, sender = {}) {
  return {
    owner_name: deal.owner_name || "",
    parcel_address: deal.parcel_address || "",
    mailing_address: deal.owner_mailing_address || deal.parcel_address || "",
    sender_name: sender.name || "",
    sender_company: sender.company || "",
    sender_phone: sender.phone || "",
    sender_email: sender.email || "",
  };
}

// Sample data used for live preview inside the template builder.
export const SAMPLE_MERGE_DATA = {
  owner_name: "Marion Samson",
  parcel_address: "4200 County Road 75, Karnes City, TX 78118",
  mailing_address: "PO Box 184, Karnes City, TX 78118",
  sender_name: "Jordan Hawk",
  sender_company: "SkyWave Site Acquisition",
  sender_phone: "(555) 123-4567",
  sender_email: "jordan@skywave.com",
};