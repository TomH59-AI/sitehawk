import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Briefcase, Phone, Mail, Users, FileText, Send, Plus, Calendar, ChevronRight, Search, Filter, MailPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import SyncToGoogleSheetButton from "@/components/crm/SyncToGoogleSheetButton";
import CRMExportButton from "@/components/crm/CRMExportButton";
import TargetPostcardModal from "@/components/crm/TargetPostcardModal";
import MailQueuePanel from "@/components/crm/MailQueuePanel";
import TimeSaversIndex from "@/components/crm/TimeSaversIndex";

const STAGES = ["prospect", "contacted", "interested", "negotiating", "signed", "lost"];
const STAGE_COLORS = {
  prospect: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  contacted: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  interested: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  negotiating: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  signed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  lost: "bg-red-500/20 text-red-400 border-red-500/30",
};
const ACTIVITY_ICONS = { call: Phone, email: Mail, meeting: Users, note: FileText, mail: Send };
const ACTIVITY_COLORS = { call: "text-blue-400", email: "text-violet-400", meeting: "text-amber-400", note: "text-muted-foreground", mail: "text-pink-400" };

export default function CRM() {
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPostcards, setShowPostcards] = useState(false);
  // When set, opens the postcard modal scoped to a single deal (per-lead mailer).
  const [postcardDeals, setPostcardDeals] = useState(null);
  const [view, setView] = useState("pipeline"); // "pipeline" | "mail_queue"

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [dealsData, activitiesData] = await Promise.all([
      base44.entities.CRMDeal.list("-updated_date", 100),
      base44.entities.CRMActivity.list("-created_date", 200),
    ]);
    setDeals(dealsData);
    setActivities(activitiesData);
    setLoading(false);
  };

  const getActivitiesForDeal = (dealId) => activities.filter(a => a.deal_id === dealId);

  const updateStage = async (deal, stage) => {
    const updated = await base44.entities.CRMDeal.update(deal.id, { stage });
    setDeals(prev => prev.map(d => d.id === deal.id ? updated : d));
    if (selectedDeal?.id === deal.id) setSelectedDeal(updated);
  };

  const filteredDeals = deals.filter(d => {
    const matchStage = stageFilter === "all" || d.stage === stageFilter;
    const matchSearch = !searchQuery || d.owner_name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.parcel_address?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStage && matchSearch;
  });

  // Upcoming follow-ups (next 7 days)
  const upcoming = deals
    .filter(d => d.follow_up_date && new Date(d.follow_up_date) >= new Date())
    .sort((a, b) => new Date(a.follow_up_date) - new Date(b.follow_up_date))
    .slice(0, 5);

  const stageCounts = STAGES.reduce((acc, s) => ({ ...acc, [s]: deals.filter(d => d.stage === s).length }), {});

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground flex items-center gap-3">
            <Briefcase className="w-7 h-7 text-primary" /> Deal Pipeline
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{deals.length} deals tracked · {activities.length} interactions logged</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => setShowPostcards(true)} disabled={deals.length === 0} className="gap-2 font-heading font-semibold bg-emerald-600 hover:bg-emerald-500 text-white">
            <MailPlus className="w-4 h-4" /> Mail Target Postcards
          </Button>
          <CRMExportButton deals={deals} />
          <SyncToGoogleSheetButton />
          <Link to="/search">
            <Button className="gap-2 font-heading font-semibold" variant="outline">
              <Search className="w-4 h-4" /> Find New Sites
            </Button>
          </Link>
        </div>
      </div>

      {showPostcards && (
        <TargetPostcardModal deals={filteredDeals.length ? filteredDeals : deals} onClose={() => setShowPostcards(false)} />
      )}

      {postcardDeals && (
        <TargetPostcardModal deals={postcardDeals} onClose={() => setPostcardDeals(null)} />
      )}

      {/* View tabs */}
      <div className="flex gap-2 border-b border-border">
        {[["pipeline", "Deal Pipeline"], ["mail_queue", "Mail Queue"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 text-sm font-heading font-semibold border-b-2 -mb-px transition-colors ${
              view === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "mail_queue" ? (
        <MailQueuePanel />
      ) : (
      <>
      {/* Pipeline summary bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map(s => (
          <button
            key={s}
            onClick={() => setStageFilter(stageFilter === s ? "all" : s)}
            className={`rounded-xl border px-3 py-2.5 text-center transition-all ${
              stageFilter === s ? STAGE_COLORS[s] + " ring-1 ring-current" : "border-border bg-card hover:bg-secondary"
            }`}
          >
            <p className="text-lg font-heading font-bold text-foreground">{stageCounts[s] || 0}</p>
            <p className="text-[10px] capitalize text-muted-foreground font-medium">{s}</p>
          </button>
        ))}
      </div>

      {/* Upcoming follow-ups */}
      {upcoming.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Upcoming Follow-ups</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map(d => (
              <button
                key={d.id}
                onClick={() => setSelectedDeal(d)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
              >
                <span className="text-xs font-semibold text-foreground">{d.owner_name}</span>
                <span className="text-[10px] text-amber-400">{format(new Date(d.follow_up_date), "MMM d")}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Deal list */}
        <div className="flex-1 space-y-3">
          {/* Search + filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search owner or address..."
                className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {stageFilter !== "all" && (
              <button onClick={() => setStageFilter("all")} className="px-3 py-2 rounded-lg border border-border bg-secondary text-xs text-muted-foreground hover:text-foreground transition-all flex items-center gap-1">
                <Filter className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {filteredDeals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">No deals yet</p>
              <p className="text-xs text-muted-foreground">Run a scan and click "Add to CRM" on any candidate.</p>
            </div>
          ) : (
            filteredDeals.map(deal => {
              const dealActivities = getActivitiesForDeal(deal.id);
              const isSelected = selectedDeal?.id === deal.id;
              return (
                <button
                  key={deal.id}
                  onClick={() => setSelectedDeal(isSelected ? null : deal)}
                  className={`w-full text-left rounded-xl border p-4 transition-all ${
                    isSelected ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:border-primary/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-heading font-semibold text-sm text-foreground truncate">{deal.owner_name}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold capitalize ${STAGE_COLORS[deal.stage]}`}>{deal.stage}</span>
                        {deal.match_score && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">{deal.match_score}%</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{deal.parcel_address || "No address"}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {dealActivities.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">{dealActivities.length} interaction{dealActivities.length !== 1 ? "s" : ""}</span>
                        )}
                        {deal.follow_up_date && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {format(new Date(deal.follow_up_date), "MMM d")}
                          </span>
                        )}
                        {deal.phone && <span className="text-[10px] text-muted-foreground">{deal.phone}</span>}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isSelected ? "rotate-90" : ""}`} />
                  </div>

                  {/* Expanded deal detail */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3" onClick={e => e.stopPropagation()}>
                      {/* Stage changer */}
                      <div className="flex flex-wrap gap-1.5">
                        {STAGES.map(s => (
                          <button
                            key={s}
                            onClick={() => updateStage(deal, s)}
                            className={`text-[10px] px-2.5 py-1 rounded-full border font-bold capitalize transition-all ${
                              deal.stage === s ? STAGE_COLORS[s] : "border-border text-muted-foreground hover:border-primary/30"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {/* Per-lead paid postcard mailer */}
                      <button
                        onClick={() => setPostcardDeals([deal])}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all"
                      >
                        <MailPlus className="w-3.5 h-3.5" /> Mail Postcard
                        <span className="ml-0.5 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-bold">💵 Paid</span>
                      </button>

                      {/* Activity timeline */}
                      {dealActivities.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Activity Log</p>
                          {dealActivities.slice(0, 5).map(act => {
                            const Icon = ACTIVITY_ICONS[act.type] || FileText;
                            return (
                              <div key={act.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-secondary">
                                <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ACTIVITY_COLORS[act.type]}`} />
                                <div>
                                  <p className="text-xs text-foreground">{act.summary}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">{act.type} · {format(new Date(act.created_date), "MMM d, yyyy")}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">No interactions logged yet. Open this candidate from the search results to log activities.</p>
                      )}

                      {deal.search_id && (
                        <Link
                          to={`/search?id=${deal.search_id}`}
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Search className="w-3 h-3" /> View original search
                        </Link>
                      )}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Stats sidebar */}
        <div className="lg:w-64 space-y-4 shrink-0">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</p>
            {activities.slice(0, 8).map(act => {
              const Icon = ACTIVITY_ICONS[act.type] || FileText;
              const relatedDeal = deals.find(d => d.id === act.deal_id);
              return (
                <div key={act.id} className="flex items-start gap-2">
                  <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ACTIVITY_COLORS[act.type]}`} />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground truncate">{act.summary}</p>
                    <p className="text-[10px] text-muted-foreground">{relatedDeal?.owner_name || "—"} · {format(new Date(act.created_date), "MMM d")}</p>
                  </div>
                </div>
              );
            })}
            {activities.length === 0 && <p className="text-xs text-muted-foreground italic">No activity yet.</p>}
          </div>
        </div>
      </div>
      </>
      )}

      {/* AFTER THE DEAL — time-saver tools index, always visible under the pipeline */}
      <TimeSaversIndex />
    </div>
  );
}