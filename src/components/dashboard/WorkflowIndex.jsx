import { Link } from "react-router-dom";
import {
  ClipboardList, Search, FileText, Target, Layers, Cable,
  Zap, Radio, ShieldCheck, Users, Send, ArrowRight,
} from "lucide-react";

// The 11-step SiteHawk workflow — an index of what the app does end-to-end.
// Each step links to where the user performs it.
const STEPS = [
  { n: 1, title: "Enter Data", desc: "Drop your SARF center, radius, tower height & site details.", icon: ClipboardList, to: "/search", color: "#2563eb" },
  { n: 2, title: "Run a Site Scan", desc: "Generate the search-ring map around your target area.", icon: Search, to: "/search", color: "#0ea5e9" },
  { n: 3, title: "Run a Zoning Report", desc: "Pull jurisdiction, zoning & telecom permitting rules.", icon: FileText, to: "/search", color: "#10b981" },
  { n: 4, title: "Pick Three Targets", desc: "Score & select the best Target A / B / C parcels.", icon: Target, to: "/search", color: "#8b5cf6" },
  { n: 5, title: "Run the Mapping Suite", desc: "Aerial, topo, FEMA, zoning, FLUM, wetlands & more.", icon: Layers, to: "/search", color: "#3f5a54" },
  { n: 6, title: "Run Fiber Optics Map", desc: "Map nearest lit & near-net fiber infrastructure.", icon: Cable, to: "/search", color: "#059669" },
  { n: 7, title: "Run Power Map", desc: "Local grid, substations & transmission tie-in points.", icon: Zap, to: "/search", color: "#eab308" },
  { n: 8, title: "Run Propagation Map", desc: "Per-carrier RF coverage propagation simulation.", icon: Radio, to: "/search", color: "#f97316" },
  { n: 9, title: "Run a Compliance Report", desc: "Section 106 / NEPA pre-screen with FCC shot clocks.", icon: ShieldCheck, to: "/search", color: "#dc2626" },
  { n: 10, title: "CRM", desc: "Track owners, deals, stages & follow-ups.", icon: Users, to: "/crm", color: "#0891b2" },
  { n: 11, title: "Send Mailers", desc: "Mail your Target A/B/C owners on-brand postcards.", icon: Send, to: "/mail-orders", color: "#7c3aed" },
];

export default function WorkflowIndex() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary/10 via-transparent to-transparent">
        <div className="text-[10px] font-mono tracking-[0.3em] text-primary mb-0.5">HOW SITEHAWK WORKS</div>
        <h2 className="font-heading font-bold text-lg text-foreground">The Full Workflow — 11 Steps</h2>
        <p className="text-sm text-muted-foreground mt-0.5">From raw coordinates to a mailed lease offer. Follow the flow top to bottom.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.n}
              to={s.to}
              className="group flex items-start gap-3 p-4 bg-card hover:bg-muted/30 transition-colors"
            >
              <div
                className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white relative"
                style={{ background: s.color }}
              >
                <Icon className="w-5 h-5" />
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center border-2 border-card">
                  {s.n}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1 font-heading font-semibold text-sm text-foreground">
                  {s.title}
                  <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}