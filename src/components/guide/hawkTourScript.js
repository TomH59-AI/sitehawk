/*
 * Hawk Voice Guide — page-by-page tour script.
 * Edit any `narration` text freely; changed text auto-regenerates its audio
 * on the next play (old cached clip is simply ignored).
 * Order of TOUR_STOPS = the order of the guided tour.
 */

// Default narrator: ElevenLabs "Brian" — deep, confident American narrator.
// Swap this id for any voice in your ElevenLabs voice library.
export const GUIDE_VOICE_ID = "nPczCjzI2devNBz1zQrb";

export const TOUR_STOPS = [
  {
    path: "/dashboard",
    title: "Welcome to SiteHawk",
    narration:
      "Welcome to SiteHawk — your command center for cell tower site acquisition. This dashboard shows your stats, your recent parcel evaluations, and your prospecting workflow at a glance. Everything you do in SiteHawk starts here. When you're ready, head to Site Search to run your first search ring. I'll walk you through every page as you go — just press play on any page where you see me.",
  },
  {
    path: "/search",
    title: "Site Search — the SCIP pipeline",
    narration:
      "This is the heart of SiteHawk. Enter your search ring coordinates, radius, and tower height in Section 1 to generate your SARF map. Section 2 pulls the local zoning and permitting rules automatically. Section 3 scores every parcel in your ring and picks your top three targets. Here's a pro move: use skip-trace on your Target A owner. Skip-trace digs up the owner's real phone numbers and email addresses — the ones that aren't in public records — so you can reach the decision maker directly instead of mailing a dead address. Sections 4 through 8 build your maps, compliance checks, infrastructure and RF coverage. Work top to bottom and the SCIP document builds itself.",
  },
  {
    path: "/results",
    title: "Scan Results",
    narration:
      "These are your scan results — every candidate parcel from your searches, scored and ranked. Click any candidate to review its zoning, flood risk, wind design, and buildability. From here you can push a winner into the CRM, send the owner a postcard, or open the full SCIP workflow on it.",
  },
  {
    path: "/crm",
    title: "CRM — track every deal",
    narration:
      "This is your deal pipeline. Every parcel you pursue becomes a deal card you drag through stages, from first contact to signed lease. Now, the big advantage: SiteHawk connects to both HubSpot and Attio. HubSpot gives you enterprise-grade email sequences, call logging, and a full marketing engine your whole team already knows. Attio is faster and more flexible — it syncs your parcel data, owner enrichment, and deal notes automatically, so your CRM always mirrors your site work without manual data entry. Connect either one from this page and every deal you save here flows straight into it.",
  },
  {
    path: "/hubspot",
    title: "HubSpot Integration",
    narration:
      "Connect your HubSpot account here. Once linked, SiteHawk pushes your contacts and deals directly into HubSpot's pipeline — owner name, parcel details, skip-traced phone numbers and all. That means your outreach team works in the CRM they already live in, while SiteHawk does the site intelligence. Set it up once and forget it.",
  },
  {
    path: "/hawk-docs",
    title: "Hawk Docs — upload your documents",
    narration:
      "Hawk Docs is your document brain. Upload leases, deeds, surveys — and here's the part most people miss: upload your zoning permits and building permits too. Hawk Docs reads them with AI, pulls out every key field — dates, parties, parcel numbers, conditions — and organizes them so you never dig through a PDF again. The more permits and documents you feed it, the more it helps you out down the road when a carrier or attorney asks for them.",
  },
  {
    path: "/hawk-law",
    title: "Hawk Law — your lease analyst",
    narration:
      "Hawk Law reviews tower leases like a telecom attorney. Upload a lease and it flags one-sided clauses, missing escalators, weak termination language, and below-market rent — clause by clause, with plain-English explanations. Use the redline tool to compare versions and see exactly what the other side changed. It's analysis, not legal advice — but it means you walk into every negotiation knowing where the bodies are buried.",
  },
  {
    path: "/hawkfit-map",
    title: "HawkFit Map",
    narration:
      "HawkFit answers one question fast: will a tower actually fit on this parcel? Look up any property, drop a tower on the map, and HawkFit checks setbacks, fall zones, and compound size against the parcel boundary in real time. Save scenarios that work and export a map exhibit for your landowner packet.",
  },
  {
    path: "/hawk-tracker",
    title: "Hawk Tracker",
    narration:
      "Hawk Tracker is your project milestone board. Every site you're working moves through its milestones here — site walk, lease negotiation, zoning application, construction. Nothing falls through the cracks, and the weekly report writes itself.",
  },
  {
    path: "/mail-orders",
    title: "Mail Orders",
    narration:
      "This page tracks your physical mail campaigns. Every postcard you send to a property owner shows up here with live delivery status. Pair a postcard drop with a skip-trace follow-up call a week later — that one-two punch gets landowners on the phone.",
  },
  {
    path: "/coverage-analysis",
    title: "Coverage Analysis",
    narration:
      "Here you model RF coverage from any tower location. Set your transmitter height and frequency, run the propagation, and see exactly what a tower at your site would cover. Great for showing a carrier why your candidate beats the alternatives.",
  },
  {
    path: "/billing",
    title: "Billing",
    narration:
      "Manage your subscription and usage here. Upgrade, downgrade, or open the billing portal any time. That's the end of the tour — you now know the whole SiteHawk workflow, from search ring to signed lease. Go find some towers.",
  },
];

export function findStop(pathname) {
  return TOUR_STOPS.find((s) => s.path === pathname) || null;
}

export function stopIndex(pathname) {
  return TOUR_STOPS.findIndex((s) => s.path === pathname);
}