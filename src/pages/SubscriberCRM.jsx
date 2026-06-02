import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, ShieldAlert, Users, Megaphone } from "lucide-react";
import SubscriberStats from "../components/subscribercrm/SubscriberStats";
import SubscriberList from "../components/subscribercrm/SubscriberList";
import SubscriberDetail from "../components/subscribercrm/SubscriberDetail";
import CampaignsPanel from "../components/subscribercrm/CampaignsPanel";

// ADMIN-ONLY internal SiteHawk subscriber CRM. Subscribers never see this page
// (RLS + the role guard below). Separate from the deal pipeline / ScipCRM.
export default function SubscriberCRM() {
  const [allowed, setAllowed] = useState(null);
  const [tab, setTab] = useState("subscribers");
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    base44.auth.me().then((u) => setAllowed(u?.role === "admin")).catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (!allowed) return;
    Promise.all([
      base44.entities.SubscriberCRMContact.list("-created_date", 500),
      base44.entities.SubscriberCRMTask.filter({ status: "open" }, "-created_date", 500),
    ]).then(([c, t]) => { setContacts(c); setTasks(t); }).finally(() => setLoading(false));
  }, [allowed]);

  function updateContact(u) {
    setContacts((cur) => cur.map((c) => c.id === u.id ? { ...c, ...u } : c));
    setSelected((s) => s && s.id === u.id ? { ...s, ...u } : s);
  }

  if (allowed === null) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!allowed) return (
    <div className="max-w-md mx-auto text-center py-20">
      <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <h1 className="font-heading font-bold text-xl text-foreground">Admins only</h1>
      <p className="text-sm text-muted-foreground mt-1">The Subscriber CRM is restricted to SiteHawk admins.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading font-bold text-2xl text-foreground">Subscriber CRM</h1>
        <p className="text-sm text-muted-foreground">Internal customer-success workspace — track health, follow-ups, segments, and campaigns.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[{ k: "subscribers", l: "Subscribers", i: Users }, { k: "campaigns", l: "Campaigns", i: Megaphone }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium ${tab === t.k ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
            <t.i className="w-4 h-4" /> {t.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : tab === "subscribers" ? (
        <>
          <SubscriberStats contacts={contacts} tasks={tasks} />
          <SubscriberList contacts={contacts} segment={segment} setSegment={setSegment} search={search} setSearch={setSearch} onSelect={setSelected} />
        </>
      ) : (
        <CampaignsPanel />
      )}

      <SubscriberDetail contact={selected} open={!!selected} onClose={() => setSelected(null)} onChange={updateContact} />
    </div>
  );
}