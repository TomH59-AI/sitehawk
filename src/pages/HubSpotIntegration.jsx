/**
 * HubSpotIntegration — dedicated page for the HubSpot CRM connection.
 * Reached from the sidebar "HubSpot CRM" widget.
 */
import { Check, ExternalLink } from "lucide-react";
import HubSpotLogo from "@/components/icons/HubSpotLogo";
import HubSpotStatusCard from "@/components/hubspot/HubSpotStatusCard";

export default function HubSpotIntegration() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground flex items-center gap-3">
          <HubSpotLogo />
          HubSpot CRM Sync
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your SiteHawk discoveries flow straight into HubSpot as contacts and deals.
        </p>
      </div>

      <HubSpotStatusCard />

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="font-heading font-bold text-foreground">How it works</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
            <span>When you generate a SCIP, the target parcel is automatically pushed to HubSpot as a contact + deal — owner name, address, APN, acreage, zoning, and coordinates included.</span>
          </li>
          <li className="flex gap-2.5">
            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
            <span>Sync is idempotent — re-running the same site never creates duplicates.</span>
          </li>
          <li className="flex gap-2.5">
            <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
            <span>You can also push any target manually from Section 3 of Site Search using the CRM push buttons.</span>
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