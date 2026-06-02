import HawkIcon from "./HawkIcon";

// Branded footer used across About, Pricing, Terms, Privacy & Refunds.
// Shows the SiteHawk logo, company line, and the full product line-up.
const PRODUCTS = [
  { name: "Hawk Site", price: "$69/mo" },
  { name: "Hawk Sight", price: "$199/mo" },
  { name: "Hawkeyes", price: "$199/mo" },
  { name: "Hawkeye 20/20", price: "$599/mo" },
  { name: "Hawkeye Apex", price: "$2,499/mo" },
  { name: "Hawk AI Vision", price: "$49/mo" },
  { name: "Hawk Compliance", price: "$99/mo" },
  { name: "Direct Mail — 3 Letters", price: "$79" },
  { name: "Direct Mail — 5 Letters", price: "$119" },
  { name: "Enterprise Team SCIP", price: "$5,489/yr" },
];

export default function BrandFooter() {
  return (
    <div className="mt-12 rounded-2xl border border-border bg-card/60 p-8">
      <div className="flex flex-col items-center text-center gap-3 mb-8">
        <HawkIcon size={56} />
        <div>
          <p className="font-heading font-bold text-xl text-foreground">SiteHawk</p>
          <p className="text-xs text-muted-foreground italic">A SkyWave AI Product · Patent Pending</p>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70 text-center mb-4 font-bold">
        The SiteHawk Product Suite
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 max-w-4xl mx-auto">
        {PRODUCTS.map((p) => (
          <div key={p.name} className="rounded-lg border border-border bg-background/50 px-3 py-2.5 text-center">
            <p className="text-xs font-semibold text-foreground leading-tight">{p.name}</p>
            <p className="text-[11px] text-primary font-bold mt-0.5">{p.price}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-muted-foreground/50 tracking-widest uppercase mt-6">
        © SkyWave LLC — Michigan, USA · Powered by SkyWave AI
      </p>
    </div>
  );
}