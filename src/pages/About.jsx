import { Link } from "react-router-dom";
import { Mail, Globe } from "lucide-react";
import { SUPPORT_EMAIL_DISPLAY, SUPPORT_EMAIL_MAILTO } from "@/lib/contactEmail";
import HawkIcon from "../components/HawkIcon";
import BrandFooter from "../components/BrandFooter";

export default function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div className="flex items-center gap-4">
        <HawkIcon size={56} />
        <div>
          <h1 className="font-heading font-bold text-3xl text-foreground">About SiteHawk</h1>
          <p className="text-sm text-muted-foreground italic">A SkyWave AI Product</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <p className="text-foreground leading-relaxed">
          SiteHawk is a precision tower site prospecting platform built by SkyWave AI. Using proprietary zoning intelligence
          drawn from thousands of municipal telecommunications ordinances and real-time parcel data, SiteHawk identifies the
          top buildable parcels for wireless tower deployment in seconds.
        </p>
        <p className="text-foreground leading-relaxed">
          SiteHawk is designed by site acquisition professionals, for site acquisition professionals.
        </p>
      </div>

      <div className="rounded-xl border border-primary/30 bg-card p-6 space-y-4">
        <h2 className="font-heading font-semibold text-lg text-foreground">TalonFit™ — The Tower Siter That Never Says No</h2>
        <p className="text-foreground leading-relaxed">
          At the heart of SiteHawk is TalonFit™, our patent-pending AI tower siting engine. TalonFit™ reads the local
          telecommunications ordinance — setbacks, height caps, fall-zone rules, residential buffers, tower separation —
          and runs that math across every point of a parcel to find the perfect tower location before you spend a dime
          pursuing the wrong site.
        </p>
        <p className="text-foreground leading-relaxed">
          And here's what makes TalonFit™ different: it grades sites, it doesn't reject them. Even when a location fails
          the full requirements, TalonFit™ still selects it and shows you the maximum tower height that might be allowed
          at that exact spot — so a "no" at 199 feet can still be a "yes" at 120. Where an ordinance permits an
          engineered fall-zone reduction, TalonFit™ recognizes that pathway too, often rescuing a tight parcel to full
          height with a PE-certified letter.
        </p>
        <p className="text-foreground leading-relaxed">
          The result: every parcel gets ranked, every point gets a height, and the strongest buildable location — often
          not the center of the parcel — rises to the top automatically.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="font-heading font-semibold text-lg text-foreground">Contact SkyWave LLC</h2>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <span>Support: <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <span>Inquiries: <a href="mailto:info@sitehawk.com" className="text-primary hover:underline">info@sitehawk.com</a></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <span>Founder: <a href="mailto:tom@sitehawk.com" className="text-primary hover:underline">tom@sitehawk.com</a></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Globe className="w-4 h-4 text-primary shrink-0" />
          <a href="https://www.sitehawk.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">sitehawk.com</a>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">SkyWave LLC — Michigan, USA</p>
      </div>

      <BrandFooter />

      <div className="text-center">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back to Dashboard</Link>
      </div>
    </div>
  );
}