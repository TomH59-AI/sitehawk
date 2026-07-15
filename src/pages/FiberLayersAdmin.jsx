/**
 * FiberLayersAdmin — admin-only KMZ importer for the ScipHawk Fiber Map.
 * Upload each provider's KMZ; it's parsed server-side into Supabase PostGIS.
 * Zayo imports route to the pre-existing zayo pipeline/table.
 */
import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { fiberProviderRoutes } from "@/functions/fiberProviderRoutes";
import { zayoFiberRoutes } from "@/functions/zayoFiberRoutes";
import { FIBER_PROVIDERS } from "@/components/maps/fiberLayers";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export default function FiberLayersAdmin() {
  const [user, setUser] = useState(null);
  const [counts, setCounts] = useState({});
  const [dbStatus, setDbStatus] = useState("");
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState({});
  const fileRefs = useRef({});

  const loadCounts = () => fiberProviderRoutes({ action: "counts" })
    .then((res) => {
      setDbStatus(res.data?.database_status || "");
      setCounts(Object.fromEntries((res.data?.providers || []).map((p) => [p.provider, p.feature_count])));
    })
    .catch(() => {});

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadCounts();
  }, []);

  async function handleImport(provider) {
    const file = fileRefs.current[provider.id]?.files?.[0];
    if (!file) {
      setResults((r) => ({ ...r, [provider.id]: { error: "Choose a .kmz file first." } }));
      return;
    }
    setBusy(provider.id);
    setResults((r) => ({ ...r, [provider.id]: null }));
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const res = provider.id === "zayo"
        ? await zayoFiberRoutes({ action: "import_kmz", file_url })
        : await fiberProviderRoutes({ action: "import_kmz", provider: provider.id, file_url });
      if (res.data?.error) throw new Error(res.data.error);
      setResults((r) => ({ ...r, [provider.id]: { ok: true, inserted: res.data?.inserted, parsed: res.data?.parsed } }));
      loadCounts();
    } catch (e) {
      setResults((r) => ({ ...r, [provider.id]: { error: e?.response?.data?.error || e.message } }));
    } finally {
      setBusy("");
    }
  }

  if (user && user.role !== "admin") {
    return <div className="p-10 text-center text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">ScipHawk Fiber Layers — KMZ Import</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload each provider's KMZ. Re-importing a provider replaces its previous routes.
        Layers appear in the <Link to="/InfrastructureIntelligence" className="text-primary underline">Infrastructure Command Center</Link> under "ScipHawk fiber (KMZ)".
      </p>
      {dbStatus === "not_initialized" && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-sm text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The fiber database isn't initialized yet — run the provided migration SQL in your Supabase SQL editor first, then refresh this page.</span>
        </div>
      )}
      <div className="mt-6 space-y-3">
        {FIBER_PROVIDERS.map((p) => {
          const result = results[p.id];
          return (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.id === "zayo"
                      ? "Uses the existing Zayo import pipeline"
                      : counts[p.id] != null
                        ? `${Number(counts[p.id]).toLocaleString()} features imported`
                        : "Not imported yet"}
                    {!p.showSplicePoints && " · splice points hidden on map"}
                  </div>
                </div>
                <input
                  type="file"
                  accept=".kmz"
                  ref={(el) => { fileRefs.current[p.id] = el; }}
                  className="max-w-[210px] text-xs"
                />
                <Button size="sm" disabled={busy === p.id} onClick={() => handleImport(p)} className="gap-1.5">
                  {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import
                </Button>
              </div>
              {result?.ok && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Imported {Number(result.inserted || 0).toLocaleString()} of {Number(result.parsed || 0).toLocaleString()} features.
                </div>
              )}
              {result?.error && <div className="mt-2 text-xs text-destructive">{result.error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}