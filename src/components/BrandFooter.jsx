import HawkIcon from "./HawkIcon";

// Branded footer used across About, Pricing, Terms, Privacy & Refunds.
// Shows the SiteHawk logo and company line only (no product/pricing grid).
export default function BrandFooter() {
  return (
    <div className="mt-12 rounded-2xl border border-border bg-card/60 p-8">
      <div className="flex flex-col items-center text-center gap-3">
        <HawkIcon size={56} />
        <div>
          <p className="font-heading font-bold text-xl text-foreground">SiteHawk</p>
          <p className="text-xs text-muted-foreground italic">A SkyWave AI Product · Patent Pending</p>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground/50 tracking-widest uppercase mt-6">
        © SkyWave LLC — Michigan, USA · Powered by SkyWave AI
      </p>
    </div>
  );
}