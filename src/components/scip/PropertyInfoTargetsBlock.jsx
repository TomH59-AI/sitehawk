import { Badge } from "@/components/ui/badge";
import { MapPin, Phone, Home, Ruler, Building2, Mail, Hash, Crosshair, Trophy } from "lucide-react";

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="text-slate-900 break-words">{value || <span className="text-slate-400 italic">—</span>}</div>
      </div>
    </div>
  );
}

function TargetCard({ target }) {
  const isA = target.label === "A";
  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${isA ? "border-amber-400 ring-2 ring-amber-200" : "border-border"}`}>
      <div className={`px-4 py-2.5 flex items-center justify-between ${isA ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white" : "bg-slate-700 text-white"}`}>
        <div className="flex items-center gap-2">
          {isA && <Trophy className="w-4 h-4" />}
          <h3 className="font-heading font-semibold text-sm tracking-wide">
            PARCEL DETAILS — TARGET {target.label}
          </h3>
        </div>
        {typeof target.score === "number" && (
          <Badge variant="outline" className="bg-white/90 text-slate-800 text-[10px] font-mono">
            Score {target.score}
          </Badge>
        )}
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <Row icon={Home} label="Owner's Name" value={target.owner_name} />
        <Row icon={MapPin} label="Parcel Address" value={target.parcel_address} />
        <Row icon={Hash} label="Parcel ID" value={target.parcel_id} />
        <Row icon={Ruler} label="Parcel Size (acres)" value={target.parcel_size_acres ? `${target.parcel_size_acres} ac` : null} />
        <Row icon={Building2} label="Jurisdiction" value={target.jurisdiction} />
        <Row icon={Building2} label="Zoning Classification" value={target.zoning_classification} />
        <Row icon={Mail} label="Owner's Mailing Address" value={target.owner_mailing_address} />
        <Row
          icon={Crosshair}
          label="Coordinates"
          value={
            target.latitude != null && target.longitude != null
              ? `${Number(target.latitude).toFixed(6)}, ${Number(target.longitude).toFixed(6)}`
              : null
          }
        />
        {isA && (
          <div className="md:col-span-2 mt-1 pt-3 border-t border-amber-200">
            <Row
              icon={Phone}
              label="Phone (Enformion skip trace)"
              value={target.phone || <span className="text-slate-400 italic">Not found</span>}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function PropertyInfoTargetsBlock({ data }) {
  if (!data?.targets?.length) return null;
  return (
    <div id="scip-property-info-targets" className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-3 text-sm">
        <Badge className="bg-blue-100 text-blue-800 border-blue-200">PROPERTY INFORMATION</Badge>
        <span className="text-slate-600">
          <strong>{data.targets.length}</strong> targets selected from{" "}
          <strong>{data.non_residential_count}</strong> non-residential parcels (of{" "}
          <strong>{data.total_parcels_pulled}</strong> in 1-mile ring)
        </span>
        <span className="text-slate-500 ml-auto">
          Min lot req: {data.min_acres_required} ac • {data.jurisdiction}
        </span>
      </div>
      {data.targets.map((t) => (
        <TargetCard key={t.label} target={t} />
      ))}
      {data.saved_deal_ids?.length > 0 && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          ✓ Saved {data.saved_deal_ids.length} deal{data.saved_deal_ids.length === 1 ? "" : "s"} to your CRM.
        </div>
      )}
    </div>
  );
}