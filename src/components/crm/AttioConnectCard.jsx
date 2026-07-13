/**
 * AttioConnectCard — "Connect Attio CRM" value card used in onboarding and
 * settings. Attio sync is already wired app-side (attioSyncDeal); this card
 * makes the value obvious and flips the user's attio_sync_enabled flag so we
 * know they've activated it.
 */
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";

export default function AttioConnectCard({ compact = false }) {
  const [status, setStatus] = useState("idle"); // idle | connecting | connected

  useEffect(() => {
    base44.auth.me().then((u) => {
      if (u?.attio_sync_enabled) setStatus("connected");
    }).catch(() => {});
  }, []);

  async function handleConnect() {
    setStatus("connecting");
    try {
      await base44.auth.updateMe({ attio_sync_enabled: true });
      setStatus("connected");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "connected") {
    return (
      <div className={`rounded-2xl border border-emerald-500/40 bg-emerald-500/10 ${compact ? "p-4" : "p-6"} text-left`}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading font-bold text-foreground">Connected! 🎉</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Your next SiteHawk search will have a one-click "Sync to Attio" button. All the rich
              data — suitability score, zoning, SCIP records, coords — travels with it. You're now
              running the full modern site acquisition stack.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-border bg-card ${compact ? "p-4" : "p-6"} text-left`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center text-white shrink-0">
          <Link2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-heading font-bold text-foreground leading-tight">Connect Attio CRM</h3>
          <p className="text-emerald-600 text-xs font-semibold">✓ Already included in your plan — no extra cost</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        Stop copying data into spreadsheets. Every great parcel you find in SiteHawk syncs
        automatically to your Attio workspace with full context attached — suitability score,
        zoning, SCIP records, coords. Your pipeline stays clean, follow-ups are automatic, and you
        close more deals with less admin. <strong className="text-foreground">Takes 30 seconds.</strong>
      </p>
      <Button
        onClick={handleConnect}
        disabled={status === "connecting"}
        className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
      >
        {status === "connecting"
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Activating…</>
          : <>Connect Attio (Free with your plan)</>}
      </Button>
      <p className="text-[11px] text-muted-foreground mt-3 text-center">Takes 30 seconds • Secure • Apollo contact enrichment included</p>
    </div>
  );
}