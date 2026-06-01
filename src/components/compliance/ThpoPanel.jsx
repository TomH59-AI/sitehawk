import { Plus, Trash2, Users } from "lucide-react";
import { THPO_STATUS, THPO_RUNNING, HC } from "./complianceConst";
import ShotClockBar from "./ShotClockBar";

// THPO tribal consultation records — one per notified tribe. NACD tribes seed these.
export default function ThpoPanel({ records = [], nacdTribes = [], onChange }) {
  function add() {
    onChange([...records, { tribeName: "", contactEmail: "", notificationDate: "", status: "Not Notified", responseDate: "", notes: "" }]);
  }
  function update(i, patch) { onChange(records.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function remove(i) { onChange(records.filter((_, idx) => idx !== i)); }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: HC.green }} />
          <h3 className="font-heading font-semibold">THPO — Tribal Consultation</h3>
        </div>
        <button onClick={add} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/50" style={{ color: HC.green }}>
          <Plus className="w-3.5 h-3.5" /> Add Tribe
        </button>
      </div>

      {nacdTribes.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg text-xs" style={{ background: "rgba(98,140,131,0.08)" }}>
          <span className="font-medium">NACD-identified tribes for this county:</span> {nacdTribes.join(", ")}
        </div>
      )}

      {!records.length && <p className="text-sm text-muted-foreground">No tribes notified yet. NACD lookup data source pending.</p>}

      <div className="space-y-3">
        {records.map((r, i) => (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="grid sm:grid-cols-3 gap-2">
              <input placeholder="Tribe name" value={r.tribeName || ""} onChange={(e) => update(i, { tribeName: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <input placeholder="Contact email" value={r.contactEmail || ""} onChange={(e) => update(i, { contactEmail: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background" />
              <select value={r.status} onChange={(e) => update(i, { status: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background">
                {THPO_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <label className="text-xs text-muted-foreground flex flex-col mt-2 max-w-[200px]">Notified
              <input type="date" value={r.notificationDate || ""} onChange={(e) => update(i, { notificationDate: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background text-foreground" />
            </label>
            <ShotClockBar startDate={r.notificationDate} running={r.status === THPO_RUNNING} />
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