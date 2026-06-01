import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Save, Loader2, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import TriggersPanel from "./TriggersPanel";
import ShpoPanel from "./ShpoPanel";
import ThpoPanel from "./ThpoPanel";
import AuditTimeline from "./AuditTimeline";
import { computeDetermination, DISCLAIMER, HC } from "./complianceConst";

// Full site-level regulatory cockpit. `record` is a ComplianceCheck row, `userEmail` for audit.
export default function SiteDashboard({ record, userEmail, onBack }) {
  const [state, setState] = useState(record);
  const [saving, setSaving] = useState(false);
  const [pendingLog, setPendingLog] = useState([]);

  const determination = useMemo(
    () => computeDetermination(state.nepaTriggerFlags, state.groundDisturbanceArea, state.projectType),
    [state.nepaTriggerFlags, state.groundDisturbanceArea, state.projectType]
  );

  function logEntry(action, field, oldValue, newValue) {
    setPendingLog((p) => [...p, { timestamp: new Date().toISOString(), user: userEmail, action, field, oldValue: String(oldValue ?? ""), newValue: String(newValue ?? "") }]);
  }

  function toggleFlag(key) {
    setState((s) => {
      const cur = !!s.nepaTriggerFlags?.[key];
      logEntry("field_edit", `trigger.${key}`, cur, !cur);
      return { ...s, nepaTriggerFlags: { ...s.nepaTriggerFlags, [key]: !cur } };
    });
  }

  function setField(field, value) {
    setState((s) => { logEntry("field_edit", field, s[field], value); return { ...s, [field]: value }; });
  }

  function setShpo(records) { setState((s) => ({ ...s, shpoRecords: records })); logEntry("status_change", "shpoRecords", "", "updated"); }
  function setThpo(records) { setState((s) => ({ ...s, thpoRecords: records })); logEntry("status_change", "thpoRecords", "", "updated"); }

  async function save() {
    setSaving(true);
    try {
      const auditLog = [...(state.auditLog || []), ...pendingLog];
      const payload = { ...state, nepaDetermination: determination, auditLog };
      delete payload.id; delete payload.created_date; delete payload.updated_date; delete payload.created_by_id; delete payload.created_by;
      await base44.entities.ComplianceCheck.update(record.id, payload);
      setState((s) => ({ ...s, nepaDetermination: determination, auditLog }));
      setPendingLog([]);
      toast.success("Compliance record saved.");
    } catch (e) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="w-4 h-4" /> Hawk Compliance
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: HC.green }} />
            <h1 className="text-2xl font-heading font-bold">{state.siteName}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Hawk Compliance &gt; {state.siteName} · Owner: {state.ownerName}</p>
        </div>
        <Button onClick={save} disabled={saving} className="text-white" style={{ background: HC.green }}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      </div>

      <div className="flex gap-2 p-3 rounded-lg text-xs" style={{ border: `1.5px solid ${HC.amber}`, background: "rgba(255,184,0,0.08)" }}>
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: HC.amber }} />
        <span>{DISCLAIMER}</span>
      </div>

      <TriggersPanel
        flags={state.nepaTriggerFlags || {}}
        determination={determination}
        onToggle={toggleFlag}
        disturbanceArea={state.groundDisturbanceArea}
        disturbanceDepth={state.groundDisturbanceDepth}
        projectType={state.projectType || "new_tower"}
        onField={setField}
      />

      <div className="grid lg:grid-cols-2 gap-5">
        <ShpoPanel records={state.shpoRecords || []} onChange={setShpo} />
        <ThpoPanel records={state.thpoRecords || []} nacdTribes={state.nacdTribesIdentified || []} onChange={setThpo} />
      </div>

      <AuditTimeline log={[...(state.auditLog || []), ...pendingLog]} />
    </div>
  );
}