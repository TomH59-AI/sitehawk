import { useState, useEffect } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { Home, List, FileText, BarChart2, Download, ChevronRight } from "lucide-react";

const HAWK_LAW_FOOTER = "Hawk Law is powered by Anthropic Law, the open-source legal AI framework from Anthropic.";

const SUB_NAV = [
  { path: "/hawk-lease", label: "Dashboard", icon: Home, exact: true },
  { path: "/hawk-lease/sites", label: "Lease Sites", icon: List },
  { path: "/hawk-lease/comps", label: "Rent Comps", icon: BarChart2 },
  { path: "/hawk-lease/reports", label: "Reports", icon: Download },
];

export default function HawkLease() {
  const location = useLocation();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">🦅</span>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">HawkLease</h1>
          <p className="text-sm text-muted-foreground">Tower lease lifecycle management</p>
        </div>
      </div>

      {/* Sub-nav */}
      <nav className="flex gap-1 border-b border-border pb-0 overflow-x-auto">
        {SUB_NAV.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path) && location.pathname !== "/hawk-lease";
          const active = item.exact
            ? location.pathname === "/hawk-lease"
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}