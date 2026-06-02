import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Lightbulb, Plus, Check, Loader2, ShieldOff, Mail } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  TIERS, TASK_TYPES, TASK_TYPE_LABEL, ACTIVITY_LABEL, suggestNextActions, estimateHealth,
} from "@/lib/subscriberCrm";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const RISK_TONE = { low: "text-emerald-600", medium: "text-amber-600", high: "text-red-600", unknown: "text-muted-foreground" };

// Admin-only detail drawer: profile, consent, usage, suggested actions,
// activity timeline, tasks, and private notes.
export default function SubscriberDetail({ contact, open, onClose, onChange }) {
  const [tab, setTab] = useState("overview");
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!contact?.id) return;
    setNotes(contact.notes || "");
    setTab("overview");
    Promise.all([
      base44.entities.SubscriberCRMActivity.filter({ subscriber_contact_id: contact.id }, "-created_date", 50),
      base44.entities.SubscriberCRMTask.filter({ subscriber_contact_id: contact.id }, "-created_date", 50),
    ]).then(([a, t]) => { setActivities(a); setTasks(t); });
  }, [contact?.id]);

  if (!contact) return null;
  const est = estimateHealth(contact);
  const suggestions = suggestNextActions(contact);

  async function patch(p, activitySummary, activityType = "admin_note") {
    const updated = await base44.entities.SubscriberCRMContact.update(contact.id, p);
    if (activitySummary) {
      const a = await base44.entities.SubscriberCRMActivity.create({
        subscriber_contact_id: contact.id, type: activityType, summary: activitySummary,
      });
      setActivities((cur) => [a, ...cur]);
    }
    onChange?.(updated);
  }

  async function saveNotes() {
    await base44.entities.SubscriberCRMContact.update(contact.id, { notes });
    toast.success("Private notes saved");
    onChange?.({ ...contact, notes });
  }

  async function toggleUnsub() {
    if (contact.unsubscribed_at) {
      await patch({ unsubscribed_at: null, unsubscribe_reason: null }, "Marketing consent restored (admin)");
    } else {
      await patch({ unsubscribed_at: new Date().toISOString(), marketing_opt_in: false, unsubscribe_reason: "admin" }, "Unsubscribed from marketing (admin)");
    }
    toast.success("Consent updated");
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0">
        <div className="p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-heading font-bold text-lg text-foreground">{contact.name || contact.email}</h2>
              <p className="text-sm text-muted-foreground">{contact.email}{contact.company ? ` · ${contact.company}` : ""}</p>
            </div>
            <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{contact.subscription_tier}</span>
            <span className={`font-medium ${RISK_TONE[contact.churn_risk] || RISK_TONE.unknown}`}>Churn: {contact.churn_risk}</span>
            <span className="text-muted-foreground">Health ~{contact.health_score ?? est.score}</span>
          </div>
        </div>

        <div className="flex border-b border-border text-sm">
          {["overview", "activity", "tasks", "notes"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 capitalize font-medium ${tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">
          {tab === "overview" && (
            <>
              {suggestions.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1.5"><Lightbulb className="w-3.5 h-3.5" /> HawkBot suggests</div>
                  <ul className="space-y-1 text-sm text-foreground">
                    {suggestions.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                <Metric label="SCIPs" value={contact.total_scips_created || 0} />
                <Metric label="Exported" value={contact.total_scips_exported || 0} />
                <Metric label="Mailers" value={contact.total_mailers_sent || 0} />
              </div>

              <Field label="Subscription tier">
                <select value={contact.subscription_tier} onChange={(e) => patch({ subscription_tier: e.target.value }, `Tier → ${e.target.value}`, "subscription_change")}
                  className="w-full text-sm rounded-md border border-border px-2 py-1.5 bg-background">
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>

              {/* Consent block */}
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground"><Mail className="w-3.5 h-3.5" /> Email consent</div>
                <label className="flex items-center justify-between text-sm">
                  <span>Marketing opt-in</span>
                  <input type="checkbox" checked={!!contact.marketing_opt_in && !contact.unsubscribed_at}
                    onChange={(e) => patch({ marketing_opt_in: e.target.checked, consent_source: "admin", consent_timestamp: new Date().toISOString() }, `Marketing opt-in → ${e.target.checked}`)} />
                </label>
                {contact.unsubscribed_at && (
                  <p className="text-xs text-red-600 flex items-center gap-1"><ShieldOff className="w-3 h-3" /> Unsubscribed {format(new Date(contact.unsubscribed_at), "MMM d, yyyy")}{contact.unsubscribe_reason ? ` · ${contact.unsubscribe_reason}` : ""}</p>
                )}
                <button onClick={toggleUnsub} className="text-xs underline text-muted-foreground">
                  {contact.unsubscribed_at ? "Restore marketing consent" : "Mark unsubscribed"}
                </button>
              </div>
            </>
          )}

          {tab === "activity" && (
            <div className="space-y-2">
              {activities.length === 0 && <p className="text-sm text-muted-foreground italic">No activity yet.</p>}
              {activities.map((a) => (
                <div key={a.id} className="border-l-2 border-primary/40 pl-3 py-1">
                  <p className="text-sm text-foreground">{a.summary || ACTIVITY_LABEL[a.type]}</p>
                  <p className="text-[11px] text-muted-foreground">{ACTIVITY_LABEL[a.type] || a.type}{a.created_date ? ` · ${format(new Date(a.created_date), "MMM d, h:mma")}` : ""}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "tasks" && <TasksTab contact={contact} tasks={tasks} setTasks={setTasks} />}

          {tab === "notes" && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Private admin notes — never shown to the subscriber.</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8}
                className="w-full text-sm rounded-md border border-border px-2 py-2 bg-background" />
              <button onClick={saveNotes} className="mt-2 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground">Save notes</button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-secondary p-2">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
function Field({ label, children }) {
  return <div><label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</label><div className="mt-1">{children}</div></div>;
}

function TasksTab({ contact, tasks, setTasks }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("welcome_call");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const t = await base44.entities.SubscriberCRMTask.create({
      subscriber_contact_id: contact.id, task_type: type, title: title.trim(), due_date: due || undefined, status: "open",
    });
    setTasks((cur) => [t, ...cur]); setTitle(""); setDue(""); setAdding(false); setSaving(false);
  }
  async function done(t) {
    await base44.entities.SubscriberCRMTask.update(t.id, { status: "done", completed_at: new Date().toISOString() });
    setTasks((cur) => cur.map((x) => x.id === t.id ? { ...x, status: "done" } : x));
  }
  const open = tasks.filter((t) => t.status === "open");
  return (
    <div className="space-y-2">
      {open.length === 0 && <p className="text-sm text-muted-foreground italic">No open tasks.</p>}
      {open.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
          <button onClick={() => done(t)} className="w-5 h-5 rounded-full border border-primary flex items-center justify-center"><Check className="w-3 h-3 text-primary" /></button>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground truncate">{t.title}</p>
            <p className="text-[11px] text-muted-foreground">{TASK_TYPE_LABEL[t.task_type]}{t.due_date ? ` · ${format(new Date(t.due_date), "MMM d")}` : ""}</p>
          </div>
        </div>
      ))}
      {adding ? (
        <div className="rounded-lg border border-primary p-3 space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title…" className="w-full text-sm rounded-md border border-border px-2 py-1.5 bg-background" />
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="flex-1 text-xs rounded-md border border-border px-2 py-1.5 bg-background">
              {TASK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="flex-1 text-xs rounded-md border border-border px-2 py-1.5 bg-background" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 text-xs py-1.5 rounded-md border border-border text-muted-foreground">Cancel</button>
            <button onClick={add} disabled={saving || !title.trim()} className="flex-1 text-xs py-1.5 rounded-md bg-primary text-primary-foreground inline-flex items-center justify-center gap-1 disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border text-xs text-primary"><Plus className="w-3 h-3" /> Add task</button>
      )}
    </div>
  );
}