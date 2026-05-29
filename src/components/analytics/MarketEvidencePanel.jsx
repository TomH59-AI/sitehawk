import { Database, RadioTower, Zap, Cable, Activity } from "lucide-react";

function EvidenceRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="w-3.5 h-3.5 text-accent shrink-0" />
        {label}
      </div>
      <span className="text-xs font-mono font-semibold text-foreground text-right">
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function MarketEvidencePanel({ evidence }) {
  if (!evidence) return null;
  const e = evidence;

  const fmtMi = (v) => (v != null ? `${v} mi` : "—");

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-4 h-4 text-accent" />
        <h4 className="font-heading font-semibold text-xs uppercase tracking-wider text-foreground">
          Measured Site Evidence
        </h4>
        <span className="ml-auto text-[10px] text-muted-foreground/70">Hard data feeding the forecast</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <EvidenceRow
          icon={RadioTower}
          label="Nearest FCC tower"
          value={e.nearest_tower_distance_miles != null
            ? `${e.nearest_tower_distance_miles} mi${e.nearest_tower_licensee ? ` · ${e.nearest_tower_licensee}` : ""}`
            : "none nearby"}
        />
        <EvidenceRow icon={RadioTower} label="Tower structure type" value={e.nearest_tower_type} />
        <EvidenceRow icon={Zap} label="Electric utility" value={e.power_utility} />
        <EvidenceRow icon={Cable} label="FCC block GEOID" value={e.fcc_block_geoid} />
        <EvidenceRow icon={Zap} label="Electric assets in radius" value={e.electric_asset_count} />
        <EvidenceRow icon={Cable} label="Fiber assets in radius" value={e.fiber_asset_count} />
        <EvidenceRow icon={Activity} label="Scans in radius (interest)" value={e.nearby_scans_in_radius} />
        <EvidenceRow icon={Activity} label="Total scans logged" value={e.total_scans_logged} />
      </div>
    </div>
  );
}