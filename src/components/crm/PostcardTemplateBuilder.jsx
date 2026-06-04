import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Plus, Trash2, Save, Loader2, FileText, Star, Wand2, Eye } from "lucide-react";
import { MERGE_FIELDS, renderTemplate, SAMPLE_MERGE_DATA } from "@/lib/postcardMerge.js";
import { draftHawkBotLetter } from "@/functions/draftHawkBotLetter";

const TONES = ["professional", "friendly", "warm", "direct", "urgent"];
const BLANK = { name: "", tone: "professional", body: "", is_default: false };

// Template builder for standardized outreach postcards. Users save reusable copy
// with merge fields ({{owner_name}}, {{parcel_address}}, …) that auto-fill per recipient.
export default function PostcardTemplateBuilder({ onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.PostcardTemplate.list("-updated_date", 100);
    setTemplates(list);
    setLoading(false);
  };

  const isEditingExisting = !!editing.id;

  const insertField = (token) => {
    const ta = bodyRef.current;
    const tag = `{{${token}}}`;
    if (!ta) { setEditing((e) => ({ ...e, body: (e.body || "") + tag })); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + tag + ta.value.slice(end);
    setEditing((e) => ({ ...e, body: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + tag.length;
    });
  };

  const handleDraft = async () => {
    setDrafting(true);
    try {
      const res = await draftHawkBotLetter({
        owner_name: "{{owner_name}}",
        parcel_address: "{{parcel_address}}",
        sender_company: "{{sender_company}}",
        sender_phone: "{{sender_phone}}",
        sender_email: "{{sender_email}}",
        tonality: editing.tone,
      });
      if (res.data?.body) setEditing((e) => ({ ...e, body: res.data.body }));
    } catch { /* ignore */ }
    setDrafting(false);
  };

  const handleSave = async () => {
    if (!editing.name.trim() || !editing.body.trim()) return;
    setSaving(true);
    const payload = { name: editing.name, tone: editing.tone, body: editing.body, is_default: editing.is_default };
    // Only one default — clear others if this is marked default.
    if (editing.is_default) {
      const others = templates.filter((t) => t.is_default && t.id !== editing.id);
      await Promise.all(others.map((t) => base44.entities.PostcardTemplate.update(t.id, { is_default: false })));
    }
    if (editing.id) await base44.entities.PostcardTemplate.update(editing.id, payload);
    else await base44.entities.PostcardTemplate.create(payload);
    setEditing(BLANK);
    setSaving(false);
    load();
  };

  const handleDelete = async (id) => {
    await base44.entities.PostcardTemplate.delete(id);
    if (editing.id === id) setEditing(BLANK);
    load();
  };

  const preview = renderTemplate(editing.body, SAMPLE_MERGE_DATA);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-heading font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Postcard Template Builder
            </h3>
            <p className="text-xs text-muted-foreground">Save standardized outreach copy with auto-filled owner & parcel fields.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Saved templates list */}
          <div className="p-5 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Saved Templates</p>
              <button onClick={() => setEditing(BLANK)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : templates.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-6 text-center">No templates yet. Build one on the right.</p>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg border px-3 py-2.5 transition-all cursor-pointer ${
                    editing.id === t.id ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/40 hover:border-primary/20"
                  }`}
                  onClick={() => setEditing({ id: t.id, name: t.name, tone: t.tone || "professional", body: t.body || "", is_default: !!t.is_default })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                        {t.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                        {t.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate capitalize">{t.tone} · {t.body?.slice(0, 50)}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-muted-foreground hover:text-red-500 shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Editor */}
          <div className="p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {isEditingExisting ? "Edit Template" : "New Template"}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Template name"
                className="px-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={editing.tone}
                onChange={(e) => setEditing({ ...editing, tone: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border bg-secondary text-xs capitalize text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Merge field chips */}
            <div>
              <p className="text-[10px] text-muted-foreground font-medium mb-1.5">Insert auto-fill field:</p>
              <div className="flex flex-wrap gap-1.5">
                {MERGE_FIELDS.map((f) => (
                  <button
                    key={f.token}
                    onClick={() => insertField(f.token)}
                    className="text-[11px] px-2 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 font-medium"
                  >
                    + {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground font-medium">Message body</p>
              <button onClick={handleDraft} disabled={drafting} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0C1B2E] hover:bg-[#15263f] text-white text-[11px] font-bold disabled:opacity-50">
                {drafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} Draft with HawkBot
              </button>
            </div>
            <textarea
              ref={bodyRef}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              rows={6}
              placeholder="Dear {{owner_name}}, regarding your property at {{parcel_address}}…"
              className="w-full px-3 py-2 rounded-lg border border-border bg-secondary text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
            />

            {/* Live preview */}
            {editing.body && (
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1"><Eye className="w-3 h-3" /> Preview (sample data)</p>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{preview}</p>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
              Make this my default template
            </label>

            <button
              onClick={handleSave}
              disabled={saving || !editing.name.trim() || !editing.body.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-all disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEditingExisting ? "Update Template" : "Save Template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}