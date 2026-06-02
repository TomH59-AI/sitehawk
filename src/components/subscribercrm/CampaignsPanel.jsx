import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { subscriberCampaignDraft } from "@/functions/subscriberCampaignDraft";
import { subscriberCampaignSend } from "@/functions/subscriberCampaignSend";
import { Sparkles, Plus, Loader2, Send, CheckCircle2, Mail, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CAMPAIGN_TYPES, CAMPAIGN_TYPE_LABEL, SEGMENTS, SEGMENT_LABEL } from "@/lib/subscriberCrm";

const STATUS_TONE = {
  draft: "bg-secondary text-secondary-foreground",
  pending_approval: "bg-amber-500/10 text-amber-700",
  approved: "bg-blue-500/10 text-blue-700",
  scheduled: "bg-blue-500/10 text-blue-700",
  sending: "bg-amber-500/10 text-amber-700",
  sent: "bg-emerald-500/10 text-emerald-700",
  canceled: "bg-red-500/10 text-red-700",
};

// Admin campaign manager: create, HawkBot-draft, approve, test, send.
export default function CampaignsPanel() {
  const [campaigns, setCampaigns] = useState([]);
  const [creating, setCreating] = useState(false);

  function load() {
    base44.entities.SubscriberCampaign.list("-created_date", 50).then(setCampaigns);
  }
  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Marketing emails only reach opted-in, non-unsubscribed contacts. Every send needs admin approval first.</p>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground shrink-0">
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {creating && <CampaignEditor onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}

      <div className="space-y-2">
        {campaigns.length === 0 && <p className="text-sm text-muted-foreground italic">No campaigns yet.</p>}
        {campaigns.map((c) => <CampaignRow key={c.id} campaign={c} onChange={load} />)}
      </div>
    </div>
  );
}

function CampaignRow({ campaign, onChange }) {
  const [busy, setBusy] = useState(false);
  const s = campaign.stats || {};

  async function approve() {
    setBusy(true);
    const me = await base44.auth.me();
    await base44.entities.SubscriberCampaign.update(campaign.id, { status: "approved", approved_by: me.email, approved_at: new Date().toISOString() });
    setBusy(false); onChange();
  }
  async function test() {
    setBusy(true);
    const me = await base44.auth.me();
    try { await subscriberCampaignSend({ campaign_id: campaign.id, test_email: me.email }); toast.success(`Test sent to ${me.email}`); }
    catch { toast.error("Test send failed"); }
    setBusy(false);
  }
  async function send() {
    if (!confirm(`Send "${campaign.campaign_name}" to segment "${SEGMENT_LABEL[campaign.target_segment] || campaign.target_segment}"?`)) return;
    setBusy(true);
    try { const res = await subscriberCampaignSend({ campaign_id: campaign.id }); toast.success(`Sent: ${res.data?.stats?.sent || 0}`); }
    catch { toast.error("Send failed"); }
    setBusy(false); onChange();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{campaign.campaign_name}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONE[campaign.status]}`}>{campaign.status.replace(/_/g, " ")}</span>
            {campaign.drafted_by_hawkbot && <span className="text-[10px] text-primary inline-flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> HawkBot</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{CAMPAIGN_TYPE_LABEL[campaign.type]} · {SEGMENT_LABEL[campaign.target_segment] || campaign.target_segment}</p>
          {campaign.subject && <p className="text-sm text-foreground mt-1.5 font-medium">{campaign.subject}</p>}
          {campaign.status === "sent" && (
            <p className="text-[11px] text-muted-foreground mt-1">Sent {s.sent || 0} · skipped {(s.skipped_unsubscribed || 0) + (s.skipped_bounced || 0)} · failed {s.failed || 0}{campaign.sent_at ? ` · ${format(new Date(campaign.sent_at), "MMM d")}` : ""}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {(campaign.status === "draft" || campaign.status === "pending_approval") && (
            <button onClick={approve} disabled={busy} className="text-xs px-2.5 py-1.5 rounded-md bg-blue-600 text-white inline-flex items-center gap-1 disabled:opacity-50"><CheckCircle2 className="w-3 h-3" /> Approve</button>
          )}
          {(campaign.status === "approved" || campaign.status === "scheduled") && (
            <>
              <button onClick={test} disabled={busy} className="text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground inline-flex items-center gap-1 disabled:opacity-50"><FlaskConical className="w-3 h-3" /> Test</button>
              <button onClick={send} disabled={busy} className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-600 text-white inline-flex items-center gap-1 disabled:opacity-50">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignEditor({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("product_update");
  const [segment, setSegment] = useState("all");
  const [topic, setTopic] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [byHawkbot, setByHawkbot] = useState(false);

  async function draft() {
    setDrafting(true);
    try {
      const res = await subscriberCampaignDraft({ type, segment, topic });
      setSubject(res.data?.subject || ""); setBody(res.data?.body || ""); setByHawkbot(true);
      toast.success("HawkBot drafted your email");
    } catch { toast.error("Draft failed"); }
    setDrafting(false);
  }
  async function save() {
    if (!name.trim() || !subject.trim()) { toast.error("Name and subject required"); return; }
    setSaving(true);
    const me = await base44.auth.me();
    await base44.entities.SubscriberCampaign.create({
      campaign_name: name.trim(), type, email_class: "marketing", target_segment: segment,
      subject: subject.trim(), body, status: "pending_approval", drafted_by_hawkbot: byHawkbot, created_by: me.email,
    });
    setSaving(false); onSaved();
  }

  return (
    <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="text-sm rounded-md border border-border px-2 py-2 bg-background" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="text-sm rounded-md border border-border px-2 py-2 bg-background">
          {CAMPAIGN_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className="text-sm rounded-md border border-border px-2 py-2 bg-background">
          {SEGMENTS.map((sg) => <option key={sg.key} value={sg.key}>{sg.label}</option>)}
        </select>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic / details (for HawkBot)" className="text-sm rounded-md border border-border px-2 py-2 bg-background" />
      </div>
      <button onClick={draft} disabled={drafting} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-primary/40 text-primary disabled:opacity-50">
        {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Let HawkBot draft it
      </button>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" className="w-full text-sm rounded-md border border-border px-2 py-2 bg-background" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Email body (HTML). Use {{name}} to personalize." className="w-full text-sm rounded-md border border-border px-2 py-2 bg-background" />
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> An unsubscribe footer is added automatically. Saved as “pending approval”.</p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-sm px-3 py-2 rounded-md border border-border text-muted-foreground">Cancel</button>
        <button onClick={save} disabled={saving} className="text-sm px-3 py-2 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save for approval</button>
      </div>
    </div>
  );
}