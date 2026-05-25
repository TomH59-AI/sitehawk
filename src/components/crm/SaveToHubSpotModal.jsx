/**
 * SaveToHubSpotModal — slide-out form opened from the property comparison
 * panel / individual target cards. Pre-populates the target's data, lets
 * the operator pick a Lease Status + optional follow-up reminder, and
 * fires the hubspotSavePipeline backend.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, Network } from "lucide-react";
import { hubspotSavePipeline } from "@/functions/hubspotSavePipeline";

const LEASE_STATUS_OPTIONS = [
  { value: "prospect",        label: "Prospect" },
  { value: "initial_contact", label: "Initial Contact" },
  { value: "negotiating",     label: "Negotiating" },
  { value: "lease_signed",    label: "Lease Signed" },
  { value: "rejected",        label: "Rejected" },
];

export default function SaveToHubSpotModal({ open, onOpenChange, target, towerHeightFt, onSaved }) {
  const [leaseStatus, setLeaseStatus] = useState("prospect");
  const [followUpDate, setFollowUpDate] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | error

  if (!target) return null;

  const coordStr =
    target.latitude != null && target.longitude != null
      ? `${Number(target.latitude).toFixed(6)}, ${Number(target.longitude).toFixed(6)}`
      : "—";

  async function handleSubmit() {
    setStatus("saving");
    try {
      const res = await hubspotSavePipeline({
        target,
        lease_status: leaseStatus,
        follow_up_date: followUpDate || null,
        tower_height_ft: towerHeightFt || null,
      });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || "HubSpot save failed");
      toast.success("Saved to HubSpot Pipeline", {
        description: `Deal ${data.hubspot_deal_id}${data.hubspot_task_id ? " · follow-up task created" : ""}`,
      });
      onSaved?.(data);
      onOpenChange(false);
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setStatus("error");
      toast.error("HubSpot save failed", { description: err.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-orange-500" />
            Save to HubSpot Pipeline
          </DialogTitle>
          <DialogDescription>
            Target {target.label || ""} — pre-populated from the current site candidate. Update the lease stage and add a follow-up reminder if needed.
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
              <span className="font-medium">{target.parcel_size_acres ? `${target.parcel_size_acres} ac` : "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Assigned Score</span>
              <span className="font-medium">{target.score != null ? target.score : "—"}</span>
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

          {/* Follow-up reminder */}
          <div className="space-y-1.5">
            <Label className="text-sm">Schedule Follow-up Reminder</Label>
            <Input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <div className="text-[11px] text-muted-foreground">
              Leave blank to skip — otherwise a HubSpot Task is created and assigned to you.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === "saving"}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={status === "saving"} className="bg-orange-600 hover:bg-orange-700 text-white">
            {status === "saving" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {status === "error" && <AlertCircle className="w-4 h-4 mr-2" />}
            {status === "idle" && <CheckCircle2 className="w-4 h-4 mr-2" />}
            Save to Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}