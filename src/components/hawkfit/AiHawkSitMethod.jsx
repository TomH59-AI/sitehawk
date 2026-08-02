import { BrainCircuit, CheckCircle2, Ruler, ShieldCheck } from "lucide-react";

const checks = [
  { icon: BrainCircuit, title: "Sourced research", text: "Uses the active Target A parcel boundary, zoning, jurisdiction, and ordinance inputs. Missing source data is never guessed." },
  { icon: Ruler, title: "Buildable envelope", text: "Measures the tower point to the parcel edge, then tests front, side, and rear setbacks plus the full compound footprint." },
  { icon: ShieldCheck, title: "Fall zone and height", text: "Checks the tower-height fall-zone radius, or the entered PE-engineered multiplier, against available parcel clearance and the ordinance height cap." },
  { icon: CheckCircle2, title: "Clear verdict", text: "Allowable means every active check fits. Unallowable identifies the binding failure. Missing boundaries or rules produce Needs Review—not a pass." },
];

export default function AiHawkSitMethod() {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-sm font-semibold text-foreground">How AIHawkSit™ grades Target A</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        AI research helps organize sourced site and ordinance facts; deterministic geometry makes the final fit decision.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg bg-muted p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" />{title}</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}