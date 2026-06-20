import { useState } from "react";
import { Link, useLocation, Outlet } from "react-router-dom";
import { Plus, List, BookOpen, Archive } from "lucide-react";

export const HAWK_LAW_HEADER = "⚖️ Hawk Law Analysis — Built on Anthropic Law (open-source from Anthropic). This output is informational only and is not legal advice. Consult a licensed attorney before executing any agreement.";
export const HAWK_LAW_FOOTER = "Hawk Law is powered by Anthropic Law, the open-source legal AI framework from Anthropic.";

const SUB_NAV = [
  { path: "/hawk-law", label: "New Analysis", icon: Plus, exact: true },
  { path: "/hawk-law/sessions", label: "Active Sessions", icon: List },
  { path: "/hawk-law/clauses", label: "Clause Library", icon: BookOpen },
  { path: "/hawk-law/history", label: "History", icon: Archive },
];

export default function HawkLaw() {
  const location = useLocation();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-3xl">⚖️</span>
        <div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Hawk Law</h1>
          <p className="text-sm text-muted-foreground">AI-powered lease analysis · Built on Anthropic Law</p>
        </div>
      </div>

      {/* Sub-nav */}
      <nav className="flex gap-1 border-b border-border overflow-x-auto">
        {SUB_NAV.map((item) => {
          const active = item.exact
            ? location.pathname === "/hawk-law"
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

      {/* Footer on all Hawk Law pages */}
      <div className="border-t border-border pt-4 text-xs text-muted-foreground text-center">
        {HAWK_LAW_FOOTER}
      </div>
    </div>
  );
}