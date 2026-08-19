import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MailOrdersHero from "@/components/mailorders/MailOrdersHero";
import PostcardCampaignLauncher from "@/components/mailorders/PostcardCampaignLauncher";
import PostcardOrderHistory from "@/components/mailorders/PostcardOrderHistory";
import PostcardTemplatesPanel from "@/components/mailorders/PostcardTemplatesPanel";

export default function MailOrders() {
  const [records, setRecords] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const [scips, history] = await Promise.all([base44.entities.ScipRecord.list("-updated_date", 100), base44.entities.PostcardMailerOrder.list("-created_date", 100)]);
    setRecords(scips.filter((record) => record.parcel_targets?.some((target) => target.owner_name && (target.mailing_address || target.parcel_address))));
    setOrders(history);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="space-y-6"><MailOrdersHero />{loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : <><PostcardCampaignLauncher records={records} onRefresh={load} /><PostcardTemplatesPanel /><PostcardOrderHistory orders={orders} /></>}</div>;
}