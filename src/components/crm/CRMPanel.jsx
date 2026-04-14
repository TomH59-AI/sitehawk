import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Phone, Mail, Users, FileText, Send, Plus, ChevronDown, ChevronUp, Calendar, CheckCircle, Loader2, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

const ACTIVITY_ICONS = { call: Phone, email: Mail, meeting: Users, note: FileText, mail: Send };
const ACTIVITY_COLORS = { call: "text-blue-400", email: "text-violet-400", meeting: "text-amber-400", note: "text-muted-foreground", mail: "text-pink-400" };
const OUTCOME_COLORS = { positive: "text-emerald-400", neutral: "text-muted-foreground", negative: "text-red-400", no_answer: "text-amber-400" };
const OUTCOME_LABELS = { positive: "✓ Positive", neutral: "— Neutral", negative: "✗ Negative", no_answer: "No Answer" };

const STAGES = ["prospect", "contacted", "interested", "negotiating", "signed", "lost"];
const STAGE_COLORS = {
  prospect: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  contacted: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  interested: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  negotiating: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  signed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  lost: "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function CRMPanel({ result, searchId }) {
  const [open, setOpen] = useState(false);
  const [deal, setDeal] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // New activity form
  const [newType, setNewType] = useState("call");
  const [newSummary, setNewSummary] = useState("");
  const [newOutcome, setNewOutcome] = useState("neutral");
  const [newFollowUp, setNewFollowUp] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (open && !deal) loadDeal();
  }, [open]);

  const loadDeal = async () => {
    setLoading(true);
    const deals = await base44.entities.CRMDeal.filter({ candidate_id: result.id });
    if (deals.length > 0) {
      setDeal(deals[0]);
      const acts = await base44.entities.CRMActivity.filter({ deal_id: deals[0].id }, "-created_date", 20);
      setActivities(acts);
    } else {
      setDeal(null);
    }
    setLoading(false);
  };

  const handleCreateDeal = async () => {
    setSaving(true);
    const created = await base44.entities.CRMDeal.create({
      owner_name: result.owner_name || "Unknown Owner",
      parcel_address: result.parcel_address,
      owner_mailing_address: result.owner_mailing_address,
      candidate_id: result.id,
      search_id: searchId,
      stage: "prospect",
      phone: result.phone,
      email: result.email,
      match_score: result.match_score,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setDeal(created);
    setSaving(false);
  };

  const handleStageChange = async (stage) => {
    const updated = await base44.entities.CRMDeal.update(deal.id, { stage });
    setDeal(updated);
  };

  const handleAddActivity = async () => {
    if (!newSummary.trim()) return;
    setSaving(true);
    const act = await base44.entities.CRMActivity.create({
      deal_id: deal.id,
      candidate_id: result.id,
      type: newType,
      summary: newSummary,
      outcome: newOutcome,
      follow_up_date: newFollowUp || undefined,
    });
    if (newFollowUp) {
      await base44.entities.CRMDeal.update(deal.id, { follow_up_date: newFollowUp });
      setDeal(d => ({ ...d, follow_up_date: newFollowUp }));
    }
    setActivities(prev => [act, ...prev]);
    setNewSummary("");
    setNewFollowUp("");
    setNewOutcome("neutral");
    setShowForm(false);
    setSaving(false);
  };

  const activityCount = activities.length;

  return (
    <div className="mt-3 rounded-xl border border-border bg-card/50">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/50 rounded-xl transition-all"
      >
        <div className="flex items-center gap-2">
          <Briefcase className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">CRM</span>
          {deal && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${STAGE_COLORS[deal.stage]}`}>
              {deal.stage}
            </span>
          )}
          {activityCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">{activityCount}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
          ) : !deal ? (
            <div className="text-center py-3 space-y-2">
              <p className="text-xs text-muted-foreground">Track this candidate in your deal pipeline</p>
              <Button size="sm" onClick={handleCreateDeal} disabled={saving} className="gap-1.5 text-xs h-7">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add to CRM
              </Button>
            </div>
          ) : (
            <>
              {/* Stage selector */}
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Pipeline Stage</p>
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      className={`text-[10px] px-2.5 py-1 rounded-full border font-bold capitalize transition-all ${
                        deal.stage === s ? STAGE_COLORS[s] : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Follow-up reminder */}
              {deal.follow_up_date && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-400 font-semibold">
                    Follow-up: {format(new Date(deal.follow_up_date), "MMM d, yyyy")}
                  </span>
                </div>
              )}

              {/* Activities log */}
              {activities.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Activity Log</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {activities.map(act => {
                      const Icon = ACTIVITY_ICONS[act.type] || FileText;
                      return (
                        <div key={act.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-secondary border border-border">
                          <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${ACTIVITY_COLORS[act.type]}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground font-medium leading-snug">{act.summary}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] font-semibold ${OUTCOME_COLORS[act.outcome]}`}>{OUTCOME_LABELS[act.outcome]}</span>
                              {act.follow_up_date && (
                                <span className="text-[10px] text-muted-foreground">· Follow-up {format(new Date(act.follow_up_date), "MMM d")}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground">· {format(new Date(act.created_date), "MMM d")}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add activity */}
              {showForm ? (
                <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex gap-2">
                    {Object.keys(ACTIVITY_ICONS).map(t => {
                      const Icon = ACTIVITY_ICONS[t];
                      return (
                        <button
                          key={t}
                          onClick={() => setNewType(t)}
                          className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg border text-[10px] font-bold capitalize transition-all ${
                            newType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={newSummary}
                    onChange={e => setNewSummary(e.target.value)}
                    placeholder="What happened? Add notes..."
                    rows={2}
                    className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newOutcome}
                      onChange={e => setNewOutcome(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="positive">✓ Positive</option>
                      <option value="neutral">— Neutral</option>
                      <option value="negative">✗ Negative</option>
                      <option value="no_answer">No Answer</option>
                    </select>
                    <input
                      type="date"
                      value={newFollowUp}
                      onChange={e => setNewFollowUp(e.target.value)}
                      placeholder="Follow-up date"
                      className="flex-1 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
                    <Button size="sm" className="flex-1 h-7 text-xs gap-1" onClick={handleAddActivity} disabled={saving || !newSummary.trim()}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all"
                >
                  <Plus className="w-3 h-3" /> Log Activity
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}