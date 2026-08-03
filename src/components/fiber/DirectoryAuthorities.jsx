import DirectoryContactCard from "./DirectoryContactCard";

export default function DirectoryAuthorities({ authorities, notice }) {
  if (!authorities) return <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{notice}</p>;
  const safety = [
    ["Police department", authorities.police],
    ["Fire department (non-emergency)", authorities.fire],
    ["911 dispatch (non-emergency)", authorities.dispatch],
  ];
  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-2 font-heading text-base font-bold text-foreground">Local governing jurisdictions</h2>
        {authorities.jurisdictions?.length ? <div className="space-y-2">{authorities.jurisdictions.map((item, index) => <DirectoryContactCard key={`${item.name}-${index}`} item={item} kind={item.department || "Governing authority"} />)}</div> : <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No data available — built-in Gemini found no verifiable official jurisdiction contact.</p>}
      </div>
      <div>
        <h2 className="mb-2 font-heading text-base font-bold text-foreground">Police, fire, and local dispatch</h2>
        <div className="space-y-2">{safety.map(([kind, item]) => item ? <DirectoryContactCard key={kind} item={item} kind={kind} /> : <p key={kind} className="rounded-xl border border-border p-4 text-sm text-muted-foreground">{kind}: No data available — built-in Gemini could not verify an official source.</p>)}</div>
      </div>
    </div>
  );
}