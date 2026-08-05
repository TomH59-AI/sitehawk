import { useState } from "react";
import { Send } from "lucide-react";
import PostcardMailerModal from "@/components/scip/postcard/PostcardMailerModal";

export default function PostcardCampaignLauncher({ records, onRefresh }) {
  const [recordId, setRecordId] = useState(records[0]?.id || "");
  const [open, setOpen] = useState(false);
  const record = records.find((item) => item.id === recordId);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Create a Postcard Order</p><h2 className="font-heading text-xl font-bold text-foreground">Choose the SCIP targets to mail</h2><p className="mt-1 text-sm text-muted-foreground">Lob verifies each postal address before checkout. Up to 3 postcards are $49; up to 5 are $79.</p></div>
      {records.length ? <div className="flex flex-col gap-3 sm:flex-row">
        <select value={recordId} onChange={(e) => setRecordId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground">
          {records.map((item) => <option key={item.id} value={item.id}>{item.site_name || "Unnamed SCIP"}</option>)}
        </select>
        <button onClick={() => setOpen(true)} disabled={!record} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="h-4 w-4" />Prepare Postcards</button>
      </div> : <div className="rounded-lg border border-dashed border-border bg-muted/40 p-5 text-center text-sm text-muted-foreground">No completed SCIP has targets with owner mailing addresses yet.</div>}
      {open && record && <PostcardMailerModal record={record} onClose={() => { setOpen(false); onRefresh(); }} onSent={onRefresh} />}
    </section>
  );
}