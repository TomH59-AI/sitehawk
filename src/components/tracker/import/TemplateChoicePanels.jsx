import { useRef } from "react";
import { Download, Upload, FileSpreadsheet, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRACKER_GREEN } from "@/lib/hawkTracker";
import { HAWK_HEADERS } from "@/lib/trackerTemplate";
import { MAX_ROWS } from "@/lib/trackerImport";

// Two choices, side by side: work in the SiteHawk tracker, or bring your own.
// Whichever they pick becomes the layout every later export is written into.
export default function TemplateChoicePanels({ activeKind, onUseHawk, onFile }) {
  const fileRef = useRef(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* LEFT — the SiteHawk tracker */}
      <div className="rounded-xl border border-border p-4 flex flex-col">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" style={{ color: TRACKER_GREEN }} />
          <div className="font-heading font-bold text-sm text-foreground">SiteHawk Tracker</div>
          {activeKind === "hawk" && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: TRACKER_GREEN }}>
              <Check className="w-3 h-3" /> In use
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Our layout, ready for {MAX_ROWS} sites — owner, parcel, zoning, FEMA, plus carrier,
          market, status and on-air date.
        </p>
        <div className="mt-2 rounded-lg bg-muted/40 p-2 max-h-28 overflow-auto">
          <div className="flex flex-wrap gap-1">
            {HAWK_HEADERS.map((h) => (
              <span key={h} className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
                {h}
              </span>
            ))}
          </div>
        </div>
        <Button size="sm" className="mt-3 gap-1.5 text-white" style={{ background: TRACKER_GREEN }} onClick={onUseHawk}>
          <Download className="w-4 h-4" /> Use Hawk Tracker
        </Button>
      </div>

      {/* RIGHT — their own file */}
      <div className="rounded-xl border border-border p-4 flex flex-col">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-muted-foreground" />
          <div className="font-heading font-bold text-sm text-foreground">Use Your Own</div>
          {activeKind === "custom" && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: TRACKER_GREEN }}>
              <Check className="w-3 h-3" /> In use
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Your spreadsheet, your columns. We match what we can and keep your layout for exports.
        </p>
        <div
          className="mt-2 flex-1 rounded-lg border-2 border-dashed border-border p-5 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
        >
          <div className="text-xs font-semibold text-foreground">Drop your file, or click to browse</div>
          <div className="text-[11px] text-muted-foreground mt-1">.csv or .xlsx · headers on row 1 · max {MAX_ROWS} rows</div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>
    </div>
  );
}