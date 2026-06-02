import { Link } from "react-router-dom";
import { SUPPORT_EMAIL_DISPLAY, SUPPORT_EMAIL_MAILTO } from "@/lib/contactEmail";
import HawkIcon from "../components/HawkIcon";
import BrandFooter from "../components/BrandFooter";

export default function RefundPolicy() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-4">
      <div className="flex items-center gap-4">
        <HawkIcon size={48} />
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Refund Policy</h1>
          <p className="text-xs text-muted-foreground">SkyWave LLC — SiteHawk Platform · Last updated: April 14, 2026</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-8 space-y-8 text-sm text-muted-foreground leading-relaxed">

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Subscription Cancellation</h2>
          <p>
            You may cancel your SiteHawk subscription at any time through the Stripe billing portal accessible from your account settings.
            Cancellation takes effect at the end of your current billing period. You will retain access to paid features until your billing period ends.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Monthly Subscriptions (Hawk 20/20 Vision — $49/month)</h2>
          <p>
            If you cancel within the first 7 days of your initial subscription and have used fewer than 5 scans, you may request a full refund
            by emailing <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a>.
            After 7 days or 5 scans (whichever comes first), no refunds will be issued for the current billing period.
            You will not be charged for future months after cancellation.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Annual Subscriptions (Hawk 20-4 AI Vision — $490/year)</h2>
          <p>
            If you cancel within the first 14 days of your initial subscription and have used fewer than 10 scans, you may request a full refund
            by emailing <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a>.
            After 14 days or 10 scans (whichever comes first), no refunds will be issued. Partial-year refunds are not available.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Free Trial Scans</h2>
          <p>
            Free trial scans included with paid tiers are non-refundable and have no cash value.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">How to Request a Refund</h2>
          <p>
            Email <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a> with
            your account email, subscription type, and reason for the refund request. Refunds are processed within 5–10 business days
            back to the original payment method.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Data Accuracy Disclaimer</h2>
          <p>
            SiteHawk provides parcel data, zoning ordinance information, and AI-scored candidate recommendations as decision-support tools.
            While we strive for accuracy, data is sourced from third-party providers (Regrid, public records, municipal codes) and may contain
            errors or omissions. Refunds will not be issued based on data accuracy disputes. Users are responsible for independently verifying
            all information before making business decisions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Service Availability</h2>
          <p>
            SiteHawk is provided on an "as available" basis. Temporary service interruptions do not qualify for refunds. In the event of a
            prolonged outage exceeding 72 consecutive hours, affected subscribers may request a prorated credit for the downtime period.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Changes to This Policy</h2>
          <p>
            SkyWave LLC reserves the right to update this refund policy at any time. Changes take effect immediately upon posting.
            Continued use of SiteHawk after changes constitutes acceptance.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-heading font-semibold text-base text-foreground">Contact</h2>
          <div className="pt-1 space-y-1">
            <p><span className="font-medium text-foreground">SkyWave LLC</span></p>
            <p>Email: <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a></p>
          </div>
        </section>

      </div>

      <BrandFooter />

      <div className="text-center">
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back to Dashboard</Link>
      </div>
    </div>
  );
}