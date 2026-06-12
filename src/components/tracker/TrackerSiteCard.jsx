import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, AlertOctagon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MilestoneChecklist from "./MilestoneChecklist";
import { MILESTONE_LABELS, TRACKER_GREEN } from "@/lib/hawkTracker";

// One tracker site — collapsed header row + expandable 19-gate checklist.
export default function TrackerSiteCard({ site, milestones, onUpdateMilestone, onUpdateSite, onDelete }) {
  const [open, setOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState(null);

  const toggleBlock = () => {
    if (site.is_blocked) {
      onUpdateSite(site, { is_blocked: false, blocked_reason: "" });
    } else {
      setBlockDraft("");
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden bg-card ${site.is_blocked ? "border-red-400" : "border-border"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-heading font-bold text-sm text-foreground">{site.site_name}</span>
            {site.carrier_site_number && <span className="text-xs font-mono text-muted-foreground">#{site.carrier_site_number}</span>}
            {site.carrier && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{site.carrier}</span>}
            {site.is_blocked && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1">
                <AlertOctagon className="w-3 h-3" /> BLOCKED{site.blocked_reason ? ` — ${site.blocked_reason}` : ""}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {[site.market, site.jurisdiction, site.state].filter(Boolean).join(" · ")}
            {site.market || site.jurisdiction || site.state ? " · " : ""}
            <span style={{ color: TRACKER_GREEN }} className="font-semibold">{MILESTONE_LABELS[site.current_status] || site.current_status}</span>
          </div>
        </div>
        {site.target_on_air && (
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Target On-Air</div>
            <div className="text-xs font-mono font-bold text-foreground">{format(new Date(site.target_on_air), "MMM d, yyyy")}</div>
          </div>
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant={site.is_blocked ? "outline" : "destructive"} className="h-7 text-xs" onClick={toggleBlock}>
              {site.is_blocked ? "Unblock Site" : "Mark Blocked"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onDelete(site)}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
            </Button>
          </div>
          {blockDraft !== null && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Blocked reason…"
                className="h-8 text-xs"
                value={blockDraft}
                onChange={(e) => setBlockDraft(e.target.value)}
                autoFocus
              />
              <Button size="sm" className="h-8 text-xs" style={{ background: "#dc2626" }}
                onClick={() => { onUpdateSite(site, { is_blocked: true, blocked_reason: blockDraft }); setBlockDraft(null); }}>
                Block
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setBlockDraft(null)}>Cancel</Button>
            </div>
          )}
          <MilestoneChecklist rows={milestones} onUpdate={onUpdateMilestone} />
        </div>
      )}
    </div>
  );
}