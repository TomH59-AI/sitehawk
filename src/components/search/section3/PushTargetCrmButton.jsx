import { useState } from "react";
import { UserPlus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pushTargetToCrm } from "@/functions/pushTargetToCrm";

// Per-target "Push to CRM" button shown under each Target A/B/C column in
// Section 3. Creates a standalone SCIP CRM contact for that owner, tagged with
// the Search Ring name, the Target letter, and the property coordinates.
export default function PushTargetCrmButton({ ringName, targetLabel, targetIndex, target }) {
  const [state, setState] = useState("idle"); // idle | loading | done

  const owner = target?.owner_name?.trim();
  const disabled = !owner || state === "loading" || state === "done";

  const push = async () => {
    if (!owner) { toast.error("No owner name for this target yet."); return; }
    setState("loading");
    try {
      const res = await pushTargetToCrm({
        ring_name: ringName,
        target_label: targetLabel,
        target_index: targetIndex,
        owner_name: owner,
        parcel_address: target?.parcel_address || "",
        mailing_address: target?.mailing_address || "",
        apn: target?.apn || "",
        latitude: target?.latitude ?? null,
        longitude: target?.longitude ?? null,
      });
      const data = res?.data ?? res;
      setState("done");
      toast.success(data?.created === false ? `${targetLabel} already in CRM.` : `${targetLabel} owner added to CRM.`);
    } catch (err) {
      setState("idle");
      toast.error(err?.message || "Failed to push to CRM.");
    }
  };

  return (
    <button
      onClick={push}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 w-full justify-center px-3 py-2 text-xs font-semibold rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 disabled:cursor-default transition-colors dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300"
    >
      {state === "loading" ? (
        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Adding…</>
      ) : state === "done" ? (
        <><Check className="w-3.5 h-3.5" /> In CRM</>
      ) : (
        <><UserPlus className="w-3.5 h-3.5" /> Push to CRM</>
      )}
    </button>
  );
}