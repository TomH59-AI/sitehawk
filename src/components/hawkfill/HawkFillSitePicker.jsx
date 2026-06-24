/**
 * HawkFillSitePicker — search SCIP records, deals, and parcel targets,
 * then expose the selected site as { site_id, site_data } to HawkFill.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, X } from "lucide-react";

function buildSiteData(record, type) {
  if (type === "scip") {
    const t = record.parcel_targets?.[record.active_target_index ?? 0] || record.parcel_targets?.[0] || {};
    return {
      candidate_name: record.site_name || null,
      search_ring_id: record.id || null,
      owner_name: t.owner_name || null,
      owner_mailing_address: t.mailing_address || null,
      parcel_id: t.apn || null,
      site_address: t.parcel_address || null,
      latitude: t.latitude || null,
      longitude: t.longitude || null,
      acreage: t.acreage || null,
      zoning_code: t.zoning_classification || null,
      flood_zone: t.fema_risk_factor || null,
    };
  }
  if (type === "deal") {
    return {
      candidate_name: record.site_name || null,
      search_ring_id: record.scip_record_id || null,
    };
  }
  return {};
}

export default function HawkFillSitePicker({ onSelect, selected }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected) return; // don't re-search after selection
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const [scips, deals] = await Promise.all([
          base44.entities.ScipRecord.filter({ site_name: { $regex: query, $options: "i" } }, "-created_date", 10),
          base44.entities.ScipCRMDeal.filter({ site_name: { $regex: query, $options: "i" } }, "-created_date", 10),
        ]);
        const merged = [
          ...(scips || []).map((r) => ({ ...r, _type: "scip", _label: r.site_name || r.id })),
          ...(deals || []).map((r) => ({ ...r, _type: "deal", _label: r.site_name || r.id })),
        ];
        setResults(merged);
      } catch (e) {
        console.error("HawkFillSitePicker:", e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  const pick = (record) => {
    const site_data = buildSiteData(record, record._type);
    onSelect({ site_id: record.id, site_data, label: record._label });
    setQuery("");
    setResults([]);
  };

  const clear = () => { onSelect(null); setQuery(""); setResults([]); };

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2">
        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">{selected.label}</span>
        <button onClick={clear} className="text-emerald-500 hover:text-emerald-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by site name or ring…"
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {(results.length > 0 || loading) && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
          {loading && <div className="px-4 py-2 text-xs text-muted-foreground">Searching…</div>}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted/60 transition-colors border-b border-border last:border-0"
            >
              <span className="font-medium">{r._label}</span>
              <span className="ml-2 text-[10px] text-muted-foreground uppercase">{r._type === "scip" ? "SCIP" : "Deal"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}