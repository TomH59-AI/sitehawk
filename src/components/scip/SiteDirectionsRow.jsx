import { useEffect, useState } from "react";
import { Loader2, Navigation } from "lucide-react";
import { directionsFromBusiestIntersection } from "@/functions/directionsFromBusiestIntersection";

// HawkGuard — "Directions to Site" from the busiest named crossroads within
// ~2 miles (OSM), with GPS-paste coordinates as the always-works fallback.
export default function SiteDirectionsRow({ lat, lng }) {
  const [dir, setDir] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    directionsFromBusiestIntersection({ lat, lon: lng })
      .then((res) => { if (!cancelled) setDir(res?.data || null); })
      .catch(() => { if (!cancelled) setDir(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lat, lng]);

  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 flex items-center gap-2 bg-muted/50">
        <Navigation className="w-3.5 h-3.5 text-primary" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Directions to Site — from busiest crossroads
        </span>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Finding the busiest nearby intersection…
          </div>
        ) : dir?.directions_text ? (
          <pre className="whitespace-pre-wrap font-body text-xs md:text-sm text-foreground leading-relaxed">
            {dir.directions_text}
          </pre>
        ) : (
          <span className="text-sm italic text-muted-foreground">
            Directions unavailable — GPS coordinates: {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
          </span>
        )}
      </div>
    </div>
  );
}