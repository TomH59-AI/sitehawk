import {
  Search, Zap, ShieldCheck, Radar, Network, Briefcase, MapPin, Landmark,
  ClipboardList, PhoneCall, FileSignature, Scale, ClipboardEdit,
  FileStack, ScanLine, CreditCard, Settings, Info,
} from "lucide-react";

export const DASHBOARD_TOOL_PAGES = [
  {
    number: 1,
    eyebrow: "Start here",
    title: "Get Started",
    description: "Begin the locked SiteHawk pipeline with your SARF and search ring.",
    tools: [{ title: "Site Search", description: "Start the complete search-ring-to-SCIP workflow.", to: "/search", icon: Search }],
  },
  {
    number: 2,
    eyebrow: "Research and qualify",
    title: "Site Intelligence",
    description: "Open the intelligence tools that support your existing pipeline.",
    tools: [
      { title: "TalonFit®", description: "Screen ordinance constraints and scout candidate targets.", to: "/talonfit", icon: Zap },
      { title: "Zoning Verifier", description: "Review zoning findings and source confidence.", to: "/zoning-verifier", icon: ShieldCheck },
      { title: "CodeHawk", description: "Look up any jurisdiction's tower ordinance, cited to its code section.", to: "/codehawk", icon: Landmark },
      { title: "RF Intelligence Engine", description: "Model and review RF coverage intelligence.", to: "/rfi-engine", icon: Radar },
      { title: "Local Services Directory", description: "Find governing, utility, and backhaul contacts.", to: "/fiber-operators", icon: Network },
    ],
  },
  {
    number: 3,
    eyebrow: "Keep every site moving",
    title: "CRM and Site Management",
    description: "Reach every tracking, follow-up, and owner-contact workspace directly.",
    tools: [
      { title: "CRM", description: "Manage candidate sites, outreach, and deal activity.", to: "/crm", icon: Briefcase },
      { title: "Hawk Tracker", description: "Track deployment activity across your sites.", to: "/hawk-tracker", icon: MapPin },
      { title: "Follow-Up Tracker", description: "Keep next actions and urgent follow-ups visible.", to: "/follow-up-tracker", icon: ClipboardList },
      { title: "Skip-Trace", description: "Find available owner contact information.", to: "/skip-trace", icon: PhoneCall },
    ],
  },
  {
    number: 4,
    eyebrow: "Negotiate and close",
    title: "Lease and Legal",
    description: "Move from candidate outreach into agreement review and negotiation.",
    tools: [
      { title: "HawkLease", description: "Organize lease activity and sites nearing signature.", to: "/hawk-lease", icon: FileSignature },
      { title: "Hawk Law", description: "Review clauses, redlines, and negotiation history.", to: "/hawk-law", icon: Scale },
    ],
  },
  {
    number: 5,
    eyebrow: "Complete the paperwork",
    title: "Forms and Documents",
    description: "Open every document workspace without digging through the menu.",
    tools: [
      { title: "HawkFill", description: "Upload and intelligently complete your own template.", to: "/hawk-fill", icon: ClipboardEdit },
      { title: "Hawk Forms", description: "Open supported carrier and regulatory forms.", to: "/hawk-forms", icon: FileStack },
      { title: "Document Intelligence", description: "Analyze supported zoning and permit documents.", to: "/hawk-docs", icon: ScanLine },
    ],
  },
  {
    number: 6,
    eyebrow: "Visualize and manage access",
    title: "Visuals and Account",
    description: "Create site visuals and manage your SiteHawk subscription.",
    tools: [
      { title: "Pricing and Plans", description: "Compare available SiteHawk plans.", to: "/pricing", icon: CreditCard },
      { title: "Billing", description: "Manage billing and subscription access.", to: "/billing", icon: Settings },
      { title: "About SiteHawk", description: "Review the platform and its core capabilities.", to: "/about", icon: Info },
    ],
  },
];