import { Mail, Stamp, Truck } from "lucide-react";

export default function MailOrdersHero() {
  return (
    <header className="overflow-hidden rounded-2xl border-2 border-primary/30 bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-dashed border-primary/30 bg-primary/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-background text-primary"><Mail className="h-6 w-6" /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.28em] text-primary">SiteHawk Postal Desk</p><h1 className="font-heading text-2xl font-bold text-foreground">Mail Orders</h1></div>
        </div>
        <Stamp className="h-10 w-10 rotate-6 text-primary/60" />
      </div>
      <div className="flex items-center gap-2 px-5 py-3 text-sm text-muted-foreground"><Truck className="h-4 w-4 text-primary" />Select a completed SCIP, verify owner addresses with Lob, then pay to print and mail the postcards.</div>
    </header>
  );
}