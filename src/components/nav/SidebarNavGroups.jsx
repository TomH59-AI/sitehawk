import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import PipelineSidebarNav from "@/components/PipelineSidebarNav";

// Turn the flat nav array (headers + items) into [{ header, items }].
function toGroups(navItems) {
  const groups = [];
  for (const item of navItems) {
    if (item.header) groups.push({ header: item.header, items: [] });
    else if (groups.length) groups[groups.length - 1].items.push(item);
    else groups.push({ header: null, items: [item] });
  }
  return groups;
}

const isItemActive = (path, pathname) =>
  path === "/dashboard" ? pathname === path : pathname === path || pathname.startsWith(path + "/");

/**
 * SidebarNavGroups — collapsible sidebar sections. Every group is closed by
 * default except the one containing the current route, so the menu stays short
 * instead of scrolling past the fold. Labels, icons and destinations are
 * unchanged; `variant` only switches the touch-friendly mobile spacing.
 */
export default function SidebarNavGroups({ navItems, pathname, variant = "desktop", onNavigate }) {
  const groups = useMemo(() => toGroups(navItems), [navItems]);
  const activeHeader = useMemo(() => {
    const g = groups.find((grp) => grp.items.some((i) => isItemActive(i.path, pathname)));
    return g?.header ?? groups[0]?.header ?? null;
  }, [groups, pathname]);
  const [open, setOpen] = useState(() => new Set());

  // The group holding the current route is always open; clicks add/remove others.
  const openSet = useMemo(() => {
    const s = new Set(open);
    if (activeHeader) s.add(activeHeader);
    return s;
  }, [open, activeHeader]);
  const toggle = (header) => {
    const next = new Set(openSet);
    if (next.has(header)) next.delete(header);
    else next.add(header);
    setOpen(next);
  };

  const mobile = variant === "mobile";

  return (
    <div className="space-y-0.5">
      {groups.map((group, gi) => {
        const isOpen = group.header == null || openSet.has(group.header);
        const hasActive = group.items.some((i) => isItemActive(i.path, pathname));
        return (
          <div key={group.header || `g-${gi}`}>
            {group.header && (
              <button
                type="button"
                onClick={() => toggle(group.header)}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-1.5 rounded-md px-4 ${mobile ? "py-2.5" : "py-2"} text-[10px] font-bold tracking-widest transition-colors hover:bg-sidebar-accent/40 ${
                  hasActive ? "text-primary" : "text-sidebar-foreground/40"
                }`}
              >
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <span className="flex-1 text-left">{group.header}</span>
                {!isOpen && <span className="font-mono text-[10px] opacity-60">{group.items.length}</span>}
              </button>
            )}
            {isOpen &&
              group.items.map((item) => {
                const active = isItemActive(item.path, pathname);
                return (
                  <div key={item.path}>
                    <Link
                      to={item.path}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 rounded-lg px-4 ${mobile ? "py-3" : "py-2"} text-sm font-medium transition-all duration-200 ${
                        active
                          ? "border border-primary/20 bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </Link>
                    {!mobile && item.desc && (
                      <p className="-mt-1 mb-1 px-4 text-[10px] leading-snug text-sidebar-foreground/40">{item.desc}</p>
                    )}
                    {/* On Site Search, mirror the live pipeline under the menu item. */}
                    {!mobile && item.path === "/search" && pathname === "/search" && (
                      <div className="sidebar-scroll mb-1 mt-1 max-h-28 shrink-0 overflow-y-auto">
                        <PipelineSidebarNav />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}