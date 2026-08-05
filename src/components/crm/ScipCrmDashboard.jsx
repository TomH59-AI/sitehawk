import ScipCrmDealCard from "./ScipCrmDealCard";

export default function ScipCrmDashboard({ deals, contacts, onDealUpdate }) {
  if (!deals.length) return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <h2 className="font-heading font-bold text-foreground">No site opportunities yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">Push a Target A, B, or C from Site Search, or create a CRM deal from a SCIP.</p>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {deals.map((deal) => (
        <ScipCrmDealCard
          key={deal.id}
          deal={deal}
          contacts={contacts.filter((contact) => contact.scip_crm_deal_id === deal.id)}
          onUpdate={onDealUpdate}
        />
      ))}
    </div>
  );
}