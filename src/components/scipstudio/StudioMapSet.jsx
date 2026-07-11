/** REQUIRED MAP SET — 12 exhibits with capture status, thumbnail, source, caption. */
export default function StudioMapSet({ mapSet = [] }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">Required Map Set</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {mapSet.map((m) => (
          <div key={m.key} className="rounded-lg border border-border bg-card overflow-hidden">
            {m.asset_url ? (
              <a href={m.asset_url} target="_blank" rel="noreferrer">
                <img src={m.asset_url} alt={m.label} className="w-full h-28 object-cover" />
              </a>
            ) : (
              <div className="w-full h-28 bg-muted/50 flex items-center justify-center text-xs text-muted-foreground">Not captured</div>
            )}
            <div className="p-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold leading-tight">{m.label}</div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  m.status === "Approved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : m.status === "Captured" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-muted text-muted-foreground"}`}>
                  {m.status}
                </span>
              </div>
              {m.source && <div className="text-[11px] text-muted-foreground">Source: {m.source}</div>}
              {m.caption && <div className="text-[11px] text-foreground/80 italic">{m.caption}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}