import { Link } from "react-router-dom";

/**
 * PipelinePageHeader — shared header for every standalone pipeline page.
 * Shows the step number, title, and the active search ring / target context so
 * the user always knows which site the page is working on.
 */
export default function PipelinePageHeader({ step, title, subtitle, context }) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-4">
      <div className="text-[10px] font-mono tracking-[0.3em] text-primary">STEP {step}</div>
      <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground mt-0.5">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      {context && <div className="text-xs font-mono text-foreground/80 mt-2">{context}</div>}
    </div>
  );
}

/** Shown when a page needs a search ring that hasn't been set yet. */
export function NeedsSarf({ what = "this step" }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-5 py-8 text-center space-y-3">
      <div className="text-3xl">🛰️</div>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">
        No active search ring yet. Set your SARF center on the SARF Map page first — {what} works from that ring.
      </p>
      <Link
        to="/sarf-map"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        Go to SARF Map
      </Link>
    </div>
  );
}