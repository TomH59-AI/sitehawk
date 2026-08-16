import { Link } from "react-router-dom";
import { MapPin, ClipboardList, FileSignature, Scale, Mail } from "lucide-react";

const NEXT_STEPS = [
  { path: "/hawk-tracker", icon: MapPin, label: "Hawk Tracker", desc: "Log this site and track it to build-out." },
  { path: "/follow-up-tracker", icon: ClipboardList, label: "Follow-Up Tracker", desc: "Schedule owner follow-ups so nothing slips." },
  { path: "/mail-orders", icon: Mail, label: "Mail Orders", desc: "Verify, pay for, and send Lob postcards." },
  { path: "/hawk-lease", icon: FileSignature, label: "HawkLease", desc: "Model lease terms and comps." },
  { path: "/hawk-law", icon: Scale, label: "Hawk Law", desc: "Review the lease before it's signed." },
];

// Shown after a SCIP is generated — the SCIP is the midpoint, not the finish line.
export default function PostScipNextSteps() {
  return (
    <div className="no-print w-full max-w-[8.5in] mt-6 rounded-2xl border border-white/15 p-5" style={{ background: "#0C1B2E" }}>
      <h3 className="font-heading font-bold text-white text-base mb-1">🦅 Your SCIP is done — don't stop here</h3>
      <p className="text-xs text-white/60 mb-4">The SCIP is the midpoint. These tools carry the site the rest of the way:</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {NEXT_STEPS.map((s) => (
          <Link key={s.path} to={s.path} className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="w-4 h-4" style={{ color: "#FFC72C" }} />
              <span className="font-bold text-sm text-white">{s.label}</span>
            </div>
            <p className="text-[11px] text-white/60">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}