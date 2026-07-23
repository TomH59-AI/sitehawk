import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import MobileTabBar from "./MobileTabBar";
import HubSpotSidebarConnect from "./sidebar/HubSpotSidebarConnect";
import AppFooter from "./AppFooter";
import AppErrorBoundary from "./AppErrorBoundary";
import HawkBotWidget from "./hawkbot/HawkBotWidget";
import SARFCoachTour from "./guide/SARFCoachTour";
import HawkVoiceGuide from "./guide/HawkVoiceGuide";
import HawkVoiceAssistant from "./guide/HawkVoiceAssistant";
import RestartTourButton from "./guide/RestartTourButton";
import { useTheme } from "../hooks/useTheme";
import { Sun, Moon, ChevronLeft, LayoutDashboard, Search, CreditCard, Radio, LogOut, Menu, X, Settings, Send, Mail, Briefcase, BarChart2, ScanLine, Users, FileSignature, Scale, ClipboardEdit, MapPin, Info, ClipboardList, FileStack, Radar, ShieldCheck, ShieldAlert, PhoneCall } from "lucide-react";
import HawkIcon from "./HawkIcon";
import PipelineSidebarNav from "./PipelineSidebarNav";
import UsageBadge from "./billing/UsageBadge";
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { isDemoCampaignOver } from "@/lib/demoCampaign";

const ADMIN_EMAIL = "hodgesthomas@outlook.com";

const BASE_NAV = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/search", icon: Search, label: "Site Search" },
  { path: "/crm", icon: Briefcase, label: "⏱️ Time Savers" },
  { path: "/hawk-tracker", icon: MapPin, label: "🗺️ Hawk Tracker" },
  { path: "/skip-trace", icon: PhoneCall, label: "📞 Skip-Trace" },
  { path: "/follow-up-tracker", icon: ClipboardList, label: "📋 Follow-Up Tracker" },
  { path: "/hawk-lease", icon: FileSignature, label: "🦅 HawkLease" },
  { path: "/hawk-law", icon: Scale, label: "⚖️ Hawk Law" },
  { path: "/zoning-verifier", icon: ShieldCheck, label: "🛡️ Zoning Verifier" },
  { path: "/compliance-dashboard", icon: ShieldAlert, label: "🧭 Compliance Dashboard" },
  { path: "/hawk-fill", icon: ClipboardEdit, label: "🪶 HawkFill" },
  { path: "/hawk-forms", icon: FileStack, label: "📑 Hawk Forms" },
  { path: "/hawk-docs", icon: ScanLine, label: "Document Intelligence" },
  { path: "/rfi-engine", icon: Radar, label: "📡 RF Intelligence Engine" },
  { path: "/pricing", icon: CreditCard, label: "Pricing & Plans" },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  // Sub-route = path with more than one segment (e.g. /scip/123) → show Back on mobile.
  const isSubRoute = location.pathname.split("/").filter(Boolean).length > 1;
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const [isAdmin, setIsAdmin] = useState(() => {
    try { return localStorage.getItem("sh_is_admin") === "1"; } catch { return false; }
  });
  const [demoExpired, setDemoExpired] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      const admin = u?.role === "admin" || u?.email === ADMIN_EMAIL;
      setIsAdmin(admin);
      try { localStorage.setItem("sh_is_admin", admin ? "1" : "0"); } catch {};
      // Campaign demo: start the trial clock at FIRST login (3-day window)
      if (u?.role === "demo" && !u?.demo_trial_started_at) {
        base44.auth.updateMe({ demo_trial_started_at: new Date().toISOString(), demo_trial_days: 3 }).catch(() => {});
      }
      // Demo expiry: default 5 days, but demo_trial_days on the user can override
      if (u?.role === "demo" && u?.demo_trial_started_at) {
        const trialDays = u?.demo_trial_days || 5;
        const expiresAt = new Date(u.demo_trial_started_at).getTime() + trialDays * 24 * 60 * 60 * 1000;
        if (Date.now() > expiresAt) setDemoExpired(true);
      }
      // Also block if admin toggled demo_disabled
      if (u?.role === "demo" && u?.demo_disabled) setDemoExpired(true);
      // Campaign hard cutoff — every demo locks when the campaign window ends
      if (u?.role === "demo" && isDemoCampaignOver()) setDemoExpired(true);
    });
  }, []);

  const adminExtra = isAdmin
    ? [
        { path: "/usage-analytics", icon: BarChart2, label: "Usage Analytics" },
        { path: "/subscriber-crm", icon: Users, label: "Subscriber CRM" },
        { path: "/send-update", icon: Send, label: "Send Update" },
        { path: "/mail-orders", icon: Mail, label: "Mail Orders" },
        { path: "/mail-analytics", icon: BarChart2, label: "Mail Analytics" },
      ]
    : [];

  const navItems = [
    { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    ...adminExtra,
    ...BASE_NAV.filter(i => i.path !== "/dashboard"),
  ];

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (demoExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">🦅</div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Your Demo Has Ended</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You've seen the wonders of AI Hawk Vision at work.<br />
            Ready to keep it? Call Tom directly for pricing.
          </p>
          <div className="space-y-2">
            <a href="tel:2487871888"
              className="block px-6 py-3 rounded-xl bg-primary text-primary-foreground font-heading font-bold text-sm hover:bg-primary/90 transition-colors">
              📞 Call Tom — 248-787-1888
            </a>
            <a href="mailto:tomhodges@onairs.com?subject=SiteHawk Demo — Ready to Talk Pricing"
              className="block px-6 py-3 rounded-xl border border-primary/30 text-primary font-heading font-bold text-sm hover:bg-primary/10 transition-colors">
              ✉️ tomhodges@onairs.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-background font-body pb-[env(safe-area-inset-bottom)]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-border bg-sidebar fixed inset-y-0 left-0 z-30">
        <div className="p-6 border-b border-border">
          <Link to="/" className="flex items-center gap-3">
            <HawkIcon size={40} />
            <div>
              <h1 className="font-heading font-bold text-lg text-sidebar-foreground tracking-tight">SiteHawk</h1>
              <p className="text-[10px] text-sidebar-foreground/70 font-medium italic">"When you need the AI Vision"™</p>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto min-h-0 sidebar-scroll">
          {navItems.map((item) => {
            const isActive = item.path === "/dashboard"
            ? location.pathname === item.path
            : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <div key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
                {/* On Site Search, mirror the live pipeline right under the menu item.
                    Kept compact + independently scrollable so it never pushes the
                    rest of the main menu (Time Savers → Pricing) below the fold. */}
                {item.path === "/search" && location.pathname === "/search" && (
                  <div className="mt-1 mb-1 max-h-28 overflow-y-auto sidebar-scroll shrink-0">
                    <PipelineSidebarNav />
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-0.5">
          <HubSpotSidebarConnect />
          <div className="border-t border-border/50 my-1" />
          {location.pathname === "/search" && (
            <div className="flex items-center justify-end pb-1">
              <RestartTourButton />
            </div>
          )}
          <button
            onClick={toggle}
            className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary w-full transition-all duration-200"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <Link
            to="/billing"
            className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary w-full transition-all duration-200"
          >
            <Settings className="w-4 h-4" />
            Billing
          </Link>
          <div className="px-4 py-1">
            <UsageBadge />
          </div>
          <Link
            to="/about"
            className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary w-full transition-all duration-200"
          >
            <Info className="w-4 h-4" />
            About
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary w-full transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 min-h-16 pt-[env(safe-area-inset-top)] bg-sidebar border-b border-border z-30 flex items-center justify-between px-4">
        {isSubRoute ? (
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm font-medium text-foreground py-2 -ml-1">
            <ChevronLeft className="w-5 h-5" /> Back
          </button>
        ) : (
          <Link to="/" className="flex items-center gap-2">
            <HawkIcon size={32} />
            <span className="font-heading font-bold text-sidebar-foreground">SiteHawk</span>
          </Link>
        )}
        <div className="flex items-center gap-1">
          <UsageBadge className="mr-1" />
          {location.pathname === "/search" && <RestartTourButton />}
          <Button variant="ghost" size="icon" onClick={toggle}>
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-20 bg-background/80 backdrop-blur-sm" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-16 left-0 right-0 bg-sidebar border-b border-border p-4 space-y-1" onClick={(e) => e.stopPropagation()}>
            {navItems.map((item) => {
              const isActive = item.path === "/dashboard"
                ? location.pathname === item.path
                : location.pathname === item.path || location.pathname.startsWith(item.path + "/");
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
            <Link to="/billing" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground w-full">
              <Settings className="w-4 h-4" />
              Billing
            </Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground w-full">
              <Info className="w-4 h-4" />
              About
            </Link>
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground w-full">
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0 pb-20 lg:pb-0 flex flex-col min-h-screen">
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full flex-1">
          <AppErrorBoundary>
            <Outlet />
          </AppErrorBoundary>
        </div>
        <AppFooter />
      </main>
      <MobileTabBar />
      <HawkBotWidget />
      <SARFCoachTour />
      <HawkVoiceGuide />
      <HawkVoiceAssistant />
    </div>
  );
}