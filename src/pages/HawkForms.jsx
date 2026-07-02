import { FileStack } from "lucide-react";
import { FORM_CATEGORIES } from "@/components/hawkforms/hawkFormsData";
import HawkFormCard from "@/components/hawkforms/HawkFormCard";

export default function HawkForms() {
  const totalForms = FORM_CATEGORIES.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="rounded-2xl bg-sidebar border border-border p-8 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#FFC72C]/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#FFC72C]/15 border border-[#FFC72C]/30 flex items-center justify-center">
            <FileStack className="w-7 h-7 text-[#FFC72C]" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[3px] text-[#FFC72C] font-bold mb-1">SiteHawk Reference Library</p>
            <h1 className="font-heading font-bold text-3xl text-sidebar-foreground">📑 Hawk Forms</h1>
            <p className="text-sm text-sidebar-foreground/60 mt-1">
              {totalForms} compliance forms, filing portals &amp; environmental reports every site acquisition project needs — all in one place.
            </p>
          </div>
        </div>
      </div>

      {/* Categories */}
      {FORM_CATEGORIES.map((cat) => (
        <section key={cat.key}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">{cat.icon}</span>
            <h2 className="font-heading font-bold text-xl text-foreground">{cat.title}</h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-bold text-muted-foreground">{cat.items.length} items</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {cat.items.map((item) => (
              <HawkFormCard key={item.name} item={item} accent={cat.accent} />
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