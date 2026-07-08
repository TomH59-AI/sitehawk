// HawkFit Map — compact readout of the loaded Target A property.
export default function SiteTargetSummary({ target }) {
  if (!target) return null;
  const rows = [
    ["Address", target.address],
    ["Parcel ID", target.parcel_id],
    ["Owner", target.owner],
    ["Acreage", target.acreage != null ? `${Number(target.acreage).toFixed(2)} ac` : null],
    ["Zoning", target.zoning],
    ["Jurisdiction", target.jurisdiction],
  ];
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h3 className="font-heading font-semibold text-sm text-foreground">Target A</h3>
      <dl className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-xs">
            <dt className="text-muted-foreground shrink-0">{k}</dt>
            <dd className="text-foreground text-right font-medium truncate">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      {!target.parcel_geometry && (
        <p className="text-[11px] text-amber-600">No parcel boundary geometry returned — status limited to Needs Review.</p>
      )}
    </div>
  );
}