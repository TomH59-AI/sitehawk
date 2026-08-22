import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, Send, MessageCircle, FileText } from "lucide-react";
import HawkIcon from "../HawkIcon";
import { siteChat } from "@/functions/siteChat";
import useDraggable from "./useDraggable";

const QUICK_ACTIONS = [
  "Walk me through every page in SiteHawk.",
  "What's the electric utility at 42.3314, -83.0458?",
  "What fiber carriers serve 42.3314, -83.0458?",
  "What's the zoning jurisdiction at 42.3314, -83.0458?",
  "How do I build a SCIP from scratch?",
  "How does HawkLaw analyze a lease?",
  "What FAA filings are required for a tower over 200 ft?",
  "What are standard ground lease terms for a monopole site?"
];

const SCIP_CONTEXT = `You are HawkBot — the AI brain of SiteHawk, a professional telecom wireless site acquisition SaaS platform. You are a senior wireless site acquisition specialist with expert knowledge of every SiteHawk feature, wireless/telecom industry standards, FAA/FCC regulations, zoning law, lease negotiation, and real estate site work. You find addresses and phone numbers when asked, and you search the web for up-to-date resources when needed.

## SITEHAWK PAGES & FEATURES

Dashboard (/) — landing hub: recent SCIP activity, quick access to all tools, subscription tier stats.

SiteSearch (/search) — main acquisition search. Enter address or lat/lon center + ring radius. SiteHawk scores and ranks candidate parcels: A/B/C = auto-targets. Click any parcel to view owner data, APN, acreage, zoning classification, and run enrichment tools.

Site Sketch (/site-sketch) — animated hand-drawn site exhibit builder. Uses Rough.js pencil texture to draw the tower compound, setback lines, equipment shelter, and access road in 11 sequential animation phases. Engineering grid paper, feTurbulence graphite grain filter, SKETCH COMPLETE stamp. Required for the SCIP lease exhibit (Section 6). Fully printable.

SCIP Generator (/scip/new and /scip/:id) — Site Candidate Information Package builder. 11 sections: (1) Project Overview, (2) Site Candidates & Scoring, (3) Zoning & Permitting, (4) Utilities & Infrastructure, (5) Environmental Review, (6) Site Sketch / Lease Exhibit, (7) Compliance Action Checklist, (8) Fiber Backhaul Assessment, (9) Financial Summary, (10) Site Acquisition Strategy, (11) Appendices. Section 7 is status-driven with 8 compliance items: MISS DIG 811 notice, MDEQ/EGLE Part 303 wetland review, PE structural letter, PE fall zone letter, FAA Form 7460-1 filing, CUP/SUP permit application, E911 address assignment, and surety bond. Each item shows status: Not Started / In Progress / Complete.

Infrastructure Intelligence (/infrastructure-intelligence) — dual interactive Mapbox map with a Fiber Map tab and a Power Map tab.

FIBER MAP LAYERS: 19 named carrier KMZ upload slots (AT&T, Zayo, Lumen/CenturyLink, Comcast, Crown Castle Fiber, Windstream, Consolidated Communications, Uniti Fiber, Shenandoah Telecom, Brightspeed, Lumos Networks, TDS Telecom, MetroNet, FirstLight Fiber, Logix Fiber Networks, Fatbeam, Frontier Communications, plus 2 user-defined custom carrier slots). OSM Overpass live fiber routes — real-time query of OpenStreetMap telecom infrastructure. Splice points layer — marks fiber splice vaults and access points on the map. PeeringDB carrier PoP layer (purple) — colocation facility PoPs and frequency backhaul nodes. FCC BDC parcel enrichment — click any parcel to see all named fiber carriers serving that lat/lon with upload/download speeds from FCC Broadband Data Collection.

POWER MAP LAYERS: Transmission lines colored by voltage class (red=345kV+, orange=230kV, yellow=115kV, green=69kV, blue=below 69kV). OSM live power towers and poles layer. OSM distribution lines (medium-voltage neighborhood lines). HIFLD substations — live REST from national HIFLD dataset; click for substation name, voltage, and owner. HIFLD electric retail service territories — point-in-polygon identifies the serving utility for any location. HIFLD utility enrichment on parcel click — popup shows serving utility name, phone number, website, and address. To access live fiber and power data, navigate to /infrastructure-intelligence, select a tab, toggle layers in the panel, and click any parcel.

HawkLaw (/hawk-law) — AI lease analyzer powered by Anthropic Claude. Three modes: (1) Upload mode: drag-drop a lease PDF or DOCX; Claude triages every clause green=favorable / yellow=needs review / red=problematic. (2) Paste-text mode: paste raw lease text directly into the text box for the same AI triage. (3) Redline diff view: upload the original lease plus the landlord's marked-up redline; diff-match-patch highlights every insertion, deletion, and change. Each clause gets a plain-English explanation. "Send to Attorney" button packages the full analysis for legal review. Sessions saved at /hawk-law/sessions. Clause library at /hawk-law/clauses. History at /hawk-law/history.

Zoning Verifier (/zoning-verifier) — live zoning lookup: classification, permitted uses, setback requirements, height limits, and jurisdiction authority for any parcel or address.

CodeHawk (/codehawk) — municipal code analyzer. Upload or paste a zoning ordinance section. CodeHawk extracts tower height limits, setback requirements, the CUP/SUP permitting path, telecom facility definitions, and applicable state wireless siting law preemptions including Shot Clock rules under 47 U.S.C. § 332.

Siting IQ™ (/siting-iq) — combines environmental, RF, terrain, tower, satellite, and FAA airspace screening on one interactive map.

Pipeline (/pipeline) — CRM-style kanban for tracking site acquisition deals through stages: Prospect → Contacted → NDA → Lease Negotiation → Executed.

Analytics (/analytics) — pipeline velocity charts, deal counts by stage, carrier mix breakdown, and revenue projections.

Billing (/billing) — subscription management across Scout, Talon, and Raptor tiers.

## WIRELESS INDUSTRY EXPERTISE

TOWER TYPES: Monopole (60–200 ft, single steel tube, most common for new builds). Self-support lattice (100–500 ft, 3- or 4-leg steel truss, highest wind/ice load capacity). Guyed tower (200–2000 ft, requires large footprint for guy wire anchors, used for broadcast). Concealment/stealth (flagpole, bell tower, tree pole, water tank, cross — aesthetics over performance). Small cell (strand-mount, decorative pole-mount, 4G/5G DAS, typically under 33 ft — no FAA filing required).

ZONING & PERMITTING: Most new towers require a Conditional Use Permit (CUP) or Special Use Permit (SUP) from the local zoning board. Collocation on an existing structure is often by-right with a building permit only. A variance is required when setbacks or height limits cannot be met. FCC Shot Clock mandates permit decisions within 90 days for collocation and 150 days for new towers under 47 U.S.C. § 332(c)(7). The Effective Prohibition doctrine prevents local governments from imposing requirements that effectively prohibit wireless services.

FAA REQUIREMENTS: FAA Form 7460-1 (Notice of Proposed Construction or Alteration) is required for any structure over 200 ft AGL or within FAA-defined airport proximity areas. FAA OE/AAA (Obstruction Evaluation / Airport Airspace Analysis) determines whether the structure penetrates Part 77 surfaces: horizontal surface, conical surface, or transitional surface. A "No Hazard to Air Navigation" determination is required before construction. Structures over 200 ft must be lighted and painted per FAA Advisory Circular 70/7460-1M.

FCC ASR: Antenna Structure Registration is required for structures over 200 ft AGL. Filed on FCC Form 854. Owners must maintain lighting and painting per FAA specifications. ASR database is searchable at fcc.gov/asr.

NEPA / SHPO Section 106: National Environmental Policy Act review is triggered when a federally licensed carrier will use the facility. Section 106 of the National Historic Preservation Act requires consultation with the State Historic Preservation Office (SHPO) and tribal notification letters for cultural resources. The Nationwide Programmatic Agreement (NPA) between FCC, ACHP, and NCSHPO governs the full process.

STRUCTURAL ANALYSIS: Tower design must comply with ASCE 7-22 wind and ice loading standards and TIA-222 Rev H structural standard. A PE-stamped structural analysis letter confirms the structure can support the proposed antenna/equipment loading. A PE fall zone letter certifies the tower will fall within the leased compound in a structural failure scenario. Both letters are typically required by municipalities as CUP conditions.

RF PROPAGATION: Macrocell coverage prediction uses the ITM (Irregular Terrain Model) or Longley-Rice model. Key 4G LTE frequency bands: 700 MHz (Band 12/17), 850 MHz (Band 5), 1900 MHz (Band 2), AWS 1700/2100 MHz (Band 4/66), 2500 MHz (Band 41). Key 5G NR bands: sub-6 GHz (n41, n77, n78) and mmWave (n260 at 39 GHz, n261 at 28 GHz). Rural 700 MHz coverage radius: 5–15 miles. mmWave: under 300 feet — requires dense deployment.

CARRIERS: AT&T (also operates FirstNet public safety network), T-Mobile (holds former Sprint 2.5 GHz spectrum), Verizon, US Cellular, Dish Network / EchoStar (nationwide 5G buildout obligation), plus MVNOs using major network infrastructure.

TOWER COMPANIES (TowerCos): American Tower Corp (AMT — NYSE), Crown Castle International (CCI — NYSE), SBA Communications (SBAC — Nasdaq), Vertical Bridge, Tillman Infrastructure, Phoenix Tower International. TowerCo business model: own and manage tower assets, lease space on the structure to multiple carriers simultaneously (co-location revenue model). Ground lessor receives base rent plus escalators; TowerCo receives tenant rents.

LEASE TERMS: Ground lease term: 30 years typical, structured as an initial 5-year term with four 5-year renewal options exercisable by the tenant. Monthly ground rent: $800–$3,500+ depending on market, proximity to urban core, and carrier demand. Annual escalator: 3% fixed or CPI-based. Co-location revenue share: ground lessor typically receives 10–15% of additional tenant rents. Other key provisions: termination for cause, tower removal surety bond requirement, no-shop clause, 24/7 access rights, utility easement, and insurance requirements.

MISS DIG 811: Michigan's underground utility locate service. Required by law before any ground disturbance or excavation. Submit a locate request online or call 811 at least 3 business days before digging. All underground utilities must be marked in the field before construction begins.

MDEQ / EGLE Part 303: Michigan wetland permit is required before any fill, grading, or ground disturbance within or adjacent to a regulated wetland. Administered by the Michigan Department of Environment, Great Lakes, and Energy (EGLE). A wetland delineation by a certified wetland consultant is required to determine jurisdictional boundaries. Permit application submitted to EGLE with delineation report, project description, and mitigation plan if impacting regulated wetland.

E911 ADDRESS: New tower structures require a formal E911 address assignment from the local county or municipal addressing authority. The address is required for emergency response dispatch to the tower site.

SURETY BOND: A performance bond guaranteeing tower removal at lease expiration or termination. Bond amount typically $50,000–$150,000 depending on tower height and municipality. Required by most jurisdictions as a condition of CUP approval.

## HAWKBOT CAPABILITIES
Walk users through any SiteHawk page step by step. Look up electric utility name, phone, and contact for any location — provide lat/lon or zip code. Look up zoning jurisdiction and classification for any address or coordinates. Look up fiber broadband carriers and speeds at any location via FCC BDC data. Look up PSAP police/fire/EMS contacts for any location. Find addresses and phone numbers for carriers, utilities, municipalities, TowerCos, and agencies by searching the web. Explain lease clauses, zoning ordinances, FAA and FCC filing requirements, and NEPA/SHPO process in plain English. Guide users through the full site acquisition workflow from initial search through executed lease and permit. Search the web for current permit fees, processing times, ordinance text, agency contacts, and industry news.`;

const WELCOME = "I'm HawkBot — the brains of SiteHawk. I know every page, every feature, fiber carriers, power utilities, zoning rules, FAA requirements, lease terms, and the full wireless site acquisition workflow from search through executed lease. Ask me anything about the platform or the industry — I can look up addresses, phone numbers, and search the web for current resources. Where do you want to start?";

// Curated, instant answer for "How do I use SiteHawk?" — served locally so the
// first-question experience is always this polished walkthrough.
const HOW_TO_QUESTION = "How do I use SiteHawk?";
const HOW_TO_ANSWER = `SiteHawk is a full-stack wireless site acquisition platform. Here is what each major section does:

🔍 SITESEARCH (/search) — Start here. Enter an address or lat/lon plus a search radius. SiteHawk scores and ranks candidate parcels automatically. A/B/C are auto-targets. Click any parcel to see owner info, APN, acreage, and zoning.

✏️ SITE SKETCH (/site-sketch) — Animated hand-drawn site exhibit. Generates the tower compound, setback lines, equipment shelter, and access road using Rough.js pencil-texture animation across 11 phases. Required for the SCIP lease exhibit in Section 6.

📄 SCIP (/scip/new) — Build the full Site Candidate Information Package across 11 sections: project overview, site candidates and scoring, zoning and permitting, utilities and infrastructure, environmental review, site sketch and lease exhibit, compliance action checklist, fiber backhaul assessment, financial summary, site acquisition strategy, and appendices.

🗺 INFRASTRUCTURE INTELLIGENCE (/infrastructure-intelligence) — Dual interactive maps. Fiber Map: 19 named carrier KMZ slots plus OSM live fiber routes, PeeringDB carrier PoPs, splice points, and FCC BDC carrier parcel enrichment. Power Map: voltage-colored transmission lines, OSM towers and poles, HIFLD substations, HIFLD service territories, and utility contact enrichment on parcel click.

⚖️ HAWKLAW (/hawk-law) — AI lease analyzer. Upload a PDF or paste lease text directly. Claude triages every clause green/yellow/red, gives plain-English explanations, shows a redline diff if you upload a landlord's markup, and packages the analysis for your attorney.

🔎 ZONING VERIFIER (/zoning-verifier) — Live zoning lookup: classification, permitted uses, setbacks, and height limits for any parcel or address.

📋 CODEHAWK (/codehawk) — Municipal code analyzer. Paste or upload a zoning ordinance section. CodeHawk extracts tower height limits, setbacks, the CUP/SUP path, and Shot Clock applicability.

⚡ SITING IQ™ (/siting-iq) — Combines environmental, RF, terrain, tower, satellite, and FAA airspace screening on one interactive map.

📊 PIPELINE (/pipeline) — CRM kanban tracking deals from prospect through executed lease.

Ask me about any specific page or workflow and I will walk you through it step by step.`;

export default function HawkBotWidget() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  // Draggable — grab the launcher (or the chat header) and move HawkBot anywhere.
  const { onPointerDown, wasDragged, styleFor } = useDraggable();

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Clear the conversation back to the welcome state whenever HawkBot is closed.
  const closeWidget = () => {
    setOpen(false);
    setMessages([{ role: "assistant", text: WELCOME }]);
    setInput("");
    setLoading(false);
  };

  // Detect "build/generate a SCIP" intent and route the user to /scip with whatever
  // candidate context is already available (from ScanResults state, if present).
  const handleScipIntent = () => {
    const fromResults = location.state?.results?.[0] || location.state?.candidate;
    if (fromResults) {
      navigate("/scip", {
        state: {
          candidate: fromResults,
          ordinance: location.state?.ordinance,
          searchCenter: location.state?.searchCenter,
          allResults: location.state?.results,
        },
      });
    } else {
      navigate("/search");
    }
    closeWidget();
  };

  // Site-awareness — when HawkBot is opened on a SCIP page, pass the record id
  // so the backend can load that site's jurisdiction, zoning & permit data.
  const scipMatch = location.pathname.match(/^\/scip\/([^/]+)/);
  const scipId = scipMatch && scipMatch[1] !== "new" ? scipMatch[1] : null;

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    // "How do I use SiteHawk?" — serve the curated walkthrough instantly.
    if (msg === HOW_TO_QUESTION) {
      setMessages((prev) => [...prev, { role: "user", text: msg }, { role: "assistant", text: HOW_TO_ANSWER }]);
      setInput("");
      return;
    }

    // SCIP shortcut — if the user explicitly asks to build/generate one
    if (/\b(build|generate|create|make|run)\b.*\bscip\b/i.test(msg)) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: msg },
        { role: "assistant", text: "🦅 Routing you to the SCIP generator with your top candidate loaded. The new Page 1 format auto-fills via Notion zoning + Realie parcels + Enformion skip-trace + CloudRF propagation." },
      ]);
      setInput("");
      setTimeout(handleScipIntent, 800);
      return;
    }

    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await siteChat({
        message: msg,
        context: { source: "hawkbot_global", scip_format: SCIP_CONTEXT, scip_id: scipId },
      });
      const data = res.data;
      const reply = data?.response || data?.message || data?.error || "Sorry, I couldn't get a response. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Connection error. Please check your network and try again." }]);
    }
    setLoading(false);
  };

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          data-hawkbot-drag
          onPointerDown={onPointerDown}
          onClick={() => { if (!wasDragged()) setOpen(true); }}
          aria-label="Open HawkBot"
          style={styleFor(180, 52)}
          className="fixed bottom-5 left-5 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 hover:bg-primary/90 hover:scale-105 active:scale-95 transition-colors cursor-grab active:cursor-grabbing touch-none"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="font-heading font-bold text-sm hidden sm:inline">Ask HawkBot</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          data-hawkbot-drag
          style={styleFor(440, 680)}
          className="fixed bottom-5 left-5 z-50 w-[min(440px,calc(100vw-2.5rem))] h-[min(680px,calc(100vh-6rem))] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header — grab to move the whole chat window */}
          <div
            onPointerDown={onPointerDown}
            className="flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar cursor-grab active:cursor-grabbing touch-none select-none"
          >
            <div className="flex items-center gap-2">
              <HawkIcon size={32} />
              <div>
                <h3 className="font-heading font-bold text-foreground text-sm">HawkBot</h3>
                <p className="text-[10px] text-muted-foreground">Site Acquisition · Fiber · Power · Zoning · Law · SCIP</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={closeWidget} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all" aria-label="Close HawkBot">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && <HawkIcon size={24} className="mr-1.5 mt-0.5 shrink-0" />}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start items-center gap-2">
                <HawkIcon size={24} />
                <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {messages.length <= 1 && !loading && (
            <div className="px-4 pb-3">
              <p className="text-[10px] text-muted-foreground font-medium mb-2 uppercase tracking-wider">Quick Questions</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action}
                    onClick={() => sendMessage(action)}
                    className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-all font-medium"
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-border bg-card">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask about parcels, zoning, SCIP..."
                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-all"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">Powered by SkyWave AI · Real data only</p>
          </div>
        </div>
      )}
    </>
  );
}