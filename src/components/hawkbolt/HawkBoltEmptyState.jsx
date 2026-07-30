import { Zap } from "lucide-react";

const PROMPTS = [
  "Qualify 14507 Fagan Rd, Holly, MI 48442 — parcel, zoning, ordinance, fall-zone fit.",
  "What's the max buildable tower height at 42.8158, -83.6109 and what constrains it?",
  "Find the nearest power feed and fiber backhaul options for this address.",
  "Skip-trace the owner of this parcel and push the site to my CRM.",
];

// HawkBolt landing state — one tap to kick off a full qualification chain.
export default function HawkBoltEmptyState({ onPick }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <Zap className="w-6 h-6 text-primary" />
      </div>
      <h2 className="font-heading text-xl font-bold text-foreground">HawkBolt</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Give HawkBolt an address or coordinates and it runs the whole chain — parcel, zoning and
        ordinance, tower fit, power and fiber, flood, owner contact — using SiteHawk's own tools.
      </p>
      <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="rounded-xl border border-border bg-card p-3 text-left text-xs leading-relaxed text-foreground transition-colors hover:bg-secondary/60"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}