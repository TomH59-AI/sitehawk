import DirectoryContactCard from "./DirectoryContactCard";

export default function DirectoryAuthorities({ authorities, notice }) {
  if (!authorities) return <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{notice}</p>;
  const safety = [
    ["Police department", authorities.police],
    ["Fire department (non-emergency)", authorities.fire],
    ["911 dispatch (non-emergency)", authorities.dispatch],
  ];
  return (
    <div className="space-y-8">
      <section id="jurisdictions" className="scroll-mt-24">
        <div className="mb-3 flex items-center gap-3">
          <span className="font-heading text-sm font-bold text-primary">01</span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Authority chapter</p><h2 className="font-heading text-xl font-bold text-foreground">Local governing jurisdictions</h2></div>
        </div>
        {authorities.jurisdictions?.length ? <div className="space-y-3">{authorities.jurisdictions.map((item, index) => <DirectoryContactCard key={`${item.name}-${index}`} item={item} kind={item.department || "Governing authority"} />)}</div> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No data available — built-in Gemini found no verifiable official jurisdiction contact.</p>}
      </section>
      <section id="public-safety" className="scroll-mt-24">
        <div className="mb-3 flex items-center gap-3">
          <span className="font-heading text-sm font-bold text-primary">02</span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Response chapter</p><h2 className="font-heading text-xl font-bold text-foreground">Police, fire, and local dispatch</h2></div>
        </div>
        <div className="space-y-3">{safety.map(([kind, item]) => item ? <DirectoryContactCard key={kind} item={item} kind={kind} /> : <p key={kind} className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{kind}: No data available — built-in Gemini could not verify an official source.</p>)}</div>
      </section>
    </div>
  );
}