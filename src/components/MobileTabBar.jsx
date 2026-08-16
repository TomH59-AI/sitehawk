import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Search, ScanLine } from "lucide-react";

const TABS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/search", icon: Search, label: "Search" },
  { path: "/hawk-docs", icon: ScanLine, label: "Documents" },
];

export default function MobileTabBar() {
  const location = useLocation();
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4">
        {TABS.map((tab) => {
          const isActive = location.pathname === tab.path || location.pathname.startsWith(tab.path + "/");
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}