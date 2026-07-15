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
      "Alright, this is where the magic starts. Let's fill out the Site Parameters form together, and so you can follow along, I filled it out with my own info. For the name, I typed Tom. The ring name is required — I called mine Samson 75. Tower height: one hundred fifty feet. Now here's the easy button: the Address or Parcel ID field is completely optional — if you have an address, type it in, add the state, and hit Find, and SiteHawk pulls the exact coordinates for you automatically. County and State are optional too; they just sharpen the lookup. Then pick your search radius — I went with the half mile — and your compound size. For coordinates, I entered latitude 29.06452 and longitude negative 82.17241, but you can also hit Use My Location if you're standing on the site. Once your coordinates are locked in, smash that Scan button and watch SiteHawk sweep every parcel in your ring. Or better yet — hit Next right now and I'll fill the whole form out with my example and run the scan for you myself. Watch this. And remember — when the next stop pops up, hit that Play button so I can keep talking. I get lonely when you don't press Play.",
  },
  {
    path: "/search",
    key: "/search/sarf-map",
    title: "SARF Map — your search ring",
    scrollTo: '[data-tour="sarf-map"]',
    narration:
      "Beautiful — look at that. The moment you hit Scan, SiteHawk landed your center coordinates dead-on and drew the half-mile search ring you selected right around them. That ring is your hunting ground — every parcel inside it is now in play. Before we move on, notice the top left corner of the map: those are your view toggles. Flip them on and off to see your search area from every angle — satellite, terrain, parcel lines, you name it. Now that we know exactly where we're hunting, we need to find out what the local ordinance says about telecommunications towers and antennas — the rules of the game before we pick a parcel. Hit Next, then smash that Play button — don't leave me hanging up here.",
  },
  {
    path: "/search",
    key: "/search/zoning",
    title: "Zoning — the rules of the game",
    scrollTo: '[data-tour="zoning"]',
    autoClick: '[data-tour="run-zoning"]',
    narration:
      "Here's Section Two — Zoning. See that white Run Zoning button in the blue banner? Normally you'd click it yourself — but you're riding with me, so I just pressed it for you. Right now SiteHawk is pulling the local telecommunications ordinance for this exact jurisdiction: the maximum tower height they'll allow, setback rules, fall-zone requirements, separation from residential, whether stealth design is required, and the approval path — administrative review or a full public hearing. This is the stuff that kills deals late when you skip it early. SiteHawk reads the ordinance for you so you know the rules of the game before you ever pick a parcel. Now, before we pick our parcels, when you hit Next I'm going to press the Scan Colocation Opportunities button for you and show you every existing structure nearby you could potentially colocate on instead of building new. Hit Next and let's take a look — and don't forget to press Play when you get there. It's my favorite button.",
  },
  {
    path: "/search",
    key: "/search/colocation",
    title: "Colocation — what's already out there",
    scrollTo: '[data-tour="colocation"]',
    autoClick: '[data-tour="run-colocation"]',
    narration:
      "There it goes — I just hit the Scan Colocation Opportunities button for you. SiteHawk is sweeping FCC registered structures and crowdsourced cell data for every existing site within three miles of your ring, and dropping each one as a pin on the map. Now, one important thing: not every pin is a tower. Some are building rooftops, and some are antennas — signal-only points where a cell signal was detected but there's no registered structure. Hover over any pin, or click it, and a card pops up telling you exactly what it is, who owns it, and how tall it stands. And below the map there's a spreadsheet listing every single site — owner, headquarters, structure type, height, coordinates, and distance — so you can see at a glance what each pin represents. If one of these works for your carrier, colocating can save months of zoning and construction. When you're done exploring, hit Next, press Play, and I'll show you my favorite part — picking the target parcels.",
  },
  {
    path: "/search",
    key: "/search/targets",
    title: "Target Parcels — the cool part",
    scrollTo: '[data-tour="targets"]',
    autoClick: '[data-tour="run-targets"]',
    narration:
      "Now THIS is my favorite part. See that Run Targets button in the green banner? Normally you'd smash that yourself — but you're riding shotgun with me, so I just smashed it for you. Right now SiteHawk is sweeping every single parcel inside your ring and scoring each one against real tower-siting criteria — acreage, zoning classification, flood risk, how well a compound fits, distance from residential. Then it hands you the three best candidates: Target A, Target B, and Target C, ranked and ready, with the owner's name and mailing address already attached. What used to take a site acquisition agent days at the county assessor's office happens right here in seconds. Target A becomes your lead site, and B and C are your backups if the owner says no. From here the rest of the pipeline runs on Target A — maps, siting, propagation, the whole SCIP. When the targets land, hit Next — and remember, every time a new page comes up, press Play and I'll keep talking you through it.",
  },
  {
    path: "/search",
    key: "/search/map-suite-full",
    title: "Map Suite — I'll run all 14 for you",
    scrollTo: '[data-tour="map-suite"]',
    // One continuous run: the guide clicks every map button in order, waiting
    // for each map to finish (which unlocks the next button) before clicking on.
    autoClickSequence: [
      '[data-tour="map-aerial"] button',
      '[data-tour="map-topo"] button',
      '[data-tour="map-fema"] button',
      '[data-tour="map-zoning"] button',
      '[data-tour="map-flum"] button',
      '[data-tour="map-wetlands"] button',
      '[data-tour="map-airport"] button',
      '[data-tour="map-celltower"] button',
      '[data-tour="map-parcel"] button',
      '[data-tour="map-row"] button',
      '[data-tour="map-wind"] button',
      '[data-tour="map-fiber"] button',
      '[data-tour="map-power"] button',
      '[data-tour="map-viewshed"] button',
    ],
    narration:
      "Alright my friend, buckle up — this is the big one. The Hawk Target A Map Suite: fourteen maps and data pulls that turn Target A from a green shape on a map into a fully documented tower candidate. And here's the best part — you don't have to lift a finger. I'm going to run the entire suite for you right now, clicking every button myself, one map at a time, top to bottom. Now, why does this matter so much? Because every map in this suite answers a question somebody is going to ask. The landowner wants to know their property is truly right for a tower before they sign anything. The community wants to know the site is safe, sensible, and out of harm's way. The jurisdiction wants proof you did your homework before you ever file. And the carrier wants to know the site will actually perform. This suite answers all four — in one sitting. So sit back and watch the maps land — this takes a few minutes, because these are fourteen live data pulls, not stock images. Every map stays open on the page when it finishes. And here's the plan: once map fourteen, the 2D Viewshed, completes, hit Next and press Play — I'll take you right back up to the Aerial Map and walk you down through every single one, explaining what each map means and who cares about it. See you at the top.",
  },
  {
    path: "/search",
    key: "/search/map-suite-walkthrough",
    title: "Map Suite — the guided walkthrough",
    scrollTo: '[data-tour="map-aerial"]',
    // Timed scroll-down: once narration starts, the guide scrolls from map to
    // map on this schedule (ms per map) while the narrator explains each one.
    autoScrollSequence: [
      { selector: '[data-tour="map-aerial"]', dwellMs: 24000 },
      { selector: '[data-tour="map-topo"]', dwellMs: 12000 },
      { selector: '[data-tour="map-fema"]', dwellMs: 14000 },
      { selector: '[data-tour="map-zoning"]', dwellMs: 10000 },
      { selector: '[data-tour="map-flum"]', dwellMs: 15000 },
      { selector: '[data-tour="map-wetlands"]', dwellMs: 14000 },
      { selector: '[data-tour="map-airport"]', dwellMs: 15000 },
      { selector: '[data-tour="map-celltower"]', dwellMs: 14000 },
      { selector: '[data-tour="map-parcel"]', dwellMs: 11000 },
      { selector: '[data-tour="map-row"]', dwellMs: 12000 },
      { selector: '[data-tour="map-wind"]', dwellMs: 14000 },
      { selector: '[data-tour="map-fiber"]', dwellMs: 9000 },
      { selector: '[data-tour="map-power"]', dwellMs: 14000 },
      { selector: '[data-tour="map-viewshed"]', dwellMs: 20000 },
    ],
    narration:
      "Beautiful — all fourteen maps are open on the page. Now let's walk them together, top to bottom. I'll do the scrolling — you just watch, and feel free to hit Stop any time you want to linger on one. First, the Aerial Map — a crisp satellite look at Target A and everything around it. It's the first thing an owner, a planner, and a carrier all want to see: what's really on the ground. Next up, Topography — contour lines and ground elevation. Steep terrain means expensive site work for the owner and drainage questions for the jurisdiction. Now FEMA Floodplain — flood zones straight from FEMA. Flood risk drives engineering, insurance, and whether the community's emergency planners will ever be comfortable with the compound. Then the Zoning Map — the parcel's zoning district drawn right on the map, the jurisdiction's own rulebook made visible. Next, Future Land Use — the community's long-range plan. It tells you whether this area stays rural or transitions toward homes, which matters enormously to the neighbors and the planning board alike. Now the Wetlands Map — mapped wetland areas around the parcel. Wetlands protect the community's water and wildlife, and finding them now saves the owner from a permitting nightmare later. Next, the Nearest Airport — straight-line distance to the closest airfield. That's your early FAA signal: height limits and lighting requirements that matter to pilots and the whole community's airspace. Then the Nearest Cell Tower — existing infrastructure, ownership, and distance. Carriers care deeply about separation and coverage gaps, and jurisdictions often require this in the application. Map nine, the Parcel Map — the exact legal boundary of Target A with the premium parcel details. This is the owner's land, drawn to the inch. Next, Right of Way and parcel indicators — road access, frontage, and the practical route into the compound. No access road, no tower — simple as that. Now Wind Speed — the design wind criteria for this exact spot. This drives the structural engineering that keeps the tower standing through the worst storm the community will ever see. Then Fiber Optics — nearby lit buildings and backhaul routes. Without fiber, the carrier's signal has nowhere to go. Next, the Power Grid — the serving utility, substations, and transmission lines. Every tower needs reliable power, and the tie-in distance goes straight into the carrier's budget. And finally — my personal favorite, the 2D Viewshed. North, south, east, and west line-of-sight profiles from your proposed tower height, showing exactly where terrain or tree lines block the signal. This is the map that tells the carrier what this site will really do. And that's the full suite — fourteen answers for the owner, the community, the jurisdiction, and the carrier, generated in minutes instead of weeks. Hit Next and press Play — the Compliance pre-screen is up next, and trust me, it's the coolest thing in this whole pipeline.",
  },
  {
    path: "/search",
    key: "/search/compliance",
    title: "Compliance — Section 106 / NEPA",
    scrollTo: '[data-tour="compliance"]',
    autoClick: '[data-tour="compliance-run"]',
    narration:
      "Welcome to my favorite flex — the Compliance pre-screen. I just pressed the Run Compliance Report button for you. Right now SiteHawk is checking Target A against the eight federal NEPA environmental triggers from 47 CFR 1.1307 — floodplain, wetlands, endangered species habitat, historic districts, residential zoning, hazardous waste sites, and tower lighting for migratory birds — using the data the map suite just collected. No re-typing, no second research pass. In seconds you'll see whether this site qualifies for a Categorical Exclusion or needs a deeper environmental assessment, plus the Section 106 historic-review posture and the 30-day FCC shot clock that governs tribal notification. This is the stuff that stalls projects for months when it's discovered late — SiteHawk surfaces it on day one. Flip any trigger yourself, then generate the full printable compliance report for your file. When you're ready, hit Next and press Play — we're heading to Hawk Docs.",
  },
  {
    path: "/hawk-docs",
    title: "Hawk Docs — upload your documents",
    narration:
      "Hawk Docs is your document brain. Upload leases, deeds, surveys — and here's the part most people miss: upload your zoning permits and building permits too. Hawk Docs reads them with AI, pulls out every key field — dates, parties, parcel numbers, conditions — and organizes them so you never dig through a PDF again. The more permits and documents you feed it, the more it helps you out down the road when a carrier or attorney asks for them. Hit Next — and yes, press Play. You knew I was going to say that.",
  },
  {
    path: "/hawk-law",
    title: "Hawk Law — your lease analyst",
    narration:
      "Hawk Law reviews tower leases like a telecom attorney. Upload a lease and it flags one-sided clauses, missing escalators, weak termination language, and below-market rent — clause by clause, with plain-English explanations. Use the redline tool to compare versions and see exactly what the other side changed. It's analysis, not legal advice — but it means you walk into every negotiation knowing where the bodies are buried. Next and Play when you're ready.",
  },
  {
    path: "/hawkfit-map",
    title: "HawkFit Map",
    narration:
      "HawkFit answers one question fast: will a tower actually fit on this parcel? Look up any property, drop a tower on the map, and HawkFit checks setbacks, fall zones, and compound size against the parcel boundary in real time. Save scenarios that work and export a map exhibit for your landowner packet. Hit Next, press Play — I'll be waiting.",
  },
  {
    path: "/hawk-tracker",
    title: "Hawk Tracker",
    narration:
      "Hawk Tracker is your project milestone board. Every site you're working moves through its milestones here — site walk, lease negotiation, zoning application, construction. Nothing falls through the cracks, and the weekly report writes itself. Next, then Play — you're a pro at this now.",
  },
  {
    path: "/mail-orders",
    title: "Mail Orders",
    narration:
      "This page tracks your physical mail campaigns. Every postcard you send to a property owner shows up here with live delivery status. Pair a postcard drop with a skip-trace follow-up call a week later — that one-two punch gets landowners on the phone. Hit Next and give Play a tap.",
  },
  {
    path: "/coverage-analysis",
    title: "Coverage Analysis",
    narration:
      "Here you model RF coverage from any tower location. Set your transmitter height and frequency, run the propagation, and see exactly what a tower at your site would cover. Great for showing a carrier why your candidate beats the alternatives. Almost home — Next, then Play.",
  },
  {
    path: "/billing",
    title: "Billing",
    narration:
      "Manage your subscription and usage here. Upgrade, downgrade, or open the billing portal any time. One last stop before we wrap up — hit Next and I'll show you Time Savers, the toolkit that keeps every deal organized. And press Play when you land — last chances to smash that button.",
  },
  {
    path: "/crm",
    title: "Time Savers — track every deal",
    narration:
      "Welcome to Time Savers — the toolkit that keeps you organized after the deal work starts. Every parcel you pursue becomes a deal you track from first contact to signed lease. Now, the big advantage: SiteHawk connects straight to HubSpot. That gives you enterprise-grade email sequences, call logging, and a full marketing engine your whole team already knows — and SiteHawk pushes your parcel data, owner info, and deals into it automatically, so your CRM always mirrors your site work without manual data entry. Connect it once and every deal you save here flows straight in. One final stop — hit Next and press Play one last time.",
  },
  {
    path: "/hubspot",
    title: "HubSpot Integration",
    narration:
      "Connect your HubSpot account here. Once linked, SiteHawk pushes your contacts and deals directly into HubSpot's pipeline — owner name, parcel details, skip-traced phone numbers and all. That means your outreach team works in the CRM they already live in, while SiteHawk does the site intelligence. That's the end of the tour — you now know the whole SiteHawk workflow, from search ring to signed lease. Go find some towers.",
  },
];

// A page can host multiple stops (e.g. /search); key identifies each clip.
export function stopKey(stop) {
  return stop.key || stop.path;
}

export function firstStopIndex(pathname) {
  return TOUR_STOPS.findIndex((s) => s.path === pathname);
}