import { Info, CheckCircle2, CircleDashed } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// One extracted form field: label + plain-English explanation + editable value.
export default function DocFieldRow({ field, onChange }) {
  const filled = !!(field.value && field.value.trim());
  const fromScip = filled && field.source === "scip";

  return (
    <div className="py-4 border-b border-border last:border-b-0">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground">{field.label}</span>
          {field.required && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Required</span>
          )}
          {fromScip && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded">Pre-filled from SCIP</span>
          )}
        </div>
        {filled
          ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          : <CircleDashed className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </div>

      {field.explanation && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground mb-2">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent" />
          <span>{field.explanation}</span>
        </p>
      )}

      {field.field_type === "long_text" ? (
        <Textarea
          value={field.value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer…"
          className="text-sm"
        />
      ) : (
        <Input
          value={field.value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your answer…"
          className="text-sm"
        />
      )}
    </div>
  );
}