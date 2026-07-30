import { Button } from "@/components/ui/button";
import { Printer, ExternalLink, X } from "lucide-react";

// HawkFit Map — shows the generated exhibit inline (new tabs get popup-blocked)
// and prints just the exhibit image on its own page.
export default function MapExhibitPreview({ imageUrl, label, onClose }) {
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${label || "Map Exhibit"}</title>` +
        `<style>@page{margin:0.5in}body{margin:0;font-family:sans-serif}` +
        `h1{font-size:14px;margin:0 0 8px}img{width:100%;height:auto}</style></head>` +
        `<body><h1>${label || "Map Exhibit"}</h1>` +
        `<img src="${imageUrl}" onload="window.print()" /></body></html>`
    );
    w.document.close();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-xs font-bold text-foreground">Map Exhibit</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close exhibit">
          <X className="h-4 w-4" />
        </button>
      </div>
      <img src={imageUrl} alt="Tower siting map exhibit" className="w-full rounded-lg border border-border" />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={print}>
          <Printer className="h-4 w-4" /> Print
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" asChild>
          <a href={imageUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> Full size
          </a>
        </Button>
      </div>
    </div>
  );
}