import DashboardToolPage from "@/components/dashboard/DashboardToolPage";
import { DASHBOARD_TOOL_PAGES } from "@/components/dashboard/dashboardToolPages";

export default function DashboardToolPages() {
  return (
    <div className="snap-y snap-proximity">
      {DASHBOARD_TOOL_PAGES.map((page) => <DashboardToolPage key={page.number} page={page} />)}
    </div>
  );
}