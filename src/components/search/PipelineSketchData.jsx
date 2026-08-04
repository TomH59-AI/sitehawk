function DataRow({ label, value, source }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value || "No data available"}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">Source: {source}</div>
    </div>
  );
}

export default function PipelineSketchData({ zoning = {} }) {
  const registry = zoning.registry || {};
  const source = registry.section_ref
    ? `SiteHawk ordinance library · ${registry.section_ref}`
    : "Section 2 zoning result";

  return (
    <div className="border-t border-border p-4">
      <div className="mb-3">
        <h3 className="font-heading text-sm font-bold text-foreground">Site Constraints Used for Review</h3>
        <p className="text-xs text-muted-foreground">Values are shown exactly as returned by Section 2; missing values are not estimated.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DataRow label="Setback / Separation" value={zoning.setback || zoning.residential_separation} source={source} />
        <DataRow label="Fall Zone" value={zoning.fall_zone} source={source} />
        <DataRow label="Zoning" value={zoning.district || zoning.jurisdiction} source={source} />
        <DataRow label="PE Relief" value={zoning.pe_letter || zoning.pe_self_certification} source={source} />
      </div>
    </div>
  );
}