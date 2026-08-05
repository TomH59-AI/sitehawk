import { useEffect, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ScipCrmDashboard from "@/components/crm/ScipCrmDashboard";

export default function CRM() {
  const [deals, setDeals] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      base44.entities.ScipCRMDeal.list("-updated_date", 200),
      base44.entities.ScipCRMContact.list("-updated_date", 500),
    ]).then(([nextDeals, nextContacts]) => {
      setDeals(nextDeals);
      setContacts(nextContacts);
    }).finally(() => setLoading(false));
  }, []);
  const updateDeal = (updated) => setDeals((current) => current.map((deal) => deal.id === updated.id ? updated : deal));
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><Briefcase className="h-5 w-5" /></div>
          <div><h1 className="font-heading text-2xl font-bold text-foreground">SiteHawk CRM</h1><p className="text-sm text-muted-foreground">Your private site opportunities, owner contacts, stages, and next actions.</p></div>
        </div>
      </header>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : <ScipCrmDashboard deals={deals} contacts={contacts} onDealUpdate={updateDeal} />}
    </div>
  );
}