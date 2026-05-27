import { useState } from "react";
import { Zap, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { apifyRunRealieTowerSiteSearch } from "@/functions/apifyRunRealieTowerSiteSearch";

// --- Raw result drawer (per item) ---
function RawDrawer({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Raw result
      </button>
      {open && (
        <div className="px-3 pb-3">
          <pre className="text-[10px] bg-muted/60 rounded-lg p-3 overflow-x-auto text-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(item, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// --- Single result card — mirrors existing Realie card columns ---
function LOSItemCard({ item }) {
  // Map only fields that exist by same name on both schemas
  const apn        = item.apn        || item.parcel_id   || "—";
  const owner      = item.owner_name || item.owner       || "—";
  const address    = item.parcel_address || item.address || "—";
  const acreage    = item.acreage    != null ? item.acreage : "—";
  const landUse    = item.land_use   || "—";
  const assessed   = item.assessed_value != null
    ? `$${Number(item.assessed_value).toLocaleString()}`
    : "—";
  const lastSale   = item.last_sale_date
    ? new Date(item.last_sale_date).toLocaleDateString() +
      (item.last_sale_price ? ` · $${Number(item.last_sale_price).toLocaleString()}` : "")
    : "—";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-foreground">APN</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Owner</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Address</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Acres</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Land Use</th>
              <th className="px-3 py-2 text-right font-semibold text-foreground">Assessed</th>
              <th className="px-3 py-2 text-left font-semibold text-foreground">Last Sale</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-background">
              <td className="px-3 py-2 font-mono text-foreground">{apn}</td>
              <td className="px-3 py-2 text-foreground font-medium">{owner}</td>
              <td className="px-3 py-2 text-muted-foreground">{address}</td>
              <td className="px-3 py-2 text-foreground">{acreage}</td>
              <td className="px-3 py-2 text-muted-foreground">{landUse}</td>
              <td className="px-3 py-2 text-right text-foreground">{assessed}</td>
              <td className="px-3 py-2 text-muted-foreground">{lastSale}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <RawDrawer item={item} />
    </div>
  );
}

// --- Advanced RF options (collapsed by default) ---
function AdvancedRFOptions({ opts, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left bg-muted/30"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Advanced RF options
      </button>
      {open && (
        <div className="px-3 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 bg-background">
          {[
            { key: "frequencyMHz",   label: "frequencyMHz",   placeholder: "700" },
            { key: "losThresholdDbm",label: "losThresholdDbm",placeholder: "-100" },
            { key: "rxHeightM",      label: "rxHeightM",      placeholder: "2" },
            { key: "txHeightM",      label: "txHeightM",      placeholder: "60.7" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground font-mono">{label}</label>
              <input
                type="number"
                placeholder={placeholder}
                value={opts[key] ?? ""}
                onChange={(e) => onChange({ ...opts, [key]: e.target.value === "" ? undefined : e.target.value })}
                className="h-8 px-2 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
          <div className="flex items-center gap-2 col-span-2 md:col-span-4 mt-1">
            <input
              type="checkbox"
              id="pgd"
              checked={opts.pathGatesDeliverable ?? false}
              onChange={(e) => onChange({ ...opts, pathGatesDeliverable: e.target.checked || undefined })}
              className="accent-primary"
            />
            <label htmlFor="pgd" className="text-xs text-foreground font-mono">pathGatesDeliverable</label>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main component ---
export default function ApifyLOSSearch({ centerLat, centerLon }) {
  const [rfOpts, setRfOpts]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [items, setItems]       = useState(null);
  const [error, setError]       = useState(null);

  const handleRun = async () => {
    if (centerLat == null || centerLon == null) return;
    setLoading(true);
    setError(null);
    setItems(null);

    // Only include RF fields the user actually set
    const payload = { latitude: centerLat, longitude: centerLon };
    if (rfOpts.frequencyMHz    !== undefined && rfOpts.frequencyMHz    !== "")
      payload.frequencyMHz    = rfOpts.frequencyMHz;
    if (rfOpts.losThresholdDbm !== undefined && rfOpts.losThresholdDbm !== "")
      payload.losThresholdDbm = rfOpts.losThresholdDbm;
    if (rfOpts.rxHeightM       !== undefined && rfOpts.rxHeightM       !== "")
      payload.rxHeightM       = rfOpts.rxHeightM;
    if (rfOpts.txHeightM       !== undefined && rfOpts.txHeightM       !== "")
      payload.txHeightM       = rfOpts.txHeightM;
    if (rfOpts.pathGatesDeliverable)
      payload.pathGatesDeliverable = true;

    try {
      const res = await apifyRunRealieTowerSiteSearch(payload);
      if (res.data?.error) {
        setError(res.data.error);
      } else {
        setItems(res.data?.items || []);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-[#0C1B2E] text-white flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" />
          <span className="font-heading font-bold text-sm">LOS Site Analysis</span>
          <span className="text-[10px] text-cyan-300">via Apify · Realie + CloudRF</span>
        </div>
        <button
          onClick={handleRun}
          disabled={loading || centerLat == null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:bg-slate-600 disabled:opacity-60 text-slate-900 text-xs font-bold transition-all"
        >
          {loading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
            : <><Zap className="w-3.5 h-3.5" /> Run with LOS analysis (Apify)</>
          }
        </button>
      </div>

      {/* Advanced RF options */}
      <div className="px-4 py-3 border-b border-border">
        <AdvancedRFOptions opts={rfOpts} onChange={setRfOpts} />
      </div>

      {/* States */}
      {loading && (
        <div className="p-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Running LOS analysis via Apify — this may take 30–60 s…
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/5 border-t border-red-500/30 text-xs text-red-600">
          Apify error: {error}
        </div>
      )}

      {!loading && items && items.length === 0 && !error && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No items returned by Apify for this location.
        </div>
      )}

      {!loading && items && items.length > 0 && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">{items.length} result{items.length !== 1 ? "s" : ""} returned</p>
          {items.map((item, i) => (
            <LOSItemCard key={i} item={item} />
          ))}
        </div>
      )}

      {/* Prompt before first run */}
      {!loading && items === null && !error && (
        <div className="p-6 text-center text-sm text-muted-foreground">
          Click <span className="font-semibold text-yellow-600">Run with LOS analysis (Apify)</span> to fetch parcels with line-of-sight RF scoring.
        </div>
      )}
    </div>
  );
}