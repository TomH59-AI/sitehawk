import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, Network } from "lucide-react";
import { hubspotSyncDeal } from "@/functions/hubspotSyncDeal";

/**
 * Pushes the current SCIP candidate (landowner contact + parcel) into HubSpot
 * as a Contact + Deal. Tagged with the subscriber's email for segmentation
 * inside the shared SiteHawk HubSpot portal.
 */
export default function PushToHubSpotButton({ candidate, agent }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [message, setMessage] = useState("");

  async function handlePush() {
    if (!candidate) return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await hubspotSyncDeal({ candidate, agent, source: "scip" });
      const data = res?.data || res;
      if (data?.ok) {
        setStatus("success");
        setMessage(`Synced — HS deal ${data.hubspot_deal_id}`);
      } else {
        setStatus("error");
        setMessage(data?.error || "Sync failed");
      }
    } catch (e) {
      setStatus("error");
      setMessage(e.message || "Sync failed");
    }
    setTimeout(() => setStatus("idle"), 4000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handlePush} disabled={status === "loading"} variant="outline" size="sm" className="gap-1.5">
        {status === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {status === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
        {status === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
        {status === "idle" && <Network className="w-3.5 h-3.5" />}
        Push to HubSpot
      </Button>
      {message && (
        <span className={`text-[10px] font-mono ${status === "success" ? "text-emerald-600" : "text-red-600"}`}>
          {message}
        </span>
      )}
    </div>
  );
}