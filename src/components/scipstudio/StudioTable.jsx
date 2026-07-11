/** Generic table for Document Studio register rows. columns = [{key, label}] */
export default function StudioTable({ title, columns, rows = [], emptyText = "No entries yet." }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-lg px-3 py-4">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 text-left">
                {columns.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-top">{r[c.key] ?? "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}