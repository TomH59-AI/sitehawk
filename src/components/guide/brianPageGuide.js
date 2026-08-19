// Brian's per-page playbook. Keyed by route prefix (longest match wins).
// Each entry tells Brian exactly what's on the page, what the user is
// probably trying to do, and how to guide them step by step.

export const PAGE_GUIDES = [
  {
    path: "/dashboard",
    title: "Dashboard",
    guide: `The user's home base. On screen: usage stats cards, recent SCIP records table, a recent-parcels map, the prospecting workflow index, and quick links into Site Search. Common asks: "where do I start?" → tell them to open Site Search from the left sidebar, drop coordinates, and generate a SCIP. "Where are my old sites?" → the recent SCIPs table right on this page; clicking a row opens that SCIP.`,
  },
  {
    path: "/search",
    title: "Site Search",
    guide: `THE core workflow page — a numbered, section-by-section SCIP pipeline. Section 1: enter agent info, site name, coordinates (or click the map), search radius (0.25/0.5/1 mi), and SARF height, then generate the SARF ring map. Section 2: zoning & permitting lookup for the jurisdiction. Section 3: the top 3 candidate parcels (Target A/B/C) with owner, APN, acreage, and 0-100 scores — plus skip-trace, CRM push, and postcard buttons per target. Section 4: the Hawk Maps suite (aerial, topo, floodplain, zoning, viewshed, power/airport). Later sections: Tower Siter, proximity, infrastructure, RF propagation, colocation. At the bottom: the Generate SCIP button. Common asks: "why is a section locked?" → sections unlock in order, complete the prior one. "How do I change Target A?" → in Section 3 they can promote a backup target. "Where's the report?" → Generate SCIP at the end, then view/share from the SCIP page.`,
  },
  {
    path: "/scip/new",
    title: "New SCIP",
    guide: `Form to start a SCIP record directly: agent info, site name, coordinates, radius, SARF height. Submitting creates the record and opens its detail page.`,
  },
  {
    path: "/scip",
    title: "SCIP Detail / Preview",
    guide: `A single SCIP record — the assembled Site Candidate Information Package. On screen: the SARF map, target parcels, zoning worksheet, Hawk Maps, existing conditions, viewshed, local authorities table, and print/share buttons. Studio and AnthemNet formats are reachable from here. Common asks: "how do I share this?" → Share SCIP button creates a read-only link. "How do I print/export?" → the Print SCIP button builds the document. "Data looks stale after switching targets" → sections regenerate for the new active target; rerun the affected section.`,
  },
  {
    path: "/results",
    title: "Scan Results",
    guide: `Results view after a site scan: ranked candidate parcels on a map with filter/sort controls, candidate cards with scores, owner mailer options, and RF coverage panel. Common asks: "how do I contact an owner?" → use the mailer card or push the candidate to CRM.`,
  },
  {
    path: "/crm",
    title: "Time Savers / CRM",
    guide: `The site-acquisition CRM: deal pipeline for parcel owners (stages from prospect to signed), mail queue panel, postcard template builder, export buttons, and HubSpot/Google Sheets sync. Common asks: "how do deals get here?" → targets are auto-pushed when a SCIP is generated, or manually via the CRM push buttons in Site Search Section 3.`,
  },
  {
    path: "/skip-trace",
    title: "Hawk Skip-Trace",
    guide: `Owner contact discovery. Enter an owner name + mailing address (or pick from a SCIP target) → returns phones and emails with source counts and confidence. Results save onto the SCIP so the Document Studio always carries them. Common asks: "no results?" → LLC owners may need entity piercing; try the registered agent name.`,
  },
  {
    path: "/hubspot",
    title: "HubSpot CRM Sync",
    guide: `Shows the live HubSpot connection status and explains the sync: SCIP targets auto-push to HubSpot as contact + deal, idempotent, plus manual push buttons in Site Search Section 3. Common asks: "it says connection needs attention" → a workspace admin must reconnect HubSpot.`,
  },
  {
    path: "/mail-orders",
    title: "Mail Orders",
    guide: `List of postcard mail orders with per-recipient delivery status from Lob. Common asks: "did my postcard send?" → check the order's status column here.`,
  },
  {
    path: "/mail-analytics",
    title: "Mail Analytics",
    guide: `Charts of postcard campaign performance — volumes, statuses, engagement over time.`,
  },
  {
    path: "/send-update",
    title: "Send Update",
    guide: `Admin tool to send an update notification email to registered app users. Compose the message and send; only registered users can receive it.`,
  },
  {
    path: "/hawk-tracker",
    title: "Hawk Tracker",
    guide: `The 18-gate deployment milestone tracker, from Search Ring Received to NTP Issued. Each site card shows gate status, blocked flags, and carrier on-air date. Includes CSV import wizard and a weekly "moved this week" report. Common asks: "how do I add sites?" → the add-site form or the CSV Import wizard.`,
  },
  {
    path: "/pilot-tracker",
    title: "Pilot Tracker",
    guide: `Simplified read-only tracker view for pilot clients — site cards and activity feed, no editing.`,
  },
  {
    path: "/follow-up-tracker",
    title: "Follow-Up Tracker",
    guide: `Tracks owner follow-ups with due dates; a daily digest email summarizes what's due.`,
  },
  {
    path: "/tower-siter",
    title: "Tower Siter (HawkPerch)",
    guide: `2D tower placement solver on a parcel: loads parcel geometry + ordinance rules, then computes setbacks, fall zone, compound fit, and tower separation. Controls: tower height, type, compound size, PE-letter toggle for engineered fall-zone reduction. Output: buildable candidate area, proposed compound, verdict (clean pass / PE relief possible / fail), plus 3D image and exhibit export buttons. Common asks: "why did it fail?" → check the binding constraint in the verdict panel (height cap, fall zone, setback). "Can PE letter help?" → toggle it on and rerun.`,
  },
  {
    path: "/hawkfit-map",
    title: "HawkFit Map",
    guide: `Interactive tower-fit map: look up a property (address/APN/coords via Realie), the parcel boundary draws on the map, then drag the tower point and adjust height/compound to see live fit status (works/fails with reasons). TalonFit® certification runs from here. Save scenarios for later. Common asks: "parcel won't load" → try coordinates instead of address.`,
  },
  {
    path: "/hawk-vision",
    title: "HawkVision",
    guide: `AI photo renders: upload a photo of the parcel and HawkVision composites a to-scale tower, fenced compound, and landscaped buffer into that photo. Options: tower height/type, compound size (50/75/100), buffer (10/25/50 ft), camera perspective (drone/eye-level/street). Common asks: "render looks off" → try a wider photo with clear ground visible.`,
  },
  {
    path: "/hawk-lease",
    title: "Hawk Lease",
    guide: `Lease portfolio tracking: dashboard, sites list with lease records (status, carrier, term, escalation, key dates), rent comp library, and reports. Common asks: "where do I add a lease?" → Sites tab → add site → fill the lease record.`,
  },
  {
    path: "/hawk-law",
    title: "Hawk Law",
    guide: `AI lease analysis. New Analysis tab: upload a telecom ground lease, pick your side (landlord or carrier — locked after first run), get clause-by-clause GREEN/YELLOW/RED flags, top issues, and negotiation strategy. Also: Sessions (past analyses), Clauses (boilerplate library), Redline Counter (compare original vs redlined, accept/reject/counter each change). Common asks: "can I switch sides?" → no, the side is locked per session; start a new analysis.`,
  },
  {
    path: "/hawk-docs",
    title: "Document & Permit Intelligence",
    guide: `Tabbed hub: Permit Applications (upload a zoning/permit PDF → AI reads every field and pre-fills from a linked SCIP), Lease Analysis, Redline Counter, and the Jurisdiction Resource Manager (verified ordinance/permit links per jurisdiction). Common asks: "how do I fill a county form?" → upload it under Permit Applications and link your SCIP.`,
  },
  {
    path: "/hawk-frequency",
    title: "Hawk Frequency",
    guide: `RF tools: height comparison, path profile between two points, and coverage heatmap cards.`,
  },
  {
    path: "/coverage-analysis",
    title: "Coverage Analysis",
    guide: `CloudRF coverage simulation: set transmitter location, height, frequency, and power in the sidebar, run the simulation, and view the coverage heatmap with a legend on the map.`,
  },
  {
    path: "/siting-iq",
    title: "Siting IQ™",
    guide: `Nationwide RF map: existing towers in view, filters by operator/type, overlays, search box, and compass. Common asks: "find towers near my site" → search the address, towers load in the visible map area.`,
  },
  {
    path: "/zoning-verifier",
    title: "Hawk Zoning Verifier",
    guide: `AI agent that double-checks zoning accuracy for a jurisdiction — give it the jurisdiction and it verifies ordinance details against sources.`,
  },
  {
    path: "/ordinance-hunter",
    title: "Ordinance Hunter",
    guide: `Super agent that finds a jurisdiction's telecom ordinance: scrapes sources, extracts structured rules (height, setbacks, fall zone), saves to the registry, and can mirror to Notion.`,
  },
  {
    path: "/site-power-map",
    title: "Site Power Map",
    guide: `Map of nearest electric provider and transmission lines relative to a site, with provider contact details.`,
  },
  {
    path: "/power-lines",
    title: "Power Lines Dashboard",
    guide: `US transmission-line explorer: search lines by owner/voltage/substation with a map and details panel, plus an AI power-line advisor chat.`,
  },
  {
    path: "/InfrastructureIntelligence",
    title: "Infrastructure Intelligence",
    guide: `Combined infrastructure map: fiber routes, cell towers, power, and broadband layers around a site.`,
  },
  {
    path: "/usage-analytics",
    title: "Usage Analytics (admin)",
    guide: `Admin-only analytics of subscriber usage across features.`,
  },
  {
    path: "/subscriber-crm",
    title: "Subscriber CRM (admin)",
    guide: `Admin-only customer-success CRM for SiteHawk subscribers: health scores, churn risk, tiers, campaigns.`,
  },
  {
    path: "/billing",
    title: "Billing",
    guide: `The user's subscription: current plan, usage bar, upgrade options, Stripe billing portal access, and account deletion. Common asks: "how do I upgrade?" → pick a plan here or on Pricing; checkout opens via Stripe (works from the published app, not the preview iframe).`,
  },
  {
    path: "/pricing",
    title: "Pricing & Plans",
    guide: `Plan comparison: HawkSite, HawkVision, Hawk Law bundles, and enterprise tiers with monthly prices. Selecting a plan starts Stripe checkout.`,
  },
  {
    path: "/hawk-fill",
    title: "Hawk Fill",
    guide: `Auto-fills external forms from SCIP data: pick a site, review the field mapping, export.`,
  },
  {
    path: "/hawk-forms",
    title: "Hawk Forms",
    guide: `Library of reusable telecom site-acquisition form templates as cards.`,
  },
];

// Longest-prefix match so "/scip/new" beats "/scip".
export function guideFor(pathname) {
  const sorted = [...PAGE_GUIDES].sort((a, b) => b.path.length - a.path.length);
  return sorted.find((g) => pathname.startsWith(g.path)) || null;
}

// Compact one-line-per-page index so Brian can point users to OTHER pages.
export function pageIndex() {
  return PAGE_GUIDES.map((g) => `• ${g.title} — sidebar route ${g.path}`).join("\n");
}