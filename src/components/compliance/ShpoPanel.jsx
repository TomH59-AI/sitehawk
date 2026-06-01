import { Plus, Trash2, Landmark } from "lucide-react";
import { SHPO_DET, SHPO_RUNNING, HC } from "./complianceConst";
import ShotClockBar from "./ShotClockBar";

// SHPO state historic review records (multi-SHPO for border sites).
export default function ShpoPanel({ records = [], onChange }) {
  function add() {
    onChange([...records, { state: "", submissionDate: "", determination: "Not Submitted", responseDate: "", notes: "" }]);
  }
  function update(i, patch) { onChange(records.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function remove(i) { onChange(records.filter((_, idx) => idx !== i)); }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4" style={{ color: HC.green }} />
          <h3 className="font-heading font-semibold">SHPO — State Historic Review</h3>
        </div>
        <button onClick={add} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/50" style={{ color: HC.green }}>
          <Plus className="w-3.5 h-3.5" /> Add State
        </button>
      </div>

      {!records.length && <p className="text-sm text-muted-foreground">No SHPO submissions yet.</p>}

      <div className="space-y-3">
        {records.map((r, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <input placeholder="State" value={r.state || ""} onChange={(e) => update(i, { state: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <label className="text-xs text-muted-foreground flex flex-col">Submitted
                <input type="date" value={r.submissionDate || ""} onChange={(e) => update(i, { submissionDate: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground" />
              </label>
              <select value={r.determination} onChange={(e) => update(i, { determination: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background self-end">
                {SHPO_DET.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <ShotClockBar startDate={r.submissionDate} running={r.determination === SHPO_RUNNING} />
            <div className="flex items-center gap-2 mt-2">
              <input placeholder="Notes" value={r.notes || ""} onChange={(e) => update(i, { notes: e.target.value })} className="flex-1 border border-border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <button onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}