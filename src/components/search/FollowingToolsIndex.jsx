import { Link } from "react-router-dom";
import { Radio, ShieldCheck, MapPin, FileSignature, ArrowRight } from "lucide-react";

// Ordered continuation of the flow — each card navigates to its tool page.
const TOOLS = [
  { path: "/zoning-verifier", icon: ShieldCheck, label: "Zoning Verifier", desc: "Cross-check zoning findings and approval requirements." },
  { path: "/siting-iq", icon: Radio, label: "Siting IQ™", desc: "Unified environmental, RF, terrain, and airspace siting intelligence." },
  { path: "/hawk-tracker", icon: MapPin, label: "Hawk Tracker", desc: "Carry the selected site from outreach through build-out." },
  { path: "/hawk-law", icon: FileSignature, label: "HawkLease + Hawk Law", desc: "Evaluate lease economics and review agreement language." },
];

export default function FollowingToolsIndex() {
  return (
    <section className="pt-8 pb-4">
      <div className="mb-4 text-center">
        <p className="text-[10px] font-bold tracking-[0.28em] text-primary uppercase">Your next SiteHawk pages</p>
        <h2 className="font-heading text-xl font-bold text-foreground mt-1">Keep the site moving after the SCIP</h2>
        <p className="text-sm text-muted-foreground mt-1">A quick index of the useful tools and Hawk Intelligence waiting next — click any card to open it.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOLS.map((tool) => (
          <Link
            key={tool.label}
            to={tool.path}
            className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <tool.icon className="w-4 h-4 text-primary" />
              <span className="font-heading font-bold text-sm text-foreground">{tool.label}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{tool.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}