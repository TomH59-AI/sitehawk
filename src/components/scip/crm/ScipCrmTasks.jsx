import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Check, Clock, Loader2 } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { SKYWAVE } from "@/lib/skywave";
import { TASK_TYPES, TASK_TYPE_LABEL } from "@/lib/scipCrm";

// Tasks / reminders for a SCIP CRM deal.
export default function ScipCrmTasks({ deal, tasks, onChange }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("call");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function addTask() {
    if (!title.trim()) return;
    setSaving(true);
    await base44.entities.ScipCRMTask.create({
      scip_crm_deal_id: deal.id,
      scip_record_id: deal.scip_record_id,
      title: title.trim(),
      task_type: type,
      due_date: due || undefined,
      status: "open",
    });
    setTitle(""); setDue(""); setType("call"); setAdding(false);
    setSaving(false);
    onChange?.();
  }

  async function complete(task) {
    await base44.entities.ScipCRMTask.update(task.id, {
      status: "done",
      completed_at: new Date().toISOString(),
    });
    onChange?.();
  }

  const open = (tasks || []).filter((t) => t.status !== "done");
  const done = (tasks || []).filter((t) => t.status === "done");

  return (
    <div className="space-y-2">
      {open.length === 0 && <p className="text-xs italic" style={{ color: SKYWAVE.muted }}>No open tasks.</p>}
      {open.map((t) => {
        const overdue = t.due_date && isPast(parseISO(t.due_date));
        return (
          <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: SKYWAVE.line }}>
            <button onClick={() => complete(t)} className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0" style={{ borderColor: SKYWAVE.blue }}>
              <Check className="w-3 h-3" style={{ color: SKYWAVE.blue }} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: SKYWAVE.navy }}>{t.title}</p>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: overdue ? "#dc2626" : SKYWAVE.muted }}>
                <span>{TASK_TYPE_LABEL[t.task_type] || t.task_type}</span>
                {t.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(parseISO(t.due_date), "MMM d")}{overdue ? " · overdue" : ""}</span>}
                {t.auto_generated && <span>· auto</span>}
              </div>
            </div>
          </div>
        );
      })}

      {done.length > 0 && (
        <p className="text-[11px]" style={{ color: SKYWAVE.muted }}>{done.length} completed</p>
      )}

      {adding ? (
        <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: SKYWAVE.blue }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title…"
            className="w-full text-sm rounded-md border px-2 py-1.5" style={{ borderColor: SKYWAVE.line }} />
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="flex-1 text-xs rounded-md border px-2 py-1.5 bg-white" style={{ borderColor: SKYWAVE.line }}>
              {TASK_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="flex-1 text-xs rounded-md border px-2 py-1.5" style={{ borderColor: SKYWAVE.line }} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 text-xs py-1.5 rounded-md border" style={{ borderColor: SKYWAVE.line, color: SKYWAVE.muted }}>Cancel</button>
            <button onClick={addTask} disabled={saving || !title.trim()} className="flex-1 text-xs py-1.5 rounded-md text-white inline-flex items-center justify-center gap-1 disabled:opacity-50" style={{ background: SKYWAVE.blue }}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed text-xs" style={{ borderColor: SKYWAVE.line, color: SKYWAVE.blue }}>
          <Plus className="w-3 h-3" /> Add Task / Reminder
        </button>
      )}
    </div>
  );
}