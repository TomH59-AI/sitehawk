import { Printer } from "lucide-react";
import { toast } from "sonner";

// Triggers the browser print dialog scoped to the SCIP content area.
// Uses a print stylesheet injected on demand — no extra packages required.

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
      #scip-print-root input { border: none !important; background: transparent !important; }
      #scip-print-root button { display: none !important; }
      @page { size: letter; margin: 0.5in; }
    }
  `;
  document.head.appendChild(style);
}

export default function PrintSCIPButton({ releaseAllowed = false }) {
  const handlePrint = () => {
    if (!releaseAllowed) {
      toast.error("This legacy share has no OpenRouter QC release manifest, so printing is locked.");
      return;
    }
    ensurePrintStyles();
    window.print();
  };

  return (
    <button
      onClick={handlePrint}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm transition-all shadow-md"
    >
      <Printer className="w-4 h-4" /> Print SCIP
    </button>
  );
}