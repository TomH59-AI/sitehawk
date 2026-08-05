import { Link } from "react-router-dom";
import { Calendar, MapPin, Users } from "lucide-react";
import { SCIP_STAGES, SCIP_STAGE_LABEL } from "@/lib/scipCrm";
import { base44 } from "@/api/base44Client";

export default function ScipCrmDealCard({ deal, contacts, onUpdate }) {
  const save = async (patch) => onUpdate(await base44.entities.ScipCRMDeal.update(deal.id, patch));
  const isHolding = deal.scip_record_id?.startsWith("search-ring-leads:");
  return (
    <article className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading font-bold text-foreground">{deal.site_name || "Site Opportunity"}</h2>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" />{deal.jurisdiction || "Jurisdiction not recorded"}</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{SCIP_STAGE_LABEL[deal.stage] || deal.stage}</span>
      </div>
      <select value={deal.stage} onChange={(e) => save({ stage: e.target.value })} className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
        {SCIP_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
      </select>
      <div className="grid gap-2 sm:grid-cols-3">
        <input defaultValue={deal.next_action || ""} onBlur={(e) => save({ next_action: e.target.value })} placeholder="Next action" className="sm:col-span-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm" />
        <input type="date" defaultValue={deal.next_action_due_date || ""} onBlur={(e) => save({ next_action_due_date: e.target.value || undefined })} className="rounded-md border border-border bg-secondary px-3 py-2 text-sm" />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{contacts.length} owner contact{contacts.length === 1 ? "" : "s"}</span>
        {deal.next_action_due_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Due {deal.next_action_due_date}</span>}
        {!isHolding && <Link to={`/scip/${deal.scip_record_id}`} className="font-semibold text-primary hover:underline">Open SCIP</Link>}
      </div>
      {contacts.length > 0 && <p className="text-xs text-muted-foreground truncate">{contacts.map((c) => c.owner_name).filter(Boolean).join(" · ")}</p>}
    </article>
  );
}