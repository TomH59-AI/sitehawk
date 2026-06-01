// Scoped print for Hawk Document Intelligence — only #hawkdoc-print-root prints.
// Mirrors the SCIP print approach so it works regardless of Tailwind print config.
const PRINT_STYLE_ID = "hawkdoc-print-styles";

function ensurePrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body * { visibility: hidden !important; }
      #hawkdoc-print-root, #hawkdoc-print-root * { visibility: visible !important; }
      #hawkdoc-print-root { position: absolute; inset: 0; background: white !important; color: black !important; }
      #hawkdoc-print-root .no-print, #hawkdoc-print-root button { display: none !important; }
      @page { size: letter; margin: 0.5in; }
    }
  `;
  document.head.appendChild(style);
}

export function printHawkDoc() {
  ensurePrintStyles();
  window.print();
}