import { Link } from "react-router-dom";
import {
  ClipboardList, Map, FileText, Target, RadioTower, Layers, Cable, Radio,
  Ruler, Box, ShieldCheck, Printer, MapPin, ListChecks,
  Scale, ClipboardEdit, FileStack, ScanLine, PhoneCall,
} from "lucide-react";

const JOURNEY = [
  { n: 1, title: "Enter Site Details", desc: "Add the SARF center, radius, tower height, compound size, and project name.", icon: ClipboardList, to: "/search" },
  { n: 2, title: "Generate the SARF Map", desc: "Create the search ring and confirm the exact center of your hunt.", icon: Map, to: "/search" },
  { n: 3, title: "Run Zoning", desc: "Find the jurisdiction, zoning district, telecom rules, and permit path.", icon: FileText, to: "/search" },
  { n: 4, title: "Choose Targets A, B & C", desc: "Find, score, compare, and select the strongest candidate parcels.", icon: Target, to: "/search" },
  { n: 5, title: "Check Colocation", desc: "Scan FCC and OpenCellID for towers, rooftops, and nearby cell sites.", icon: RadioTower, to: "/search" },
  { n: 6, title: "Build the Map Suite", desc: "Create aerial, topo, FEMA, zoning, wetlands, FLUM, and evidence maps.", icon: Layers, to: "/search" },
  { n: 7, title: "Review Power & Fiber", desc: "Locate utility providers, transmission assets, and fiber connectivity.", icon: Cable, to: "/search" },
  { n: 8, title: "Run RF Propagation", desc: "Model coverage and visualize the proposed tower's service footprint.", icon: Radio, to: "/search" },
  { n: 9, title: "Place the Tower", desc: "Test setbacks, fall zones, compound fit, access, and tower separation.", icon: Ruler, to: "/search" },
  { n: 10, title: "Preview in 3D", desc: "Use HawkFit and 3D imagery to show the proposed site clearly.", icon: Box, to: "/search" },
  { n: 11, title: "Review Compliance", desc: "Pre-screen Section 106, NEPA, environmental triggers, and shot clocks.", icon: ShieldCheck, to: "/search" },
  { n: 12, title: "Generate the SCIP", desc: "Assemble, print, and share the complete SiteHawk site package.", icon: Printer, to: "/search" },
];

const TIME_SAVERS = [
  { n: 13, title: "Hawk Tracker", desc: "Track deployment activity and stay ready for every client meeting.", icon: MapPin, to: "/hawk-tracker" },
  { n: 14, title: "Follow-Up Tracker", desc: "Keep urgent sites and next actions from slipping behind.", icon: ListChecks, to: "/follow-up-tracker" },
  { n: 15, title: "Hawk Law", desc: "Speed up negotiations with clause intelligence and saved history.", icon: Scale, to: "/hawk-law" },
  { n: 16, title: "HawkFill", desc: "Upload your own document and intelligently fill the form.", icon: ClipboardEdit, to: "/hawk-fill" },
  { n: 17, title: "Hawk Forms", desc: "Open the client forms you need and complete them with assistance.", icon: FileStack, to: "/hawk-forms" },
  { n: 18, title: "Document Intelligence", desc: "Upload zoning and permit applications and get help completing them.", icon: ScanLine, to: "/hawk-docs" },
  { n: 19, title: "Local Phone Directory", desc: "Look up a ZIP for the police, fire, dispatch, utility, and jurisdiction numbers that go on the SCIP.", icon: PhoneCall, to: "/fiber-operators" },
];

function IndexGrid({ items, accent, compact = false, gridClassName = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3", cardClassName = "rounded-xl border border-border bg-card p-4", titleClassName = "font-heading font-bold text-sm text-foreground", descClassName = "text-xs text-muted-foreground mt-1 leading-relaxed", badgeClass = "bg-foreground text-background", badgeBorder = "border-card" }) {
  return (
    <div className={gridClassName}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.n} to={item.to} className={`${cardClassName} block transition-all hover:border-primary/50 hover:shadow-sm`}>
            <div className={`flex items-start ${compact ? "gap-2.5" : "gap-3"}`}>
              <div className={`relative shrink-0 rounded-xl flex items-center justify-center ${compact ? "w-8 h-8" : "w-11 h-11"} ${accent}`}>
                <Icon className={compact ? "w-4 h-4" : "w-5 h-5"} />
                <span className={`absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full ${badgeClass} text-[9px] font-bold flex items-center justify-center border-2 ${badgeBorder}`}>{item.n}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className={titleClassName}>{item.title}</div>
                <p className={descClassName}>{item.desc}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function WorkflowIndex() {
  return (
    <div className="space-y-7">
      <section>
        <div className="mb-4">
          <div className="text-[10px] font-mono tracking-[0.3em] text-primary uppercase">The SiteHawk Pipeline · In Order</div>
          <h2 className="font-heading font-bold text-2xl text-foreground">SiteHawk Index</h2>
          <p className="text-sm text-muted-foreground mt-1">These are the steps starting with 1 — follow the journey through your finished SCIP.</p>
        </div>
        <IndexGrid
          items={JOURNEY}
          compact
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5"
          accent="bg-[#0d9488]/15 text-[#0d9488] border border-[#0d9488]/25"
          cardClassName="rounded-xl border border-[#0d9488]/20 bg-white p-3"
          titleClassName="font-heading font-bold text-[13px] text-[#0d9488]"
          descClassName="text-[11px] text-[#0d9488]/70 mt-0.5 leading-snug"
          badgeClass="bg-[#0d9488] text-white"
          badgeBorder="border-white"
        />
      </section>

      <section className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 md:p-6">
        <div className="mb-4">
          <div className="text-[10px] font-mono tracking-[0.3em] text-primary uppercase">After the SCIP · Stay Organized</div>
          <h2 className="font-heading font-bold text-2xl text-foreground">Legal, Organization, and Forms</h2>
          <p className="text-sm text-muted-foreground mt-1">The tools that save hours, reduce stress, and keep every site moving.</p>
        </div>
        <IndexGrid items={TIME_SAVERS} accent="bg-secondary text-secondary-foreground border border-border" />
      </section>
    </div>
  );
}