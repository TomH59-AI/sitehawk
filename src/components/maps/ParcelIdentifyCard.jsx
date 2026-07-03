import { useEffect, useState } from "react";
import { X, Loader2, MapPin, User, Ruler, Hash, Mail } from "lucide-react";
import { parcelFullLookup } from "@/functions/parcelFullLookup";

/**
 * Floating card shown after clicking a parcel on the map.
 * Shows the tile's headline instantly, then enriches with a light
 * owner/APN/acreage lookup at the clicked point.
 */
export default function ParcelIdentifyCard({ lat, lng, headline, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    parcelFullLookup({ lat, lng, enrich_depth: "light" })
      .then((res) => { if (!cancelled) setData(res.data?.parcel || null); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Lookup failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lat, lng]);

  const Row = ({ icon: Icon, label, value }) =>
    value ? (
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <p className="text-[9px] uppercase tracking-wider text-white/40 font-bold">{label}</p>
          <p className="text-[11px] text-white leading-snug break-words">{value}</p>
        </div>
      </div>
    ) : null;

  return (
    <div className="w-64 rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-emerald-600/20 border-b border-emerald-500/30">
        <span className="text-[11px] font-heading font-bold text-emerald-300 tracking-wide">PARCEL</span>
        <button onClick={onClose} className="text-white/50 hover:text-white"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="p-3 space-y-2.5">
        {headline && <p className="text-xs font-semibold text-white leading-snug">{headline}</p>}
        {loading ? (
          <div className="flex items-center gap-2 text-white/50 text-[11px] py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pulling parcel details…
          </div>
        ) : error ? (
          <p className="text-[11px] text-red-400">{error}</p>
        ) : data ? (
          <>
            <Row icon={User} label="Owner" value={data.owner_name} />
            <Row icon={MapPin} label="Address" value={data.parcel_address} />
            <Row icon={Hash} label="APN" value={data.parcel_id} />
            <Row icon={Ruler} label="Acreage" value={data.parcel_size_acres ? `${data.parcel_size_acres} ac` : null} />
            <Row icon={Mail} label="Owner Mailing" value={data.owner_mailing_address} />
            {!data.owner_name && !data.parcel_address && (
              <p className="text-[11px] text-white/40 italic">No parcel record found at this point.</p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-white/40 italic">No parcel record found at this point.</p>
        )}
        <p className="text-[9px] text-white/30 font-mono pt-1 border-t border-white/10">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </p>
      </div>
    </div>
  );
}