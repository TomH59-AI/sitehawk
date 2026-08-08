import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

// Uses the browser's OWN history so these buttons and the browser's native
// back/forward are always the same stack — they can never disagree or jump
// back to the start of the app.
export default function HistoryNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  // How many steps back we currently are — that's how many forward steps exist.
  const [forwardCount, setForwardCount] = useState(0);
  const stepping = useRef(0);

  useEffect(() => {
    if (stepping.current) {
      setForwardCount((c) => Math.max(0, c - stepping.current));
      stepping.current = 0;
    } else {
      // A brand-new navigation wipes any forward entries.
      setForwardCount(0);
    }
  }, [location.key]);

  const step = (dir) => {
    stepping.current = dir;
    navigate(dir);
  };

  return (
    <nav
      aria-label="Page history"
      className="sticky top-[calc(4rem+env(safe-area-inset-top))] lg:top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 md:px-8">
        <button
          type="button"
          onClick={() => step(-1)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          aria-label="Go back one page"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={forwardCount <= 0}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          aria-label="Go forward one page"
        >
          Forward <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}