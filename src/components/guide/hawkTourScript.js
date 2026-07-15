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
    title: "Site Search — enter your site",
    scrollTo: '[data-coach="sarf-name"]',
    autoFill: {
      agent_name: "Tom",
      ring_name: "Samson 75",
      tower_height_ft: 150,
      radius_miles: 0.5,
      lat: 29.06452,
      lon: -82.17241,
    },
    narration:
      "Alright, this is where the magic starts. Let's fill out the Site Parameters form together, and so you can follow along, I filled it out with my own info. For the name, I typed Tom. The ring name is required — I called mine Samson 75. Tower height: one hundred fifty feet. Now here's the easy button: the Address or Parcel ID field is completely optional — if you have an address, type it in, add the state, and hit Find, and SiteHawk pulls the exact coordinates for you automatically. County and State are optional too; they just sharpen the lookup. Then pick your search radius — I went with the half mile — and your compound size. For coordinates, I entered latitude 29.06452 and longitude negative 82.17241, but you can also hit Use My Location if you're standing on the site. Once your coordinates are locked in, smash that Scan button and watch SiteHawk sweep every parcel in your ring. Or better yet — hit Next right now and I'll fill the whole form out with my example and run the scan for you myself. Watch this.",
  },
  {
    path: "/search",
    key: "/search/sarf-map",
    title: "SARF Map — your search ring",
    scrollTo: '[data-tour="sarf-map"]',
    narration:
      "Beautiful — look at that. The moment you hit Scan, SiteHawk landed your center coordinates dead-on and drew the half-mile search ring you selected right around them. That ring is your hunting ground — every parcel inside it is now in play. Before we move on, notice the top left corner of the map: those are your view toggles. Flip them on and off to see your search area from every angle — satellite, terrain, parcel lines, you name it. Now that we know exactly where we're hunting, we need to find out what the local ordinance says about telecommunications towers and antennas — the rules of the game before we pick a parcel. Hit Next and let's pull the zoning requirements.",
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

// A page can host multiple stops (e.g. /search); key identifies each clip.
export function stopKey(stop) {
  return stop.key || stop.path;
}

export function firstStopIndex(pathname) {
  return TOUR_STOPS.findIndex((s) => s.path === pathname);
}