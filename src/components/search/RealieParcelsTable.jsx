import { useEffect, useState } from "react";
import { Database, Loader2, Send } from "lucide-react";
import { realieParcelsInRing } from "@/functions/realieParcelsInRing";
import LobMailerModal from "./LobMailerModal";
import { classifyParcel } from "@/lib/zoneClass";

const ZONE_BADGE = {
  RES:   { label: 'RES',  cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  COMM:  { label: 'COMM', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  IND:   { label: 'IND',  cls: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  AG:    { label: 'AG',   cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  OS:    { label: 'OS',   cls: 'bg-teal-500/15 text-teal-700 dark:text-teal-400' },
  OTHER: { label: '—',    cls: 'bg-secondary text-muted-foreground' },
};

function ZoneBadge({ parcel }) {
  const cls = parcel.zone_class || classifyParcel(parcel);
  const { label, cls: style } = ZONE_BADGE[cls] || ZONE_BADGE.OTHER;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${style}`}>
      {label}
    </span>
  );
}

export default function RealieParcelsTable({ centerLat, centerLon, searchId }) {
  const [loading, setLoading] = useState(false);
  const [parcels, setParcels] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [mailerOpen, setMailerOpen] = useState(false);

  useEffect(() => {
    if (centerLat == null || centerLon == null) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await realieParcelsInRing({ lat: centerLat, lon: centerLon, radius_miles: 1.0 });
        if (cancelled) return;
        if (res.data?.error) setError(res.data.error);
        else setParcels(res.data?.parcels || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [centerLat, centerLon]);

  const toggleAll = () => {
    if (!parcels) return;
    if (selected.size === parcels.length) setSelected(new Set());
    else setSelected(new Set(parcels.map((_, i) => i)));
  };

  const toggleOne = (i) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  const recipients = parcels ? Array.from(selected).map((i) => parcels[i]) : [];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-[#0C1B2E] text-white flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <span className="font-heading font-bold text-sm">Parcels within 1-mile ring</span>
          <span className="text-[10px] text-cyan-300">via Realie API</span>
        </div>
        <div className="flex items-center gap-2">
          {parcels && parcels.length > 0 && (
            <>
              <span className="text-xs text-slate-300">{selected.size}/{parcels.length} selected</span>
              <button
                onClick={() => setMailerOpen(true)}
                disabled={selected.size === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:opacity-60 text-white text-xs font-bold transition-all"
              >
                <Send className="w-3.5 h-3.5" /> Send Owner Mailers
              </button>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="p-6 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Fetching parcels from Realie…
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/5 border-t border-red-500/30 text-xs text-red-600">
          Realie error: {error}
        </div>
      )}

      {!loading && parcels && parcels.length === 0 && !error && (
        <div className="p-6 text-center text-sm text-muted-foreground">No parcels returned by Realie for this area.</div>
      )}

      {!loading && parcels && parcels.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50">
              <tr>
                <th className="px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === parcels.length}
                    onChange={toggleAll}
                    className="accent-primary"
                  />
                </th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">APN</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">Owner</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">Mailing Address</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">Acres</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">Zone</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">Land Use</th>
                <th className="px-3 py-2 text-right font-semibold text-foreground">Assessed</th>
                <th className="px-3 py-2 text-left font-semibold text-foreground">Last Sale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {parcels.map((p, i) => (
                <tr key={i} className={`hover:bg-secondary/30 ${selected.has(i) ? "bg-primary/5" : ""}`}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggleOne(i)}
                      className="accent-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{p.apn || "—"}</td>
                  <td className="px-3 py-2 text-foreground font-medium">{p.owner_name || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.mailing_address || "—"}</td>
                  <td className="px-3 py-2 text-foreground">{p.acreage ?? "—"}</td>
                  <td className="px-3 py-2"><ZoneBadge parcel={p} /></td>
                  <td className="px-3 py-2 text-muted-foreground">{p.land_use || "—"}</td>
                  <td className="px-3 py-2 text-right text-foreground">
                    {p.assessed_value != null ? `$${Number(p.assessed_value).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.last_sale_date ? new Date(p.last_sale_date).toLocaleDateString() : "—"}
                    {p.last_sale_price ? ` · $${Number(p.last_sale_price).toLocaleString()}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mailerOpen && (
        <LobMailerModal
          recipients={recipients}
          searchId={searchId}
          onClose={() => setMailerOpen(false)}
        />
      )}
    </div>
  );
}