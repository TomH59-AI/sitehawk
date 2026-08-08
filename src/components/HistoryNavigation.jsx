import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

// In-app page history. The browser's own history gets polluted by redirects
// (e.g. unknown routes bouncing to /dashboard), so Back could land somewhere
// the user never visited. This tracks the exact pages the user actually saw,
// in order, and steps through THAT list.
const KEY = "sh_nav_stack";
const IDX = "sh_nav_index";
let internalNav = false; // set when OUR buttons trigger the navigation

const readStack = () => {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; }
};
const readIndex = () => {
  const n = Number(sessionStorage.getItem(IDX));
  return Number.isFinite(n) ? n : -1;
};
const write = (stack, index) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-50)));
    sessionStorage.setItem(IDX, String(Math.min(index, 49)));
  } catch {}
};

export default function HistoryNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname + location.search;
  // Mirrored in state so the buttons re-render AFTER the effect records the
  // new page — the write happens post-render, so reading storage during render
  // alone leaves the buttons one page behind.
  const [pos, setPos] = useState({ index: readIndex(), length: readStack().length });

  // Record every page the user lands on (unless it was our own Back/Forward).
  useEffect(() => {
    const stack = readStack();
    const index = readIndex();
    if (internalNav || stack[index] === path) {
      internalNav = false;
      setPos({ index: readIndex(), length: readStack().length });
      return;
    }
    const next = stack.slice(0, index + 1);
    next.push(path);
    write(next, next.length - 1);
    setPos({ index: next.length - 1, length: next.length });
  }, [path]);

  const canGoBack = pos.index > 0;
  const canGoForward = pos.index >= 0 && pos.index < pos.length - 1;

  const step = (dir) => {
    const s = readStack();
    const i = readIndex() + dir;
    if (i < 0 || i > s.length - 1) return;
    internalNav = true;
    write(s, i);
    navigate(s[i]);
  };

  // Handlers read storage fresh — never trust the render-time snapshot.
  const goBack = () => (readIndex() > 0 ? step(-1) : navigate("/dashboard"));

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
          onClick={() => step(1)}
          disabled={!canGoForward}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
          aria-label="Go forward one page"
        >
          Forward <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}