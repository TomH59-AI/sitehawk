import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import {
  FileText, Plus, Trash2, Loader2, Save, Edit3, X, Star, Wand2, Copy,
} from "lucide-react";

const TONES = [
  { value: "professional", label: "Professional", desc: "Formal, business-grade" },
  { value: "friendly", label: "Friendly", desc: "Warm, neighborly" },
  { value: "warm", label: "Warm", desc: "Personal, human" },
  { value: "direct", label: "Direct", desc: "Plain, no-frills" },
  { value: "urgent", label: "Urgent", desc: "Time-sensitive" },
];

const MERGE_FIELDS = [
  "{{owner_name}}", "{{parcel_address}}", "{{mailing_address}}",
  "{{sender_name}}", "{{sender_company}}", "{{sender_phone}}", "{{sender_email}}",
];

const DEFAULT_BODY = `We're researching possible locations for a wireless communications tower and your property came up as worth a conversation.

This is simply an exploratory inquiry — there are no commitments, and nothing is decided. If you'd be open to discussing whether a ground lease might make sense, I'd welcome a quick call.

If now isn't the right time, no problem at all. Thank you for your consideration.`;

export default function PostcardTemplatesPanel() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | "new" | template object
  const [draft, setDraft] = useState({ name: "", tone: "professional", body: "", is_default: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await base44.entities.PostcardTemplate.list("-updated_date", 50);
      setTemplates(rows || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startNew = () => {
    setDraft({ name: "", tone: "professional", body: DEFAULT_BODY, is_default: templates.length === 0 });
    setEditing("new");
  };

  const startEdit = (t) => {
    setDraft({ name: t.name || "", tone: t.tone || "professional", body: t.body || "", is_default: !!t.is_default });
    setEditing(t);
  };

  const cancelEdit = () => { setEditing(null); setDraft({ name: "", tone: "professional", body: "", is_default: false }); };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.body.trim()) return;
    setSaving(true);
    try {
      // If marking as default, unset other defaults first.
      if (draft.is_default) {
        const others = templates.filter((t) => t.is_default && t.id !== editing?.id);
        if (others.length) {
          await base44.entities.PostcardTemplate.updateMany(
            { id: { $in: others.map((o) => o.id) } },
            { $set: { is_default: false } },
          );
        }
      }
      if (editing === "new") {
        await base44.entities.PostcardTemplate.create({ ...draft });
      } else if (editing?.id) {
        await base44.entities.PostcardTemplate.update(editing.id, { ...draft });
      }
      cancelEdit();
      load();
    } catch (e) {
      console.error("template save error", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    try {
      await base44.entities.PostcardTemplate.delete(id);
      load();
    } catch (e) { console.error("delete error", e); }
  };

  const setDefault = async (t) => {
    try {
      const others = templates.filter((o) => o.is_default && o.id !== t.id);
      if (others.length) {
        await base44.entities.PostcardTemplate.updateMany(
          { id: { $in: others.map((o) => o.id) } },
          { $set: { is_default: false } },
        );
      }
      await base44.entities.PostcardTemplate.update(t.id, { is_default: true });
      load();
    } catch (e) { console.error("set default error", e); }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Reusable Outreach</p>
          <h2 className="font-heading text-xl font-bold text-foreground">Postcard Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">Save on-brand copy once and reuse it across campaigns. Merge fields auto-fill per recipient.</p>
        </div>
        {editing === null && (
          <button onClick={startNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New Template
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : editing !== null ? (
        <TemplateEditor
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          onSave={handleSave}
          onCancel={cancelEdit}
          isNew={editing === "new"}
        />
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No saved templates yet. Create one to reuse your outreach copy across campaigns.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-border bg-secondary/30 p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground">{t.name}</span>
                  {t.is_default && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 inline-flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Default</span>}
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold capitalize text-primary">{t.tone || "professional"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!t.is_default && (
                  <button onClick={() => setDefault(t)} title="Set as default" className="rounded p-1.5 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600">
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => startEdit(t)} title="Edit" className="rounded p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(t.id)} title="Delete" className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateEditor({ draft, setDraft, saving, onSave, onCancel, isNew }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Wand2 className="h-4 w-4 text-primary" /> {isNew ? "New Template" : "Edit Template"}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] text-muted-foreground font-medium">Template Name</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Vacant Land — Friendly Intro"
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="text-[10px] text-muted-foreground font-medium">Tone</span>
          <select value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value })}
            className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-secondary text-sm text-foreground capitalize focus:outline-none focus:ring-1 focus:ring-primary">
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
          </select>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground font-medium">Message Body</span>
          <div className="flex flex-wrap gap-1">
            {MERGE_FIELDS.map((f) => (
              <button key={f} type="button" onClick={() => setDraft({ ...draft, body: draft.body + " " + f })}
                className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-primary hover:bg-primary/10">
                {f}
              </button>
            ))}
          </div>
        </div>
        <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={6}
          className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed" />
        <p className="text-[10px] text-muted-foreground mt-1">Merge fields are substituted per recipient at mail time. Keep it factual and non-binding — no promises of approval, rent, or a guaranteed lease.</p>
      </div>

      <label className="flex items-center gap-2 text-xs text-foreground">
        <input type="checkbox" checked={draft.is_default} onChange={(e) => setDraft({ ...draft, is_default: e.target.checked })} />
        <span>Set as default template (auto-selected when mailing)</span>
      </label>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary">
          <X className="inline w-4 h-4 mr-1" />Cancel
        </button>
        <button onClick={onSave} disabled={!draft.name.trim() || !draft.body.trim() || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Template
        </button>
      </div>
    </div>
  );
}