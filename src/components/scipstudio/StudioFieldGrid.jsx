import { Lock } from "lucide-react";

/** Generic label/value grid for a Document Studio block. fields = [[label, value], ...] */
export default function StudioFieldGrid({ title, fields, locked }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        {locked && <Lock className="w-3 h-3 text-amber-600" />}
        {title}
        {locked && <span className="text-[10px] normal-case tracking-normal text-amber-600 font-sans">— locked source record</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {fields.map(([label, value]) => (
          <div key={label} className={`rounded-lg border p-2.5 ${locked ? "bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/60 dark:border-amber-900/40" : "bg-muted/40 border-border"}`}>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-sm font-semibold text-foreground break-words">{value ?? "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}