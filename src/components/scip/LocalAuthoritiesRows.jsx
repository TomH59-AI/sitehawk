import { Input } from "@/components/ui/input";

const NA = "Not available — verify";

const Cell = ({ value, editing, onChange, mono }) =>
  editing ? (
    <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-7 text-xs" />
  ) : value ? (
    <span className={mono ? "font-mono" : undefined}>{value}</span>
  ) : (
    <span className="italic text-muted-foreground">{NA}</span>
  );

// Presentation rows for the Local Governing Authorities table.
// Columns: Category | Name | Address | Phone — then County / State / Census.
export default function LocalAuthoritiesRows({ data, editing, draft, setDraft }) {
  const src = editing ? draft : {
    police: data.police || {},
    fire: data.fire || {},
    dispatchName: data.dispatchName,
    nonEmergency911: data.nonEmergency911,
    census: data.census || {},
  };
  const set = (path, value) =>
    setDraft((prev) => {
      const next = { ...prev };
      if (path.length === 1) next[path[0]] = value;
      else next[path[0]] = { ...next[path[0]], [path[1]]: value };
      return next;
    });

  const rows = [
    { label: "Police Department", name: ["police", "name"], address: ["police", "address"], phone: ["police", "phone"] },
    { label: "Fire Department (Non-Emergency)", name: ["fire", "name"], address: ["fire", "address"], phone: ["fire", "phone"] },
    { label: "911 Non-Emergency", name: ["dispatchName"], address: null, phone: ["nonEmergency911"] },
  ];
  const get = (path) => (path ? (path.length === 1 ? src[path[0]] : src[path[0]]?.[path[1]]) : null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs md:text-sm text-foreground border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
        <thead>
          <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/50">
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Address</th>
            <th className="px-4 py-2">Phone</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={`border-b border-border ${i % 2 ? "bg-muted/30" : "bg-card"}`}>
              <td className="px-4 py-2.5 font-semibold whitespace-nowrap">{r.label}</td>
              <td className="px-4 py-2.5"><Cell value={get(r.name)} editing={editing} onChange={(v) => set(r.name, v)} /></td>
              <td className="px-4 py-2.5">{r.address ? <Cell value={get(r.address)} editing={editing} onChange={(v) => set(r.address, v)} /> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                {editing ? (
                  <Cell value={get(r.phone)} editing onChange={(v) => set(r.phone, v)} />
                ) : get(r.phone) ? (
                  <a href={`tel:${get(r.phone)}`} className="font-semibold text-primary hover:underline">{get(r.phone)}</a>
                ) : (
                  <span className="italic text-muted-foreground">{NA}</span>
                )}
              </td>
            </tr>
          ))}
          <tr className="border-b border-border bg-muted/30">
            <td className="px-4 py-2.5 font-semibold">County</td>
            <td className="px-4 py-2.5" colSpan={3}>{data.county ? `${data.county.charAt(0)}${data.county.slice(1).toLowerCase()} County` : <span className="italic text-muted-foreground">{NA}</span>}</td>
          </tr>
          <tr className="border-b border-border bg-card">
            <td className="px-4 py-2.5 font-semibold">State</td>
            <td className="px-4 py-2.5 font-mono" colSpan={3}>{data.state || <span className="italic text-muted-foreground">{NA}</span>}</td>
          </tr>
          <tr className="bg-muted/30">
            <td className="px-4 py-2.5 font-semibold align-top">Census / Area Profile</td>
            <td className="px-4 py-2.5" colSpan={3}>
              {editing ? (
                <div className="space-y-1.5">
                  <Input value={src.census.population ?? ""} onChange={(e) => set(["census", "population"], e.target.value)} placeholder="Population" className="h-7 text-xs w-40" />
                  <Input value={src.census.summary || ""} onChange={(e) => set(["census", "summary"], e.target.value)} placeholder="Brief 1–2 sentence overview" className="h-7 text-xs" />
                </div>
              ) : src.census?.population || src.census?.summary ? (
                <span>
                  {src.census.population ? <span className="font-semibold">Population ~{Number(src.census.population).toLocaleString()}. </span> : null}
                  {src.census.summary || ""}
                </span>
              ) : (
                <span className="italic text-muted-foreground">{NA}</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}