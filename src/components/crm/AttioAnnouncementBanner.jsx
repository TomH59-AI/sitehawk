/**
 * AttioAnnouncementBanner — dismissible dashboard banner announcing that
 * Attio CRM sync is live and included in every subscription.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { X, Link2 } from "lucide-react";

const DISMISS_KEY = "attio-banner-dismissed";

export default function AttioAnnouncementBanner() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  if (dismissed) return null;

  return (
    <div className="relative rounded-2xl border border-violet-500/40 bg-gradient-to-r from-violet-500/10 via-card to-primary/5 p-4 md:p-5 flex items-start gap-4">
      <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
        <Link2 className="w-4.5 h-4.5" />
      </div>
      <div className="pr-8">
        <p className="font-heading font-bold text-sm text-foreground">
          🔗 Attio CRM Sync is live — and included in your subscription
        </p>
        <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
          Your SiteHawk discoveries now flow straight into Attio with full data attached — scores,
          zoning, fiber, everything. Never lose a lead again.{" "}
          <Link to="/billing" className="text-violet-600 font-semibold hover:underline">
            Connect in 30 seconds →
          </Link>
        </p>
      </div>
      <button
        onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }}
        className="absolute top-3 right-3 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}