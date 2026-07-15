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
    key: "/search/maps",
    title: "Map Suite — the Target A deep dive",
    scrollTo: '[data-tour="map-suite"]',
    autoClick: '[data-tour="map-aerial"] button',
    narration:
      "Now that Target A is locked in, the map pipeline kicks in — the Hawk Target A Map Suite. This is fourteen maps and data pulls, run one at a time, each button unlocking the next: Aerial, Topography, FEMA Floodplain, Zoning, Future Land Use, Wetlands, Nearest Airport, Nearest Cell Tower, Parcel, ROW indicators, Wind Speed, Fiber Optics, Power Grid, and the 2D Viewshed — then the compliance pre-screen, the warranty deed, and a full skip-trace on the owner. To get you rolling, I just pressed the Run Aerial Map button for you — normally you'd click each one yourself as you review it. Take a look at that aerial shot of Target A — and here's a pro tip: on this map and every map in this tutorial, feel free to grab it, scroll, pan, and zoom around for a better view. It won't disrupt me or the tour one bit, anywhere in this walkthrough. When you're ready, hit Next and press Play — I'll fire the next map for you.",
  },
  {
    path: "/search",
    key: "/search/maps-topo",
    title: "Topography Map — contours & elevation",
    scrollTo: '[data-tour="map-topo"]',
    autoClick: '[data-tour="map-topo"] button',
    narration:
      "We're showing off now — I just smashed the Run Topography Map button for you too. Map number two draws the contour lines across the ring and gives you the Target A ground elevation above mean sea level. Tight contours mean steep terrain and potentially expensive site work. Hit Next when it finishes, tap Play, and we'll keep running the suite in order.",
  },
  {
    path: "/search", key: "/search/maps-fema", title: "FEMA Floodplain Map", scrollTo: '[data-tour="map-fema"]', autoClick: '[data-tour="map-fema"] button',
    narration: "Map three is the FEMA Floodplain Map, and I just started it for Target A. This checks the parcel centroid against FEMA flood data and overlays the floodplain so you can see whether the compound faces flood risk, added engineering, or insurance concerns. When it finishes, hit Next for zoning — and give that Play button a smash so I can walk you through it.",
  },
  {
    path: "/search", key: "/search/maps-zoning", title: "Target A Zoning Map", scrollTo: '[data-tour="map-zoning"]', autoClick: '[data-tour="map-zoning"] button',
    narration: "Now we're running the Target A Zoning Map. This resolves the parcel's zoning district and draws the available zoning geometry, giving you a visual check against the telecommunications rules we researched earlier. Hit Next when the zoning layer is ready, then Play — you know the drill by now.",
  },
  {
    path: "/search", key: "/search/maps-flum", title: "Future Land Use Map", scrollTo: '[data-tour="map-flum"]', autoClick: '[data-tour="map-flum"] button',
    narration: "Next is Future Land Use. I just pressed Run FLUM Map for Target A. Current zoning tells you what applies today; future land use shows the jurisdiction's long-range plan and can reveal whether the area is intended to stay rural, become commercial, or transition toward residential development. Next, then Play — keep me talking.",
  },
  {
    path: "/search", key: "/search/maps-wetlands", title: "Wetlands Map", scrollTo: '[data-tour="map-wetlands"]', autoClick: '[data-tour="map-wetlands"] button',
    narration: "Here comes the Wetlands Map. SiteHawk is overlaying mapped wetland areas around Target A so you can spot environmental constraints before a survey or site walk. Wetlands can affect compound placement, access, permitting, and construction cost. Hit Next when the map completes and press Play on the other side.",
  },
  {
    path: "/search", key: "/search/maps-airport", title: "Nearest Airport Map", scrollTo: '[data-tour="map-airport"]', autoClick: '[data-tour="map-airport"] button',
    narration: "I'm running the Nearest Airport Map now. It identifies the closest airport to Target A, measures the straight-line distance, and maps both locations. That proximity is an early indicator for FAA review and possible height or lighting considerations. When you're ready — Next, then Play.",
  },
  {
    path: "/search", key: "/search/maps-celltower", title: "Nearest Cell Tower Map", scrollTo: '[data-tour="map-celltower"]', autoClick: '[data-tour="map-celltower"] button',
    narration: "Now SiteHawk is finding and mapping the nearest existing cell tower to Target A. This gives you an immediate view of nearby infrastructure, ownership, structure type, and distance — useful context for separation rules, colocation options, and market coverage. Hit Next and hit Play — that button loves the attention.",
  },
  {
    path: "/search", key: "/search/maps-parcel", title: "Target A Parcel Map", scrollTo: '[data-tour="map-parcel"]', autoClick: '[data-tour="map-parcel"] button',
    narration: "Map nine is the Parcel Map. I just started the Target A parcel-boundary pull. This draws the parcel in the context of the full search ring and brings in the premium parcel details used by the next step. Review the shape and surrounding parcels, then hit Next and press Play.",
  },
  {
    path: "/search", key: "/search/maps-row", title: "ROW & Parcel Indicators", scrollTo: '[data-tour="map-row"]', autoClick: '[data-tour="map-row"] button',
    narration: "This is the right-of-way and premium parcel indicator step. It reuses the parcel data we just pulled to evaluate road access, frontage, parcel characteristics, and the other indicators that matter when you need a practical route into the proposed compound. Next and Play, my friend.",
  },
  {
    path: "/search", key: "/search/maps-wind", title: "Wind Speed Map", scrollTo: '[data-tour="map-wind"]', autoClick: '[data-tour="map-wind"] button',
    narration: "Now we're running the Wind Speed Map for Target A. SiteHawk pulls the design wind criteria and flags hurricane-prone or special-wind conditions. Those values matter directly to structural design, foundation engineering, and tower cost. Hit Next, hit Play — let's keep rolling.",
  },
  {
    path: "/search", key: "/search/maps-fiber", title: "Fiber Optics Map", scrollTo: '[data-tour="map-fiber"]', autoClick: '[data-tour="map-fiber"] button',
    narration: "Next is Fiber Optics. I just started the infrastructure search around Target A. This maps nearby lit and near-net buildings and identifies local carrier context, helping you understand whether backhaul is close or whether the site may need a longer, more expensive connection. You know what's next — Next, then Play.",
  },
  {
    path: "/search", key: "/search/maps-power", title: "Power Grid Map", scrollTo: '[data-tour="map-power"]', autoClick: '[data-tour="map-power"] button',
    narration: "Now we're mapping the power grid around Target A — the serving utility, nearby substations, and transmission corridors. Every tower needs reliable power, so this gives you an early look at likely service availability and potential tie-in distance. One more map to go — hit Next and press Play for the grand finale of the suite.",
  },
  {
    path: "/search", key: "/search/maps-viewshed", title: "2D Viewshed Map", scrollTo: '[data-tour="map-viewshed"]', autoClick: '[data-tour="map-viewshed"] button',
    narration: "This is map fourteen, the 2D Viewshed. SiteHawk is generating north, south, east, and west line-of-sight profiles from Target A using the proposed tower height and terrain elevation. This helps reveal where terrain or tree-line assumptions may obstruct coverage. Once this finishes, the full Target A Mapping Suite is complete. Hit Next, press Play, and we'll move on to Hawk Docs.",
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