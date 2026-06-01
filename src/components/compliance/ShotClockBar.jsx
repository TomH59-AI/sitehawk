import { daysSince, shotClock } from "./complianceConst";

// 30-day FCC NPA shot clock progress bar for a SHPO/THPO record.
// Pass the start date (submissionDate or notificationDate) and whether the clock is running.
export default function ShotClockBar({ startDate, running }) {
  if (!running || !startDate) return null;
  const days = daysSince(startDate);
  const c = shotClock(days);
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium" style={{ color: c.color }}>
          Day {days} of 30 · {c.label}
        </span>
        <span className="text-muted-foreground">{Math.max(0, 30 - days)} days left</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${c.pct}%`, background: c.color }} />
      </div>
    </div>
  );
}