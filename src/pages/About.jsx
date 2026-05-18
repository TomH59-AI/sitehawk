import { Link } from "react-router-dom";
import { Mail, Globe, Radio } from "lucide-react";
import { SUPPORT_EMAIL_DISPLAY, SUPPORT_EMAIL_MAILTO } from "@/lib/contactEmail";

export default function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-8 py-4">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
          <Radio className="w-7 h-7 text-primary-foreground" />
        </div>
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

      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h2 className="font-heading font-semibold text-lg text-foreground">Contact SkyWave LLC</h2>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <span>Support: <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <span>Inquiries: <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">info@sitehawk.com</a></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Mail className="w-4 h-4 text-primary shrink-0" />
          <span>Founder: <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">tom@sitehawk.com</a></span>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Globe className="w-4 h-4 text-primary shrink-0" />
          <a href="https://site-hawk-pro.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">site-hawk-pro.com</a>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">SkyWave LLC — Michigan, USA</p>
      </div>

      <div className="text-center">
        <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back to Dashboard</Link>
      </div>
    </div>
  );
}