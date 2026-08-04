export default function SketchHeightControl({ value, onChange, disabled }) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground">
      Preview height
      <input
        type="number"
        min="1"
        max="2000"
        step="1"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next >= 1 && next <= 2000) onChange(next);
        }}
        className="w-16 bg-transparent text-right font-mono outline-none disabled:opacity-50"
        aria-label="Preview tower height in feet"
      />
      <span className="text-muted-foreground">ft</span>
    </label>
  );
}