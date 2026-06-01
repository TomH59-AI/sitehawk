/**
 * HawkLawOutputFooter — PLACEMENT B.
 * Small, italic, gray disclaimer rendered beneath every AI-generated
 * lease analysis / redline / legal output.
 */
export default function HawkLawOutputFooter() {
  return (
    <p className="text-xs italic text-muted-foreground mt-4 pt-3 border-t border-border">
      AI-generated analysis. HawkLaw is not a licensed attorney. Consult counsel before acting on this output.
    </p>
  );
}