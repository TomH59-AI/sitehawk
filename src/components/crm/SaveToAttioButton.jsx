/**
 * SaveToAttioButton — one-click Attio + Apollo CRM sync for a target parcel.
 * Runs ALONGSIDE the HubSpot integration; completely independent of it.
 * Apollo enriches the owner contact server-side before the Attio upsert.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Boxes } from "lucide-react";
import { attioSyncDeal } from "@/functions/attioSyncDeal";

export default function SaveToAttioButton({ target, leaseStatus = "prospect", size = "sm", className = "" }) {
  const [status, setStatus] = useState("idle"); // idle | saving | saved

  if (!target) return null;

  async function handleSync() {
    if (status === "saving") return;
    setStatus("saving");
    try {
      const res = await attioSyncDeal({ target, lease_status: leaseStatus });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || "Attio sync failed");
      setStatus("saved");
      toast.success("Synced to Attio", {
        description: `Person ${data.attio_person_id ? "saved" : "skipped"}${data.apollo_enriched ? " · Apollo enriched" : ""}${data.attio_deals_disabled ? " · details noted on person (Deals object disabled in Attio)" : data.attio_deal_id ? " · deal upserted" : ""}`,
      });
    } catch (err) {
      console.error(err);
      setStatus("idle");
      toast.error("Attio sync failed", { description: err.message });
    }
  }

  return (
    <Button
      onClick={handleSync}
      size={size}
      variant={status === "saved" ? "outline" : "default"}
      disabled={status === "saving"}
      className={`gap-1.5 ${
        status === "saved"
          ? "border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
          : "bg-violet-600 hover:bg-violet-700 text-white border-violet-600"
      } ${className}`}
    >
      {status === "saving" ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Syncing to Attio…</>
      ) : status === "saved" ? (
        <><CheckCircle2 className="w-4 h-4" /> Synced to Attio</>
      ) : (
        <><Boxes className="w-4 h-4" /> Sync to Attio + Apollo</>
      )}
    </Button>
  );
}