import { Landmark } from "lucide-react";
import { GOV_FORM_CATEGORIES } from "@/components/govforms/govFormsData";
import HawkFormCard from "@/components/hawkforms/HawkFormCard";

/**
 * Government Forms — ONLY the wetland-proximity FAA filings and the NEPA /
 * SHPO / THPO compliance forms. Separate from Hawk Forms, which keeps the
 * broader FCC / FAA ASR + 7460 reference library. Links go straight to the
 * agency's own form or portal; nothing is generated or altered here.
 */
export default function GovernmentForms() {
  const totalForms = GOV_FORM_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="space-y-10">
      <div className="rounded-2xl bg-sidebar border border-border p-8 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <Landmark className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[3px] text-primary font-bold mb-1">Step 16 · Official filings</p>
            <h1 className="font-heading font-bold text-3xl text-sidebar-foreground">🏛️ Government Forms</h1>
            <p className="text-sm text-sidebar-foreground/60 mt-1">
              {totalForms} filings for wetland-proximity FAA review plus NEPA, SHPO and THPO compliance. The FCC/FAA ASR &amp; 7460 library lives in Hawk Forms.
            </p>
          </div>
        </div>
      </div>

      {GOV_FORM_CATEGORIES.map((cat) => (
        <section key={cat.key}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{cat.icon}</span>
            <h2 className="font-heading font-bold text-xl text-foreground">{cat.title}</h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-bold text-muted-foreground">{cat.items.length} items</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {cat.items.map((item) => (
              <HawkFormCard key={item.name} item={item} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground text-center pb-4">
        Links open the official agency form or portal in a new tab. Always verify you're using the latest form revision before filing.
      </p>
    </div>
  );
}