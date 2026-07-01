/**
 * PushToTrackerButton — adds/updates this target in the FollowUpTracker
 * when the subscriber selects a Target in Section 3. Also fires when a
 * mailer is sent (pass mailerSent=true to increment mailers_sent).
 */
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function PushToTrackerButton({
  ringName, targetLabel, target, searchRingCenter, mailerSent = false
}) {
  const [status, setStatus] = useState("idle"); // idle | saving | done | error

  async function handlePush() {
    if (!target?.owner_name && !target?.parcel_address) return;
    setStatus("saving");
    try {
      const coords = searchRingCenter
        ? `${Number(searchRingCenter[1]).toFixed(5)}, ${Number(searchRingCenter[0]).toFixed(5)}`
        : target.latitude != null ? `${Number(target.latitude).toFixed(5)}, ${Number(target.longitude).toFixed(5)}` : "";

      // Check if a row already exists for this site (by site_name + apn)
      const existing = await base44.entities.FollowUpTracker.filter({
        site_name: ringName || "Search Ring",
        apn: target.apn || undefined,
      });

      const payload = {
        site_name: ringName || "Search Ring",
        jurisdiction: target.jurisdiction || "",
        search_ring_center: coords,
        contact_name: target.owner_name || "",
        phone: target.owner_phone || target.phone || "",
        email: target.email || "",
        parcel_address: target.parcel_address || "",
        mailing_address: target.mailing_address || "",
        apn: target.apn || "",
        zoning: target.zoning_classification || "",
        fema_zone: target.fema_risk_factor || "",
        acreage: target.acreage != null ? Number(target.acreage) : null,
        latitude: target.latitude != null ? Number(target.latitude) : null,
        longitude: target.longitude != null ? Number(target.longitude) : null,
        status: mailerSent ? "Mailer Sent" : "New Lead",
      };

      if (mailerSent) {
        payload.mailers_sent = (existing?.[0]?.mailers_sent || 0) + 1;
        payload.last_mailer_date = new Date().toISOString().slice(0, 10);
      }

      if (existing?.length) {
        await base44.entities.FollowUpTracker.update(existing[0].id, payload);
        toast.success(`${targetLabel} updated in Follow-Up Tracker.`);
      } else {
        await base44.entities.FollowUpTracker.create(payload);
        toast.success(`${targetLabel} added to Follow-Up Tracker.`);
      }
      setStatus("done");
    } catch (e) {
      console.error(e);
      setStatus("error");
      toast.error("Tracker push failed: " + e.message);
    }
  }

  return (
    <button
      onClick={handlePush}
      disabled={status === "saving"}
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all
        ${status === "done"
          ? "border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300"
          : status === "error"
          ? "border-red-400 text-red-600 bg-red-50"
          : "border-border text-muted-foreground bg-secondary hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50"
        }
        disabled:opacity-60`}
      title="Add this target to the Master Follow-Up Tracker"
    >
      {status === "saving" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : status === "done" ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <ClipboardList className="w-3.5 h-3.5" />
      )}
      {status === "done" ? "In Tracker" : "Add to Tracker"}
    </button>
  );
}