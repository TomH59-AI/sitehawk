/**
 * appDestinations — the single searchable index of every place a subscriber can
 * go in SiteHawk. Shared by the top-bar quick search (AppSearch) and the full
 * Search page (/find). Pure data: no pipeline or backend dependency.
 */

export const APP_DESTINATIONS = [
  {
    path: "/dashboard",
    label: "Dashboard",
    group: "Find & Package the Site",
    desc: "Your SiteHawk journey, workflow index, and recent activity.",
    keywords: "home start overview stats journey index",
  },
  {
    path: "/search",
    label: "Site Search",
    group: "Find & Package the Site",
    desc: "Run the full SARF pipeline — search ring, zoning, targets, maps, SCIP.",
    keywords: "sarf search ring scan parcels pipeline scip candidate sections",
  },
  {
    path: "/talonfit",
    label: "TalonFit®",
    group: "Find & Package the Site",
    desc: "Ordinance intelligence — max buildable height, ten-target scout, boundary map.",
    keywords: "talonfit ordinance height setback fall zone scout ten target buildable separation",
  },
  {
    path: "/hawk-tracker",
    label: "Hawk Tracker",
    group: "After Your SCIP",
    desc: "Track every site's progress and milestones on a live map.",
    keywords: "tracker sites progress milestones status map import",
  },
  {
    path: "/follow-up-tracker",
    label: "Follow-Up Tracker",
    group: "After Your SCIP",
    desc: "Never lose a callback — reminders and follow-up tasks per site.",
    keywords: "follow up reminders tasks callbacks digest",
  },
  {
    path: "/skip-trace",
    label: "Skip-Trace",
    group: "After Your SCIP",
    desc: "Find landowner phone numbers and emails for outreach.",
    keywords: "skip trace owner phone email contact landowner batch enformion",
  },
  {
    path: "/crm",
    label: "AI Time Savers",
    group: "After Your SCIP",
    desc: "CRM, postcard mailers, and the tools that save you hours.",
    keywords: "crm deals contacts postcards mailers time savers outreach letters lob",
  },
  {
    path: "/hawk-lease",
    label: "HawkLease",
    group: "After Your SCIP",
    desc: "Lease sites, rent comps, and revenue reporting.",
    keywords: "lease rent comps hawklease revenue sites reports",
  },
  {
    path: "/hawk-law",
    label: "Hawk Law",
    group: "After Your SCIP",
    desc: "Lease analysis, redlines, and clause library.",
    keywords: "law legal lease review redline clauses sessions history",
  },
  {
    path: "/hawk-vision",
    label: "HawkVision",
    group: "Specialty Tools",
    desc: "Upload a parcel photo and composite the tower, compound, and landscaping.",
    keywords: "vision photo render tower visualization 3d image landowner",
  },
  {
    path: "/zoning-verifier",
    label: "Zoning Verifier",
    group: "Specialty Tools",
    desc: "AI cross-check of zoning accuracy before you submit.",
    keywords: "zoning verify accuracy check ordinance district",
  },
  {
    path: "/rfi-engine",
    label: "RF Intelligence Engine",
    group: "Specialty Tools",
    desc: "Nationwide RF map — existing towers, coverage, and colocation.",
    keywords: "rf radio coverage propagation towers map colocation opencellid asr",
  },
  {
    path: "/fiber-operators",
    label: "Local Services Directory",
    group: "Specialty Tools",
    desc: "Fiber, power, police, fire, and 911 contacts by ZIP.",
    keywords: "fiber power utility police fire 911 psap backhaul operators directory zip",
  },
  {
    path: "/hawk-fill",
    label: "HawkFill",
    group: "Forms & Documents",
    desc: "Upload your own carrier template and let SiteHawk fill it.",
    keywords: "hawkfill upload template fill my document carrier",
  },
  {
    path: "/hawk-forms",
    label: "Hawk Forms",
    group: "Forms & Documents",
    desc: "FCC and FAA forms library — ASR, 7460, and more.",
    keywords: "forms fcc faa 7460 asr paperwork filings",
  },
  {
    path: "/hawk-docs",
    label: "Document Intelligence",
    group: "Forms & Documents",
    desc: "Scan and extract data from uploaded documents.",
    keywords: "documents scan extract analyze pdf intelligence signature share",
  },
  {
    path: "/pricing",
    label: "Pricing & Plans",
    group: "Account",
    desc: "Compare tiers and upgrade your subscription.",
    keywords: "pricing plans subscription upgrade tiers cost hawksite hawkeyes apex",
  },
  {
    path: "/billing",
    label: "Billing",
    group: "Account",
    desc: "Manage payment method, invoices, and usage.",
    keywords: "billing invoice payment card subscription manage usage portal",
  },
  {
    path: "/about",
    label: "About SiteHawk",
    group: "Account",
    desc: "What SiteHawk is and who built it.",
    keywords: "about company info help skywave",
  },
];

export function searchDestinations(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  return APP_DESTINATIONS.filter(
    (d) =>
      d.label.toLowerCase().includes(q) ||
      d.desc.toLowerCase().includes(q) ||
      d.keywords.includes(q) ||
      d.group.toLowerCase().includes(q)
  );
}