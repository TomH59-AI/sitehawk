/**
 * HubSpotSidebarConnect — sidebar widget at the bottom of the nav.
 * Shows HubSpot logo + "Connect HubSpot" if not connected,
 * or a green "HubSpot Connected" badge if the connector is already authorized.
 * Clicking "Connect" navigates to /crm which has the full HubSpot sync UI.
 */
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

// The HubSpot connector is authorized at the workspace level (admin connected it).
// We treat it as always available — the sidebar just surfaces it visually.
const HUBSPOT_ORANGE = "#FF7A59";

export default function HubSpotSidebarConnect() {
  return (
    <Link
      to="/hubspot"
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-secondary transition-all duration-200 group"
      title="Sync your deals to HubSpot CRM"
    >
      {/* HubSpot sprocket logo SVG */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 512 512"
        fill={HUBSPOT_ORANGE}
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path d="M267.4 211.6c-7.4-7.3-16.9-11-27.1-11-10.1 0-19.5 3.7-26.8 11L95.2 328.6c-7.4 7.3-11 16.7-11 26.9 0 10.1 3.6 19.5 11 26.8l18.3 18.3c7.3 7.3 16.8 11 26.9 11 10.1 0 19.5-3.7 26.9-11l59.3-59.3 59.4 59.3c7.3 7.3 16.8 11 26.9 11 10.1 0 19.5-3.7 26.9-11l18.3-18.3c7.3-7.3 11-16.7 11-26.8 0-10.2-3.7-19.6-11-26.9L267.4 211.6zM352.9 128.3V88.6c10.5-4.1 18-14.3 18-26.3V62c0-15.7-12.8-28.5-28.5-28.5h-57c-15.7 0-28.5 12.8-28.5 28.5v.3c0 12 7.5 22.2 18 26.3v39.7c-25.8 3.9-49.2 15.5-68 32.7L83.3 66.4c1-3.5 1.5-7.2 1.5-10.9C84.8 24.9 59.9 0 29.3 0 13.1 0 0 13.1 0 29.3c0 16.2 13.1 29.3 29.3 29.3 5.5 0 10.7-1.5 15.2-4.2l120.7 96.5c-14.6 23-23.1 50.3-23.1 79.6 0 83.1 67.4 150.5 150.5 150.5 83.1 0 150.5-67.4 150.5-150.5-.1-46.9-21.5-88.8-54.9-116.3l-35.3 93.6zM292.5 350.1c-44.4 0-80.5-36-80.5-80.5 0-44.4 36-80.5 80.5-80.5 44.4 0 80.5 36 80.5 80.5 0 44.4-36.1 80.5-80.5 80.5z"/>
      </svg>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-muted-foreground group-hover:text-foreground leading-tight">
          HubSpot CRM
        </div>
        <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
          <CheckCircle2 className="w-3 h-3" />
          Connected — sync deals
        </div>
      </div>
    </Link>
  );
}