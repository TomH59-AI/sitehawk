import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TRACKER_GREEN } from "@/lib/hawkTracker";

// New-site form. On submit the parent creates the site + its 19 milestone rows.
export default function TrackerSiteForm({ onSubmit, onCancel, saving }) {
  const [f, setF] = useState({
    site_name: "", carrier_site_number: "", carrier: "", market: "",
    state: "", jurisdiction: "", target_on_air: "", notes: "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (f.site_name.trim()) onSubmit(f); }}
      className="rounded-xl border border-border bg-card p-4 space-y-3"
    >
      <div className="font-heading font-bold text-sm" style={{ color: TRACKER_GREEN }}>New Tracker Site</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="Site name *" value={f.site_name} onChange={set("site_name")} required />
        <Input placeholder="Carrier site number" value={f.carrier_site_number} onChange={set("carrier_site_number")} />
        <Input placeholder="Carrier (Verizon, AT&T…)" value={f.carrier} onChange={set("carrier")} />
        <Input placeholder="Market" value={f.market} onChange={set("market")} />
        <Input placeholder="State (e.g. FL)" value={f.state} onChange={set("state")} maxLength={2} />
        <Input placeholder="Jurisdiction" value={f.jurisdiction} onChange={set("jurisdiction")} />
        <div>
          <label className="text-xs text-muted-foreground">Target on-air date</label>
          <Input type="date" value={f.target_on_air} onChange={set("target_on_air")} />
        </div>
      </div>
      <Textarea placeholder="Site notes" value={f.notes} onChange={set("notes")} className="h-16" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving} style={{ background: TRACKER_GREEN }}>
          {saving ? "Creating…" : "Create Site"}
        </Button>
      </div>
    </form>
  );
}