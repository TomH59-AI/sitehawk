/**
 * SaveToAttioModal — parallels SaveToHubSpotModal. Pre-populates the target's
 * data, lets the operator pick a Lease Status and choose whether to run Apollo
 * enrichment first (explicit opt-in — enrichment is a per-lookup charge),
 * then fires the attioSyncDeal backend and reports the Attio record IDs.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, Boxes } from "lucide-react";
import { attioSyncDeal } from "@/functions/attioSyncDeal";

const LEASE_STATUS_OPTIONS = [
  { value: "prospect",        label: "Prospect" },
  { value: "initial_contact", label: "Initial Contact" },
  { value: "negotiating",     label: "Negotiating" },
  { value: "lease_signed",    label: "Lease Signed" },
  { value: "rejected",        label: "Rejected" },
];

export default function SaveToAttioModal({ open, onOpenChange, target, onSaved }) {
  const [leaseStatus, setLeaseStatus] = useState("prospect");
  const [runEnrich, setRunEnrich] = useState(true);
  const [status, setStatus] = useState("idle"); // idle | saving | error

  if (!target) return null;

  const coordStr =
    target.latitude != null && target.longitude != null
      ? `${Number(target.latitude).toFixed(6)}, ${Number(target.longitude).toFixed(6)}`
      : "—";

  async function handleSubmit() {
    setStatus("saving");
    try {
      const res = await attioSyncDeal({
        target,
        lease_status: leaseStatus,
        enrich: runEnrich, // Apollo runs server-side ONLY on this explicit save
      });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || "Attio save failed");
      toast.success("Saved to Attio", {
        description: [
          data.attio_person_id && `Person ${data.attio_person_id}`,
          data.attio_deal_id && `Deal ${data.attio_deal_id}`,
          data.attio_deals_disabled && "details noted on person (Deals object disabled in Attio)",
          data.apollo_enriched ? "Apollo enriched ✓" : runEnrich ? "no Apollo match" : null,
        ].filter(Boolean).join(" · "),
      });
      onSaved?.(data);
      onOpenChange(false);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
      toast.error("Attio save failed", { description: err?.response?.data?.error || err.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-violet-500" />
            Save to Attio Pipeline
          </DialogTitle>
          <DialogDescription>
            Target {target.label || ""} — pre-populated from the current site candidate. Pick the lease stage and choose whether to enrich the owner contact first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Pre-populated fields (read-only summary) */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1.5">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Landlord / Owner</span>
              <span className="font-medium text-right">{target.owner_name || "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Parcel Coordinates</span>
              <span className="font-mono text-xs text-right">{coordStr}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Acreage</span>
              <span className="font-medium">{(target.parcel_size_acres || target.acreage) ? `${target.parcel_size_acres || target.acreage} ac` : "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Assigned Score</span>
              <span className="font-medium">{(target.score ?? target.match_score) != null ? (target.score ?? target.match_score) : "—"}</span>
            </div>
          </div>

          {/* Lease status */}
          <div className="space-y-1.5">
            <Label className="text-sm">Lease Status</Label>
            <Select value={leaseStatus} onValueChange={setLeaseStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEASE_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Apollo enrichment opt-in */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="pr-3">
              <Label className="text-sm">Run Apollo enrichment first</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Looks up the owner's email, title, phone and LinkedIn before saving. Uses one Apollo lookup credit.
              </p>
            </div>
            <Switch checked={runEnrich} onCheckedChange={setRunEnrich} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === "saving"}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={status === "saving"} className="bg-violet-600 hover:bg-violet-700 text-white">
            {status === "saving" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {status === "error" && <AlertCircle className="w-4 h-4 mr-2" />}
            {status === "idle" && <CheckCircle2 className="w-4 h-4 mr-2" />}
            Save to Attio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}