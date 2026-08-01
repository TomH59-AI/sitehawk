const NAVY = "#0f2a43";
const BLUE = "#1d6fb8";

// One map-exhibit page of the SCIP Book — a stacked pair of framed map images
// with captions, matching the workbook's map sheets.
export default function BookMapPage({ page }) {
  return (
    <div className="flex flex-col h-full">
      <div className="text-center py-2 mb-3 rounded" style={{ background: NAVY }}>
        <h1 className="text-white text-base font-bold tracking-wide">{page.title}</h1>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        {page.slots.map((slot) => (
          <div key={slot.label} className="flex-1 flex flex-col min-h-0">
            <div className="px-2 py-1 mb-1 rounded-sm text-white font-bold text-[10px] tracking-wider" style={{ background: BLUE }}>
              {slot.label}
            </div>
            <div className="flex-1 rounded border flex items-center justify-center overflow-hidden min-h-0" style={{ borderColor: "#c8d4de", background: "#f7fafc" }}>
              {slot.url ? (
                <img src={slot.url} alt={slot.label} className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-slate-400 text-xs px-6 text-center">
                  {slot.optional ? "Optional exhibit — not included" : "Not yet generated — run this section in the SCIP pipeline"}
                </span>
              )}
            </div>
            <p className="text-[9px] mt-1 italic" style={{ color: "#5b6b79" }}>{slot.caption}</p>
          </div>
        ))}
      </div>
    </div>
  );
}