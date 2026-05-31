import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, FileText, Save, Loader2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import DocFieldRow from "./DocFieldRow";

// Review/edit screen: doc summary + every extracted field grouped by section.
export default function DocFieldsView({ document, onBack }) {
  const [fields, setFields] = useState(document.fields || []);
  const [saving, setSaving] = useState(false);

  const sections = useMemo(() => {
    const groups = {};
    fields.forEach((f, idx) => {
      const sec = f.section || "General";
      (groups[sec] = groups[sec] || []).push({ ...f, _idx: idx });
    });
    return groups;
  }, [fields]);

  const total = fields.length;
  const filled = fields.filter((f) => f.value && f.value.trim()).length;
  const remaining = total - filled;

  function updateField(idx, value) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, value, source: value ? (f.source === "scip" ? "scip" : "user") : "empty" } : f)));
  }

  async function save() {
    setSaving(true);
    try {
      await base44.entities.HawkDocument.update(document.id, { fields });
      toast.success("Saved.");
    } catch (err) {
      toast.error(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Answers
        </Button>
      </div>

      {/* Summary header */}
      <div className="bg-card rounded-xl border border-border p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="font-heading font-bold text-xl">{document.doc_name}</h2>
        </div>
        {document.doc_type && <div className="text-sm font-medium text-accent mb-2">{document.doc_type}</div>}
        {document.doc_summary && <p className="text-sm text-muted-foreground">{document.doc_summary}</p>}

        <div className="flex items-center gap-2 mt-4 text-sm">
          <ListChecks className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium text-foreground">{filled}/{total} fields completed</span>
          {remaining > 0 && <span className="text-muted-foreground">· {remaining} still need answers</span>}
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: total ? `${(filled / total) * 100}%` : "0%" }} />
        </div>
      </div>

      {/* Fields by section */}
      {Object.entries(sections).map(([section, rows]) => (
        <div key={section} className="bg-card rounded-xl border border-border mb-4 overflow-hidden">
          <div className="bg-muted/60 px-5 py-2.5 font-heading font-semibold text-sm">{section}</div>
          <div className="px-5">
            {rows.map((f) => (
              <DocFieldRow key={f._idx} field={f} onChange={(v) => updateField(f._idx, v)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}