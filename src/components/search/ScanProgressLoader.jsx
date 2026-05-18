import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const STEPS = [
  { label: "Scanning 0.5-mile radius for parcels", duration: 1400 },
  { label: "Analyzing local zoning ordinance", duration: 1800 },
  { label: "Pulling FEMA flood zone data", duration: 1200 },
  { label: "Checking ASCE 7-22 wind speeds", duration: 1100 },
  { label: "Mapping USFWS wetlands inventory", duration: 1300 },
  { label: "Locating nearest cell towers & airports", duration: 1500 },
  { label: "Verifying FCC fiber broadband", duration: 1200 },
  { label: "Scoring candidates with AI Vision", duration: 1800 },
];

export default function ScanProgressLoader() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (activeIdx >= STEPS.length - 1) return;
    const t = setTimeout(() => setActiveIdx((i) => i + 1), STEPS[activeIdx].duration);
    return () => clearTimeout(t);
  }, [activeIdx]);

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-[#0C1B2E] to-[#13294a] p-8 shadow-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
        <div>
          <h3 className="font-heading font-bold text-white text-lg">AI Vision Scanning</h3>
          <p className="text-xs text-cyan-300/70">Analyzing parcels within 0.5 miles</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {STEPS.map((step, i) => {
          const isDone = i < activeIdx;
          const isActive = i === activeIdx;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 ${
                isActive
                  ? "bg-cyan-400/10 border border-cyan-400/30"
                  : isDone
                  ? "opacity-60"
                  : "opacity-30"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : isActive ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-white/20 shrink-0" />
              )}
              <span
                className={`text-sm ${
                  isActive ? "text-white font-medium" : isDone ? "text-white/60" : "text-white/40"
                }`}
              >
                {step.label}
              </span>
              {isActive && (
                <span className="ml-auto text-[10px] text-cyan-300 font-mono uppercase tracking-wider">
                  In Progress
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-white/40 font-mono uppercase tracking-widest">
        <span>🦅 SiteHawk AI Engine</span>
        <span>Powered by SkyWave AI</span>
      </div>
    </div>
  );
}