/**
 * HawkMailersEngagement — friendly prompt that asks the user whether they
 * want Hawk Mailers to send a proposition to one of these landlords, and
 * whether they'd like HawkBot to draft the letter for them.
 *
 * Sits at the top of the ScanResults sidebar. Dismissible (per scan, in
 * sessionStorage so it returns on the next scan). Clicking "Yes" scrolls
 * to the candidate cards and pulses the Send Proposition buttons so the
 * user can see where to click.
 */

import { useEffect, useState } from "react";
import { Mail, Sparkles, X, ArrowDown } from "lucide-react";

const SS_KEY = "hawk_mailers_engagement_dismissed";
const PULSE_CSS_ID = "hawk-mailers-pulse-style";

function ensurePulseCss() {
  if (document.getElementById(PULSE_CSS_ID)) return;
  const style = document.createElement("style");
  style.id = PULSE_CSS_ID;
  style.textContent = `
    @keyframes hawkMailersPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.55); }
      50%      { box-shadow: 0 0 0 10px rgba(6,182,212,0); }
    }
    .hawk-mailers-pulse {
      animation: hawkMailersPulse 1.6s ease-out 4;
      border-radius: 8px;
    }
  `;
  document.head.appendChild(style);
}

export default function HawkMailersEngagement() {
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(SS_KEY) === "1"; } catch { return false; }
  });

  useEffect(() => { ensurePulseCss(); }, []);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(SS_KEY, "1"); } catch { /* ignore */ }
  }

  function pulseAndScroll() {
    // Find every Send Proposition button rendered in the candidate cards
    const buttons = Array.from(document.querySelectorAll("button")).filter((b) =>
      /Send Proposition/i.test(b.textContent || "")
    );
    if (buttons.length) {
      buttons[0].scrollIntoView({ behavior: "smooth", block: "center" });
      buttons.forEach((b) => {
        b.classList.add("hawk-mailers-pulse");
        setTimeout(() => b.classList.remove("hawk-mailers-pulse"), 7000);
      });
    }
  }

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-transparent p-3 mb-3 relative">
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 text-cyan-300/60 hover:text-cyan-200 p-1"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-start gap-2.5 pr-5">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-cyan-300" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-mono font-bold tracking-[0.18em] text-cyan-300 mb-0.5">
            HAWK MAILERS
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">
            Want Hawk Mailers to send a proposition to one of these landlords?
          </div>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
            We'll print, stamp, and mail a personalized ground-lease proposal via Lob first-class.
            <span className="block mt-1">
              <Sparkles className="w-3 h-3 inline -mt-0.5 mr-1 text-cyan-300" />
              <span className="text-foreground font-semibold">HawkBot can draft it for you</span> in the tone you choose — Professional, Friendly, Urgent, Direct, or Warm.
            </span>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={pulseAndScroll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#0a0e17] text-xs font-bold transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5" /> Yes — show me where
            </button>
            <button
              onClick={dismiss}
              className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary text-xs font-semibold transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}