/**
 * Section1Shell — strict hierarchy wrapper for SCIP Section One.
 *
 * Renders a single dark-blue section header with the title on the left and
 * an optional "Generate" button on the top-right. Used by every Section One
 * block so the hierarchy reads identically:
 *
 *   [ SECTION TITLE ............................ ⚡ GENERATE ]
 *   ┌────────────────────────────────────────────────────────┐
 *   │ rows / map / target cards                              │
 *   └────────────────────────────────────────────────────────┘
 */

import { Loader2 } from "lucide-react";

export default function Section1Shell({
  step,
  title,
  subtitle,
  generateLabel,
  onGenerate,
  loading = false,
  disabled = false,
  icon: Icon,
  children,
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[#0C1B2E] to-[#13294a] text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {step != null && (
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center font-mono text-[11px] font-bold text-cyan-300">
              {step}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-heading font-bold text-sm tracking-wide uppercase truncate flex items-center gap-2">
              {Icon && <Icon className="w-4 h-4 text-cyan-300" />}
              {title}
            </div>
            {subtitle && (
              <div className="text-[10px] font-mono text-cyan-200/70 tracking-wider mt-0.5 truncate">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={loading || disabled}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold tracking-[0.12em] bg-cyan-400 text-[#0C1B2E] hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" /> WORKING…
              </>
            ) : (
              generateLabel || "GENERATE"
            )}
          </button>
        )}
      </div>

      <div>{children}</div>
    </div>
  );
}