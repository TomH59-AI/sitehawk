import { Link } from "react-router-dom";
import { Radio, Eye, ShieldCheck, MapPin, FileSignature, Scale } from "lucide-react";

const TOOLS = [
  { path: "/hawkfit-map", icon: Radio, label: "TalonFit® Map", desc: "AI spatial intelligence and deterministic tower-fit checks." },
  { path: "/hawk-vision", icon: Eye, label: "HawkVision", desc: "Show the proposed tower, compound, and landscaping." },
  { path: "/zoning-verifier", icon: ShieldCheck, label: "Zoning Verifier", desc: "Cross-check zoning findings and approval requirements." },
  { path: "/rfi-engine", icon: Radio, label: "RF Intelligence", desc: "Explore coverage, nearby assets, and RF opportunity." },
  { path: "/hawk-tracker", icon: MapPin, label: "Hawk Tracker", desc: "Carry the selected site from outreach through build-out." },
  { path: "/hawk-lease", icon: FileSignature, label: "HawkLease + Hawk Law", desc: "Evaluate lease economics and review agreement language." },
];

export default function FollowingToolsIndex() {
  return (
    <section className="pt-8 pb-4">
      <div className="mb-4 text-center">
        <p className="text-[10px] font-bold tracking-[0.28em] text-primary uppercase">Your next SiteHawk pages</p>
        <h2 className="font-heading text-xl font-bold text-foreground mt-1">Keep the site moving after the SCIP</h2>
        <p className="text-sm text-muted-foreground mt-1">A quick index of the useful tools and Hawk Intelligence waiting next.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOLS.map((tool) => (
          <Link key={tool.path} to={tool.path} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors">
            <div className="flex items-center gap-2 mb-1.5"><tool.icon className="w-4 h-4 text-primary" /><span className="font-heading font-bold text-sm text-foreground">{tool.label}</span></div>
            <p className="text-xs leading-relaxed text-muted-foreground">{tool.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}