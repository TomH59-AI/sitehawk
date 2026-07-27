/**
 * HubSpotSidebarConnect — sidebar widget at the bottom of the nav.
 * Shows HubSpot logo + "Connect HubSpot" if not connected,
 * or a green "HubSpot Connected" badge if the connector is already authorized.
 * Clicking "Connect" navigates to /crm which has the full HubSpot sync UI.
 */
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import HubSpotLogo from "@/components/icons/HubSpotLogo";
import useHubSpotStatus from "@/hooks/useHubSpotStatus";

export default function HubSpotSidebarConnect() {
  const { status } = useHubSpotStatus();
  const connected = status === "connected";
  const loading = status === "loading";

  return (
    <Link
      to="/hubspot"
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-secondary transition-all duration-200 group"
      title="Sync your deals to HubSpot CRM"
    >
      <HubSpotLogo size={18} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-muted-foreground group-hover:text-foreground leading-tight">
          HubSpot CRM
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-medium ${connected ? "text-emerald-400" : loading ? "text-muted-foreground" : "text-amber-500"}`}>
          {connected ? <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> : loading ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : <AlertCircle className="w-3 h-3" aria-hidden="true" />}
          {connected ? "Connected — sync deals" : loading ? "Checking connection" : "Connection needs attention"}
        </div>
      </div>
    </Link>
  );
}