import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { scipCrmEnsureDeal } from "@/functions/scipCrmEnsureDeal";
import { Briefcase, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { SKYWAVE } from "@/lib/skywave";
import { SCIP_STAGES, SCIP_STAGE_LABEL } from "@/lib/scipCrm";
import ScipCrmContacts from "./ScipCrmContacts";
import ScipCrmMailer from "./ScipCrmMailer";
import ScipCrmTasks from "./ScipCrmTasks";

// SCIP-centric CRM workspace for one ScipRecord. Sits inside ScipDetail.
// Separate layer from the legacy SearchResult CRM.
export default function ScipCrmPanel({ record }) {
  const [deal, setDeal] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!record?.id) return;
    base44.entities.ScipCRMDeal.filter({ scip_record_id: record.id })
      .then(async (deals) => {
        if (deals[0]) await hydrate(deals[0]);
      })
      .finally(() => setLoading(false));
  }, [record?.id]);

  async function hydrate(d) {
    setDeal(d);
    const [c, t] = await Promise.all([
      base44.entities.ScipCRMContact.filter({ scip_crm_deal_id: d.id }),
      base44.entities.ScipCRMTask.filter({ scip_crm_deal_id: d.id }, "-created_date", 100),
    ]);
    setContacts(c.sort((a, b) => (a.target_index || 0) - (b.target_index || 0)));
    setTasks(t);
  }

  async function createDeal() {
    setBusy(true);
    try {
      const res = await scipCrmEnsureDeal({ scip_record_id: record.id });
      if (res.data?.deal) {
        setDeal(res.data.deal);
        setContacts(res.data.contacts || []);
        setTasks([]);
        toast.success(res.data.created ? "SCIP CRM deal created" : "Opened existing CRM deal");
      } else throw new Error("no deal");
    } catch {
      toast.error("Failed to create CRM deal");
    } finally {
      setBusy(false);
    }
  }

  async function changeStage(next) {
    const prev = deal.stage;
    const updated = await base44.entities.ScipCRMDeal.update(deal.id, { stage: next });
    setDeal(updated);
    await base44.entities.ScipCRMActivity.create({
      scip_crm_deal_id: deal.id, scip_record_id: record.id,
      type: "stage_change",
      summary: `Stage: ${SCIP_STAGE_LABEL[prev] || prev} → ${SCIP_STAGE_LABEL[next] || next}`,
      meta: { from: prev, to: next },
    });
  }

  async function saveNextAction(patch) {
    const updated = await base44.entities.ScipCRMDeal.update(deal.id, patch);
    setDeal(updated);
  }

  function refreshTasks() {
    base44.entities.ScipCRMTask.filter({ scip_crm_deal_id: deal.id }, "-created_date", 100).then(setTasks);
  }

  return (
    <div className="bg-white rounded-lg border p-5 no-print" style={{ borderColor: SKYWAVE.line }}>
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="w-5 h-5" style={{ color: SKYWAVE.blue }} />
        <h3 className="font-bold text-lg" style={{ color: SKYWAVE.navy }}>SCIP CRM</h3>
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: SKYWAVE.blue }} /></div>
      ) : !deal ? (
        <div className="text-center py-4">
          <p className="text-sm mb-3" style={{ color: SKYWAVE.muted }}>
            Track this site through the acquisition pipeline — landlords, mailers, tasks, and next actions.
          </p>
          <button onClick={createDeal} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ background: SKYWAVE.blue }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create CRM Deal
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Stage */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: SKYWAVE.muted }}>Stage</label>
            <select value={deal.stage} onChange={(e) => changeStage(e.target.value)}
              className="mt-1 w-full text-sm rounded-md border px-2 py-2 bg-white" style={{ borderColor: SKYWAVE.line, color: SKYWAVE.navy }}>
              {SCIP_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {/* Next action */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: SKYWAVE.muted }}>Next Action</label>
              <input defaultValue={deal.next_action || ""} onBlur={(e) => saveNextAction({ next_action: e.target.value })}
                placeholder="e.g. Call Target A owner"
                className="mt-1 w-full text-sm rounded-md border px-2 py-2" style={{ borderColor: SKYWAVE.line }} />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: SKYWAVE.muted }}>Due</label>
              <input type="date" defaultValue={deal.next_action_due_date || ""} onBlur={(e) => saveNextAction({ next_action_due_date: e.target.value || undefined })}
                className="mt-1 w-full text-sm rounded-md border px-2 py-2" style={{ borderColor: SKYWAVE.line }} />
            </div>
          </div>

          {/* Contacts */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: SKYWAVE.muted }}>Landlords / Owners</p>
            <ScipCrmContacts contacts={contacts} onUpdate={(u) => setContacts((cs) => cs.map((c) => c.id === u.id ? u : c))} />
          </div>

          {/* Postcard mailer — subscription-included, Target A–E */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: SKYWAVE.muted }}>Direct Mail</p>
            <ScipCrmMailer contacts={contacts} />
          </div>

          {/* Tasks */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: SKYWAVE.muted }}>Tasks &amp; Reminders</p>
            <ScipCrmTasks deal={deal} tasks={tasks} onChange={refreshTasks} />
          </div>
        </div>
      )}
    </div>
  );
}