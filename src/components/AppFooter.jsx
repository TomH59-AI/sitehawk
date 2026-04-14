import { Link } from "react-router-dom";

export default function AppFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card/50 px-6 py-6 text-center">
      <p className="font-heading font-bold text-sm text-foreground tracking-tight">
        SiteHawk — When you need the AI vision
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        A SkyWave AI Product &nbsp;|&nbsp; SkyWave LLC — Michigan, USA
      </p>
      <div className="flex items-center justify-center gap-4 mt-3">
        <Link to="/terms" className="text-xs text-primary hover:underline">Terms of Service</Link>
        <span className="text-muted-foreground/40">·</span>
        <Link to="/privacy" className="text-xs text-primary hover:underline">Privacy Policy</Link>
        <span className="text-muted-foreground/40">·</span>
        <Link to="/refund-policy" className="text-xs text-primary hover:underline">Refund Policy</Link>
        <span className="text-muted-foreground/40">·</span>
        <Link to="/about" className="text-xs text-primary hover:underline">About</Link>
      </div>
      <p className="text-[10px] text-muted-foreground/50 mt-4 max-w-3xl mx-auto leading-relaxed">
        Patent Pending. SiteHawk, SkyWave AI, 20/20 Hawk AI Vision, 20/4 Hawk AI Vision, and Blind Vision are proprietary trademarks of SkyWave LLC. All rights reserved.
        This application, its methodology, scoring algorithms, and underlying data architecture are proprietary and confidential. Unauthorized reproduction, reverse engineering,
        or duplication of this platform or its processes is strictly prohibited. SiteHawk is powered by proprietary zoning intelligence and parcel analysis technology developed exclusively by SkyWave AI.
      </p>
      <p className="text-[10px] text-muted-foreground/40 mt-2">
        © 2026 SkyWave LLC. All rights reserved.
      </p>
    </footer>
  );
}