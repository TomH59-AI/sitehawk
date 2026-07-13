/**
 * HubSpotIntegration — dedicated page for the HubSpot CRM connection.
 * Reached from the sidebar "HubSpot CRM" widget.
 */
import { CheckCircle2, ExternalLink } from "lucide-react";

const HUBSPOT_ORANGE = "#FF7A59";

export default function HubSpotIntegration() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground flex items-center gap-3">
          <svg width="30" height="30" viewBox="0 0 512 512" fill={HUBSPOT_ORANGE} xmlns="http://www.w3.org/2000/svg">
            <path d="M267.4 211.6c-7.4-7.3-16.9-11-27.1-11-10.1 0-19.5 3.7-26.8 11L95.2 328.6c-7.4 7.3-11 16.7-11 26.9 0 10.1 3.6 19.5 11 26.8l18.3 18.3c7.3 7.3 16.8 11 26.9 11 10.1 0 19.5-3.7 26.9-11l59.3-59.3 59.4 59.3c7.3 7.3 16.8 11 26.9 11 10.1 0 19.5-3.7 26.9-11l18.3-18.3c7.3-7.3 11-16.7 11-26.8 0-10.2-3.7-19.6-11-26.9L267.4 211.6zM352.9 128.3V88.6c10.5-4.1 18-14.3 18-26.3V62c0-15.7-12.8-28.5-28.5-28.5h-57c-15.7 0-28.5 12.8-28.5 28.5v.3c0 12 7.5 22.2 18 26.3v39.7c-25.8 3.9-49.2 15.5-68 32.7L83.3 66.4c1-3.5 1.5-7.2 1.5-10.9C84.8 24.9 59.9 0 29.3 0 13.1 0 0 13.1 0 29.3c0 16.2 13.1 29.3 29.3 29.3 5.5 0 10.7-1.5 15.2-4.2l120.7 96.5c-14.6 23-23.1 50.3-23.1 79.6 0 83.1 67.4 150.5 150.5 150.5 83.1 0 150.5-67.4 150.5-150.5-.1-46.9-21.5-88.8-54.9-116.3l-35.3 93.6zM292.5 350.1c-44.4 0-80.5-36-80.5-80.5 0-44.4 36-80.5 80.5-80.5 44.4 0 80.5 36 80.5 80.5 0 44.4-36.1 80.5-80.5 80.5z"/>
          </svg>
          HubSpot CRM Sync
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your SiteHawk discoveries flow straight into HubSpot as contacts and deals.
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-heading font-bold text-sm text-foreground">Connected & Active</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
            HubSpot is authorized for this workspace. No further setup is needed.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-heading font-bold text-foreground">How it works</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <span className="text-emerald-500">✓</span>
            When you generate a SCIP, the target parcel is automatically pushed to HubSpot as a contact + deal — owner name, address, APN, acreage, zoning, and coordinates included.
          </li>
          <li className="flex gap-2.5">
            <span className="text-emerald-500">✓</span>
            Sync is idempotent — re-running the same site never creates duplicates.
          </li>
          <li className="flex gap-2.5">
            <span className="text-emerald-500">✓</span>
            You can also push any target manually from Section 3 of Site Search using the CRM push buttons.
          </li>
        </ul>
        <a
          href="https://app.hubspot.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          Open your HubSpot workspace <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}