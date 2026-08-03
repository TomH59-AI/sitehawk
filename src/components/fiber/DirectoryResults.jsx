import DirectoryContactCard from "./DirectoryContactCard";

export default function DirectoryResults({ result }) {
  const place = [result.location?.city, result.location?.county, result.location?.state].filter(Boolean).join(", ");
  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-xl border border-border bg-secondary/50 p-3">
        <h2 className="font-heading text-lg font-bold text-foreground">Results for {result.zip}</h2>
        <p className="text-xs text-muted-foreground">{place || "Location name unavailable"} · Source: {result.location?.source}</p>
      </div>
      <div>
        <h2 className="mb-2 font-heading text-base font-bold text-foreground">Local electric utility</h2>
        {result.utility ? <DirectoryContactCard item={result.utility} kind="Electric utility" /> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{result.notices?.utility}</p>}
      </div>
      <div>
        <h2 className="mb-2 font-heading text-base font-bold text-foreground">Fiber and backhaul contacts</h2>
        {result.fiber?.length ? <div className="space-y-2">{result.fiber.map((item) => <DirectoryContactCard key={item.id} item={item} kind="Fiber operator" />)}</div> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{result.notices?.fiber}</p>}
        {result.fiber?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{result.notices?.fiber}</p>}
      </div>
    </section>
  );
}