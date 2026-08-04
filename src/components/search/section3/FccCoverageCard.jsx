import { Radio } from "lucide-react";

export default function FccCoverageCard({ data }) {
  const coverage = data.coverage;
  const pct = coverage?.fiber?.servedPct;
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Radio className="h-3.5 w-3.5" /> FCC fiber availability
      </div>
      <div className="text-sm font-medium text-foreground">
        {pct == null ? "No coverage percentage available" : `${pct}% of area broadband locations reported served by fiber`}
      </div>
      <div className="text-xs text-muted-foreground">
        {data.provider_count == null ? "Provider count unavailable" : `${data.provider_count} fiber provider${data.provider_count === 1 ? "" : "s"} reported in this block group`}
      </div>
      <div className="text-[10px] leading-relaxed text-muted-foreground">
        Source: FCC Broadband Data Collection · {data.source?.as_of_date || "date unavailable"}. Area summary only; confirm parcel service directly with providers.
      </div>
    </div>
  );
}