import { useState } from "react";
import { Printer } from "lucide-react";

// Section-aware Print SCIP control for the SCIP Preview page.
// All sections start SELECTED; deselect any to exclude it from the printout.
// Sections are wrapped in <div data-scip-section="<id>"> in the page; when a
// section is deselected we add the .scip-section-hidden class to that wrapper,
// which the injected print CSS hides via @media print.

const PRINT_STYLE_ID = "scip-print-styles";

function ensurePrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #scip-print-root, #scip-print-root * { visibility: visible !important; }
      #scip-print-root { position: absolute; inset: 0; padding: 24px; background: white !important; color: black !important; }
      #scip-print-root .no-print { display: none !important; }
      #scip-print-root .scip-section-hidden { display: none !important; }
      #scip-print-root input { border: none !important; background: transparent !important; }
      #scip-print-root button { display: none !important; }
      @page { size: letter; margin: 0.5in; }
    }
  `;
  document.head.appendChild(style);
}

export default function ScipPrintSelector({ sections }) {
  // selected defaults all ON so the full package prints unless the user opts out.
  const [selected, setSelected] = useState(() => {
    const m = {};
    sections.forEach((s) => { m[s.id] = true; });
    return m;
  });

  const toggle = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const allOn = sections.every((s) => selected[s.id]);
  const setAll = (val) => setSelected(() => {
    const m = {};
    sections.forEach((s) => { m[s.id] = val; });
    return m;
  });

  const handlePrint = () => {
    ensurePrintStyles();
    // Apply hidden class to deselected section wrappers right before printing.
    sections.forEach((s) => {
      const el = document.querySelector(`[data-scip-section="${s.id}"]`);
      if (!el) return;
      el.classList.toggle("scip-section-hidden", !selected[s.id]);
    });
    window.print();
  };

  const selectedCount = sections.filter((s) => selected[s.id]).length;

  return (
    <div className="no-print w-full">
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[2px] text-muted-foreground">
            Choose sections to print
          </span>
          <button
            type="button"
            onClick={() => setAll(!allOn)}
            className="text-xs font-semibold px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/5"
          >
            {allOn ? "Deselect all" : "Select all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {sections.map((s) => (
            <label key={s.id} className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={!!selected[s.id]} onChange={() => toggle(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
        <button
          onClick={handlePrint}
          disabled={selectedCount === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm transition-all shadow-md disabled:opacity-50"
        >
          <Printer className="w-4 h-4" /> Print SCIP{selectedCount > 0 ? ` · ${selectedCount} section${selectedCount !== 1 ? "s" : ""}` : ""}
        </button>
      </div>
    </div>
  );
}