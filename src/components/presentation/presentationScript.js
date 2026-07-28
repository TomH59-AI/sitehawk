/*
 * SiteHawk Pitch Deck — slide-by-slide script narrated by Brian (ElevenLabs).
 * Edit any narration freely; changed text auto-regenerates its cached audio.
 */
import { GUIDE_VOICE_ID } from "@/components/guide/hawkTourScript";

export const DECK_VOICE_ID = GUIDE_VOICE_ID;

export const DECK_SLIDES = [
  {
    key: "deck/intro",
    kicker: "A SkyWave AI Product",
    title: "SiteHawk",
    subtitle: "The AI Command Center for Cell Tower Site Acquisition",
    bullets: [
      "From search ring to signed lease — one platform",
      "50-state parcel coverage, real ordinance intelligence",
      "Days of courthouse research done in seconds",
    ],
    narration:
      "This is SiteHawk — the AI command center for cell tower site acquisition. Everything a site acquisition professional does, from the first search ring to the signed lease, lives in one platform. Fifty-state parcel coverage, real ordinance intelligence, and what used to take days at the county assessor's office now happens in seconds. Buckle up — let me show you how it works.",
  },
  {
    key: "deck/search",
    kicker: "Step One",
    title: "Site Search",
    subtitle: "Drop a ring. Find the targets.",
    bullets: [
      "Enter coordinates or an address — SiteHawk draws your search ring",
      "Live demo ring: 29.06452, −82.17241 · 0.5 mile · 150 ft AGL",
      "Every parcel inside is scanned and scored 0–100",
      "Top 3 candidates delivered: Target A, B, and C — with owners attached",
    ],
    narration:
      "It all starts with Site Search. Drop your coordinates — like our live demo ring at twenty-nine point zero six four five two, negative eighty-two point one seven two four one — pick a half-mile radius and a hundred fifty foot tower, and hit Scan. SiteHawk sweeps every single parcel inside that ring and scores each one against real tower-siting criteria. Then it hands you the three best candidates: Target A, B, and C, ranked and ready, with the owner's name and mailing address already attached.",
  },
  {
    key: "deck/zoning",
    kicker: "The Rules of the Game",
    title: "Zoning Intelligence",
    subtitle: "SiteHawk reads the ordinance so you don't have to",
    bullets: [
      "Live telecom ordinance lookup for the exact jurisdiction",
      "Height caps, setbacks, fall zones, separation, stealth requirements",
      "Approval path: admin review or public hearing — plus fees and timeframes",
    ],
    narration:
      "Before you pick a parcel, you need the rules of the game. SiteHawk pulls the local telecommunications ordinance for the exact jurisdiction — the maximum height they'll allow, setback rules, fall-zone requirements, residential separation, whether stealth design is required, and the approval path. This is the stuff that kills deals late when you skip it early. SiteHawk reads the ordinance for you, on day one.",
  },
  {
    key: "deck/talonfit",
    kicker: "Patent Pending",
    title: "TalonFit™",
    subtitle: "The tower siter that never says no",
    bullets: [
      "Runs the ordinance math across every point of the parcel",
      "Grades sites instead of rejecting them — every point gets a max height",
      "PE-certified fall-zone rescue can take a tight parcel to full height",
    ],
    narration:
      "Now the crown jewel — TalonFit, our patent-pending AI siting engine. It runs the ordinance math across every point of the parcel: per-edge setbacks, fall zones, residential buffers, tower separation. And here's what makes it different — it grades sites, it doesn't reject them. A failing spot still gets a maximum allowable height, so a no at one ninety-nine can still be a yes at one twenty. And where the ordinance allows an engineered fall-zone reduction, TalonFit finds that pathway and rescues tight parcels to full height.",
  },
  {
    key: "deck/maps",
    kicker: "Fourteen Answers",
    title: "The Hawk Map Suite",
    subtitle: "Target A, fully documented",
    bullets: [
      "Aerial, topo, FEMA flood, zoning, future land use, wetlands",
      "Airports, cell towers, parcel lines, right-of-way, wind, fiber, power",
      "2D viewshed: N/S/E/W line-of-sight from your proposed height",
    ],
    narration:
      "Then the map suite turns Target A from a green shape on a map into a fully documented candidate — fourteen live maps and data pulls. Aerial, topography, FEMA flood zones, zoning, future land use, wetlands, nearest airport, existing towers, parcel boundaries, road access, design wind speed, fiber routes, the power grid, and my personal favorite — the 2D viewshed showing exactly what your tower will see in every direction. Every map answers a question the owner, the community, the jurisdiction, or the carrier is going to ask.",
  },
  {
    key: "deck/compliance",
    kicker: "Federal Pre-Screen",
    title: "Hawk Compliance",
    subtitle: "Section 106 / NEPA on day one",
    bullets: [
      "Checks all 8 federal NEPA triggers from 47 CFR 1.1307",
      "CatEx vs. Environmental Assessment determination",
      "SHPO 30-day shot clock and tribal consultation posture",
    ],
    narration:
      "Compliance stalls projects for months when it's discovered late. SiteHawk pre-screens Target A against all eight federal NEPA environmental triggers — floodplain, wetlands, endangered species, historic districts, and more — using the data the map suite already collected. In seconds you know whether the site qualifies for a categorical exclusion or needs deeper review, plus the Section 106 posture and the thirty-day FCC shot clock.",
  },
  {
    key: "deck/owner",
    kicker: "Find the Owner",
    title: "Deed + Skip Trace",
    subtitle: "Proof of ownership and a phone number",
    bullets: [
      "Warranty deed of record — type, book and page, chain of title",
      "Multi-source skip trace: phones ranked freshest-first, emails, DNC flags",
      "LLC piercing to find the person behind the entity",
    ],
    narration:
      "Now the money step. SiteHawk pulls the deed of record so you know you're talking to the person who actually holds title, then runs a multi-source skip trace — hunting down every phone number and email on record for the owner, ranked freshest-first, with the best number flagged. A deed in one hand and a phone number in the other — that's how deals get started.",
  },
  {
    key: "deck/outreach",
    kicker: "Start the Conversation",
    title: "Outreach + CRM",
    subtitle: "Postcards, pipeline, and HubSpot sync",
    bullets: [
      "One-click AI-drafted postcards mailed to Target owners via Lob",
      "14-stage deal pipeline from SCIP Generated to Lease Approved",
      "Automatic HubSpot sync — contacts and deals, no manual entry",
    ],
    narration:
      "Then SiteHawk starts the conversation for you. One click sends an AI-drafted postcard to the owner's mailbox with live delivery tracking. Every target becomes a deal in a fourteen-stage pipeline, from SCIP generated all the way to lease approved. And it all syncs straight into HubSpot automatically — owner info, parcel details, skip-traced numbers — so your team works in the CRM they already know.",
  },
  {
    key: "deck/visuals",
    kicker: "Show, Don't Tell",
    title: "3D + HawkVision",
    subtitle: "Renders that win over landowners",
    bullets: [
      "Interactive 3D scene: to-scale parcel, tower, and landscaped compound",
      "HawkVision composites the tower right into a photo of the parcel",
      "Snapshot exhibits for the landowner packet",
    ],
    narration:
      "Landowners say yes to what they can see. SiteHawk builds an interactive 3D scene of the parcel with the tower and landscaped compound placed on it — and HawkVision goes further, compositing the tower directly into a real photo of the property. Drone view, eye level, or street view. These are the exhibits that turn a skeptical owner into a signed lease.",
  },
  {
    key: "deck/law",
    kicker: "Negotiate Like a Pro",
    title: "Hawk Law",
    subtitle: "AI lease analysis, clause by clause",
    bullets: [
      "Flags one-sided clauses, missing escalators, below-market rent",
      "GREEN / YELLOW / RED clause ratings with negotiation strategy",
      "Redline comparison shows exactly what the other side changed",
    ],
    narration:
      "When the lease lands on your desk, Hawk Law reviews it like a telecom attorney. Clause by clause, it flags one-sided language, missing escalators, weak termination terms, and below-market rent — green, yellow, red — with a negotiation strategy attached. The redline tool compares versions so you see exactly what the other side changed. You walk into every negotiation knowing where the bodies are buried.",
  },
  {
    key: "deck/tracker",
    kicker: "Nothing Falls Through",
    title: "Hawk Tracker + SCIP",
    subtitle: "18 gates from search ring to on-air",
    bullets: [
      "18-gate milestone tracker: Search Ring Received → NTP Issued",
      "The full SCIP package: a carrier-ready site candidate report",
      "Shareable read-only links — the weekly report writes itself",
    ],
    narration:
      "And it all rolls up into the deliverable — the SCIP. A complete, carrier-ready site candidate information package with every map, every data point, and every finding. Hawk Tracker then walks each site through eighteen deployment gates, from search ring received to notice to proceed, so nothing ever falls through the cracks.",
  },
  {
    key: "deck/brian",
    kicker: "Your AI Wingman",
    title: "Ask Brian",
    subtitle: "An AI assistant who knows SiteHawk inside and out",
    bullets: [
      "Ask Brian anything — zoning, parcels, the SCIP, the report — he answers out loud",
      "He knows the page you're on and guides you forward if you get stuck",
      "Talk to him by voice or type — he'll walk you through the next step",
    ],
    narration:
      "And meet Brian — your AI wingman, built right into every page of SiteHawk. Ask him anything about zoning, parcels, the SCIP, or the report, and he answers you out loud, in his own voice. He knows the page you're on, so if you ever get stuck, just ask Brian and he'll walk you through the next step. Think of him as your personal site acquisition expert, available twenty-four seven. He's the reason nobody on the SiteHawk platform ever feels lost.",
  },
  {
    key: "deck/close",
    kicker: "SiteHawk by SkyWave AI",
    title: "Go Find Some Towers",
    subtitle: "From search ring to signed lease — in one platform",
    bullets: [
      "Built by site acquisition professionals, for site acquisition professionals",
      "https://site-hawk-pro.com/  ·  Call (810) 373-5419",
    ],
    narration:
      "That's SiteHawk — search ring to signed lease, one platform, built by site acquisition professionals for site acquisition professionals. What used to take weeks now takes an afternoon. Go find some towers.",
  },
];