import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Search, Phone, HelpCircle } from "lucide-react";
import HawkIcon from "../HawkIcon";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: <HawkIcon size={56} />,
    emoji: null,
    title: "Welcome to SiteHawk 🦅",
    desc: "You just got the fastest way to find tower sites. Now let's make sure none of that research ever gets lost.",
    tip: null,
  },
  {
    icon: null,
    emoji: "📍",
    title: "Step 1 — Run a Site Scan",
    desc: "Go to Site Search, drop in GPS coordinates for your target area, and hit Scan. SiteHawk will analyze every parcel within 0.5 miles and return the top candidates — scored, ranked, and ready.",
    tip: "Tip: Use Google Maps to grab coordinates — right-click any location and copy the lat/lon.",
  },
  {
    icon: null,
    emoji: "📡",
    title: "Step 2 — Review Candidates",
    desc: "Each result includes zoning classification, parcel size, owner info, nearest airport (with IATA code + distance), and nearby cell tower density. Everything you need for due diligence — in one card.",
    tip: "Tip: Higher match scores = better buildability. Filter by zoning or acreage using the Filter Panel.",
  },
  {
    icon: null,
    emoji: "📞",
    title: "Step 3 — Skip Trace the Owner",
    desc: "Click 'Skip Trace' on any candidate to instantly surface verified owner phone numbers, emails, and registered agent info. Start the acquisition conversation the same day.",
    tip: "Tip: Use 'Skip Trace All' to run all candidates at once and batch-trace every result in one click.",
  },
  {
    icon: null,
    emoji: "✉️",
    title: "Step 4 — Can't Reach Them? Send Direct Mail",
    desc: "If skip trace can't find contact info, no problem. Order a professional direct mail campaign and we'll send physical acquisition letters straight to the property owner's mailing address — 3 letters ($79) or 5 letters ($119).",
    tip: "Tip: Look for the 'Send Direct Mail' button that appears automatically when skip trace returns no contact info.",
  },
  {
    icon: null,
    emoji: "🤖",
    title: "Step 5 — SiteHawk AI, Your Favorite Feature",
    desc: "After every scan, your personal AI site acquisition consultant is ready. Ask it anything — which parcel is best, what permits you'll need, setback requirements, zoning explanations — it has full context of your results.",
    tip: "Look for the SiteHawk icon button (bottom-right) after your scan completes to open the AI chat.",
    highlight: true,
  },
  {
    icon: null,
    emoji: "📄",
    title: "Step 6 — Export & Share",
    desc: "Generate a full branded PDF intelligence report from your scan — includes all candidates, zoning ordinance, airport & tower data, skip trace info, and a satellite map snapshot. Perfect for team presentations.",
    tip: "Find the 'Download PDF Report' button at the bottom of your scan results.",
  },
];

export default function WelcomeModal({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-secondary">
          <div
            className="h-1 bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="p-8 flex flex-col items-center text-center gap-4 min-h-[320px] justify-center">
          {current.icon ? (
            <div className="mb-2">{current.icon}</div>
          ) : (
            <div className={`text-5xl mb-2 ${current.highlight ? "animate-bounce" : ""}`}>{current.emoji}</div>
          )}

          {current.title && (
            <h2 className={`font-heading font-bold text-xl text-foreground leading-snug ${current.highlight ? "text-primary" : ""}`}>
              {current.title}
            </h2>
          )}
          {current.desc && <p className="text-sm text-muted-foreground leading-relaxed">{current.desc}</p>}

          {current.tip && (
            <div className={`w-full rounded-xl px-4 py-3 text-xs font-medium text-left ${current.highlight ? "bg-primary/10 border border-primary/30 text-primary" : "bg-secondary border border-border text-muted-foreground"}`}>
              💡 {current.tip}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="px-8 pb-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={step === 0}
            onClick={() => setStep(s => s - 1)}
            className="gap-1 text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Button>

          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-200 ${i === step ? "w-4 h-2 bg-primary" : "w-2 h-2 bg-secondary"}`}
              />
            ))}
          </div>

          {isLast ? (
            <Button size="sm" onClick={onClose} className="gap-1 font-semibold">
              Let's Go 🦅
            </Button>
          ) : (
            <Button size="sm" onClick={() => setStep(s => s + 1)} className="gap-1">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}