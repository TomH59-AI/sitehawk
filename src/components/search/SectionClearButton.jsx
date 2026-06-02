import { RotateCcw } from "lucide-react";

/**
 * SectionClearButton — small "Clear" control shown on a pipeline section so the
 * user can wipe just that section (and everything downstream of it) and re-run.
 * Purely presentational; the parent owns the actual reset logic.
 */
export default function SectionClearButton({ onClear, label = "Clear", className = "" }) {
  return (
    <button
      onClick={onClear}
      title="Clear this section and everything after it"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors ${className}`}
    >
      <RotateCcw className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}