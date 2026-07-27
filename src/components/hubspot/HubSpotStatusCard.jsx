import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import useHubSpotStatus from "@/hooks/useHubSpotStatus";

export default function HubSpotStatusCard() {
  const { status, refresh } = useHubSpotStatus();

  if (status === "loading") return (
    <div className="rounded-2xl border border-border bg-card p-5 flex items-start gap-3">
      <Loader2 className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5 animate-spin" aria-hidden="true" />
      <div><p className="font-heading font-bold text-sm text-foreground">Checking connection</p><p className="text-sm text-muted-foreground mt-0.5">Confirming HubSpot authorization…</p></div>
    </div>
  );

  if (status === "connected") return (
    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 flex items-start gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" aria-hidden="true" />
      <div><p className="font-heading font-bold text-sm text-foreground">Connected &amp; Active</p><p className="text-sm text-muted-foreground mt-0.5">HubSpot authorization was verified successfully.</p></div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1"><p className="font-heading font-bold text-sm text-foreground">{status === "disconnected" ? "Connection needs attention" : "Status check unavailable"}</p><p className="text-sm text-muted-foreground mt-0.5">{status === "disconnected" ? "Ask a workspace administrator to reconnect HubSpot." : "HubSpot may still be connected. Try the check again."}</p><button onClick={() => refresh()} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary"><RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />Check again</button></div>
    </div>
  );
}