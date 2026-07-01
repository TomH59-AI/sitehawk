/**
 * RegridDemographics — small "Area Demographics" badges below a target table.
 * Shows median household income + population density per enriched target.
 */
export default function RegridDemographics({ enrich = [], cols = [] }) {
  const items = enrich
    .map((e, i) => ({ e, label: cols[i] || `Target ${i + 1}` }))
    .filter(
      ({ e }) =>
        e?.demographics &&
        (e.demographics.median_household_income != null ||
          e.demographics.population_density != null)
    );
  if (!items.length) return null;
  return (
    <div className="px-4 py-2 flex flex-wrap gap-2">
      {items.map(({ e, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-sky-300/60 bg-sky-50 dark:bg-sky-950/20 text-sky-800 dark:text-sky-200"
        >
          <span className="font-bold">Area Demographics · {label}</span>
          {e.demographics.median_household_income != null && (
            <span>Median HH Income ${Number(e.demographics.median_household_income).toLocaleString()}</span>
          )}
          {e.demographics.median_household_income != null &&
            e.demographics.population_density != null && <span>·</span>}
          {e.demographics.population_density != null && (
            <span>{Number(e.demographics.population_density).toLocaleString()}/sq mi</span>
          )}
        </span>
      ))}
    </div>
  );
}