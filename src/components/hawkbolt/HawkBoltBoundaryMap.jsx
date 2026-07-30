import { Map, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAP_URL =
  "https://www.randymajors.org/customgmap?x=-83.0457500&y=42.3314300&cx=-97.0089568&cy=38.0410699&zoom=6&mapbuilder=true&labels=show&title=SiteHawk&counties=show&cities=show&townships=show&zipcodes=show";

// Boundary reference map (counties, cities, townships, ZIPs) next to HawkBolt.
// randymajors.org blocks being displayed inside another site, so this launches it
// in a new tab rather than showing an empty frame.
export default function HawkBoltBoundaryMap() {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Map className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="font-heading text-sm font-bold text-foreground">
            SiteHawk Boundary Map
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            County, city, township and ZIP boundaries with labels — for eyeballing the
            jurisdiction behind a HawkBolt answer. Opens in a new tab (randymajors.org
            doesn't allow being embedded).
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0 gap-1.5">
        <a href={MAP_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" /> Open Boundary Map
        </a>
      </Button>
    </div>
  );
}