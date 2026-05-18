import { useState } from "react";

export default function SCIPSection({ title, fields, sectionKey, onFieldChange }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0C1B2E] text-white hover:bg-[#102544] transition-colors"
      >
        <span className="font-heading font-bold text-sm tracking-wide uppercase">{title}</span>
        <span className="text-xs opacity-70">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="divide-y divide-border">
          {fields.map(([label, value], i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-2 px-4 py-2 hover:bg-secondary/30">
              <label className="text-xs font-semibold text-muted-foreground self-center">{label}</label>
              <input
                type="text"
                value={value || ""}
                onChange={(e) => onFieldChange(sectionKey, i, e.target.value)}
                className="text-sm text-foreground bg-transparent border-b border-transparent focus:border-primary focus:outline-none px-1 py-1"
                placeholder="—"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}