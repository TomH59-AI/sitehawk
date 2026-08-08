import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function HistoryNavigation() {
  const navigate = useNavigate();
  // Browser history depth for this tab. When the user landed straight on a page
  // (fresh tab / refresh) there is nothing to go back to, so Back falls back to
  // the Dashboard instead of doing nothing at all.
  const canGoBack = window.history.length > 1;

  const goBack = () => (canGoBack ? navigate(-1) : navigate("/dashboard"));

  return (
    <nav
      aria-label="Page history"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] lg:top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 md:px-8">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          aria-label="Go back one page"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => navigate(1)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          aria-label="Go forward one page"
        >
          Forward <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}