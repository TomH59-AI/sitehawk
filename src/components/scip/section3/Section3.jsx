/**
 * Section3 — Infrastructure (cleared).
 *
 * All overlay/infrastructure maps were removed for a clean rebuild.
 * The N/E/S/W conical viewsheds still render below via SCIPViewshedSection
 * inside SCIPPreview.
 */

export default function Section3() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent border border-emerald-500/30">
        <div className="text-[10px] font-mono text-emerald-700 tracking-[0.3em] mb-0.5">SCIP · SECTION THREE</div>
        <div className="font-heading font-bold text-lg text-foreground">
          Infrastructure — Cleared for Rebuild
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          All overlay, power, and fiber maps were removed. Ready to rebuild from scratch.
        </div>
      </div>
    </div>
  );
}