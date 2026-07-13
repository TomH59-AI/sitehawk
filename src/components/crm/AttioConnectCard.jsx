/**
 * AttioConnectCard — "Connect Attio CRM" card used in onboarding and settings.
 * Each paying subscriber pastes their own Attio API key; we verify it against
 * the Attio API, then store it on their user record. From then on every
 * qualified site search auto-syncs targets as Deals into THEIR Attio workspace.
 */
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { attioSyncDeal } from "@/functions/attioSyncDeal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";

export default function AttioConnectCard({ compact = false }) {
  const [status, setStatus] = useState("idle"); // idle | connecting | connected
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.me().then((u) => {
      if (u?.attio_api_key) setStatus("connected");
    }).catch(() => {});
  }, []);

  async function handleConnect() {
    if (!apiKey.trim()) { setError("Paste your Attio API key first."); return; }
    setStatus("connecting");
    setError("");
    try {
      const res = await attioSyncDeal({ verify: true, api_key: apiKey.trim() });
      if (!res.data?.ok) throw new Error(res.data?.error || "Verification failed");
      await base44.auth.updateMe({ attio_api_key: apiKey.trim(), attio_sync_enabled: true });
      setStatus("connected");
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not verify that API key.");
      setStatus("idle");
    }
  }

  async function handleDisconnect() {
    await base44.auth.updateMe({ attio_api_key: null, attio_sync_enabled: false }).catch(() => {});
    setStatus("idle");
    setApiKey("");
  }

  if (status === "connected") {
    return (
      <div className={`rounded-2xl border border-emerald-500/40 bg-emerald-500/10 ${compact ? "p-4" : "p-6"} text-left`}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading font-bold text-foreground">Attio Connected! 🎉</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Auto-sync is live. Every qualified site search now pushes your Target A/B/C parcels
              straight into your Attio workspace as Deals — suitability score, zoning, FEMA,
              coords, and Apollo-enriched owner contact attached. Zero manual entry.
            </p>
            <button onClick={handleDisconnect} className="text-xs text-muted-foreground hover:text-destructive underline mt-2">
              Disconnect
            </button>
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
        Paste your Attio API key and every qualified site search automatically syncs to your own
        Attio workspace as ready-to-work Deals — suitability score, zoning, SCIP records, coords.
        Your pipeline stays clean with <strong className="text-foreground">zero manual entry</strong>.
      </p>
      <div className="space-y-2">
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Attio API key (Attio → Workspace Settings → Developers)"
          className="text-sm"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          onClick={handleConnect}
          disabled={status === "connecting"}
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold"
        >
          {status === "connecting"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying your workspace…</>
            : <>Connect Attio (Free with your plan)</>}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 text-center">
        Takes 30 seconds • Key verified & stored securely • Apollo contact enrichment included • Revoke anytime in Attio
      </p>
    </div>
  );
}