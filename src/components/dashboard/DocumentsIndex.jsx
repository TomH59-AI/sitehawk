import { Link } from "react-router-dom";
import { FileText, ExternalLink, ArrowRight } from "lucide-react";
import { FORM_CATEGORIES } from "@/components/hawkforms/hawkFormsData";

export default function DocumentsIndex() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <div className="mb-4">
        <div className="text-[10px] font-mono tracking-[0.3em] text-primary uppercase">Hawk Forms Reference Library</div>
        <h2 className="font-heading font-bold text-2xl text-foreground">Don't Miss These Documents</h2>
        <p className="text-sm text-muted-foreground mt-1">Official forms, reports, and filing portals used throughout site acquisition.</p>
      </div>

      <div className="space-y-5">
        {FORM_CATEGORIES.map((category) => (
          <div key={category.key}>
            <div className="flex items-center gap-2 mb-2">
              <span>{category.icon}</span>
              <h3 className="font-heading font-bold text-sm text-foreground">{category.title}</h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {category.items.map((item) => {
                const Comp = item.url ? "a" : Link;
                return (
                  <Comp key={item.name} href={item.url || undefined} to={item.url ? undefined : "/hawk-forms"} target={item.url ? "_blank" : undefined} rel={item.url ? "noopener noreferrer" : undefined} className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 hover:border-primary/40 hover:bg-primary/5 transition-all">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center"><FileText className="w-5 h-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 font-heading font-bold text-sm text-foreground">
                        {item.name}{item.url ? <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground group-hover:text-primary" /> : <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">{item.subtitle}</p>
                      <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide text-primary">{item.tag}</span>
                    </div>
                  </Comp>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}