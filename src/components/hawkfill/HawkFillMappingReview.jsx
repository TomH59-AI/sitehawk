/**
 * HawkFillMappingReview — shows unmapped document fields as dropdown rows
 * where the user picks the canonical SiteHawk key for each one.
 */
import { useState } from "react";
import { ArrowRight, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";

const CANONICAL_KEYS = [
  "owner_name",
  "owner_mailing_address",
  "owner_phone",
  "owner_email",
  "parcel_id",
  "site_address",
  "latitude",
  "longitude",
  "acreage",
  "zoning_code",
  "zoning_district",
  "height_limit_ft",
  "setback_ft",
  "fall_zone_ft",
  "permit_type",
  "collocation_required",
  "stealth_required",
  "allowable_zones",
  "flood_zone",
  "wetlands_present",
  "annual_tax",
  "tax_year",
  "power_provider",
  "fiber_provider",
  "nearest_airport",
  "candidate_name",
  "search_ring_id",
  "deed_reference",
];

export default function HawkFillMappingReview({ unmapped, fieldMap, onConfirm, onBack, loading }) {
  // resolvedMap: their_field -> canonical_key (or "" to skip)
  const [resolvedMap, setResolvedMap] = useState(() => {
    const init = {};
    for (const f of unmapped) init[f] = "";
    return init;
  });

  const setMapping = (theirField, canonicalKey) => {
    setResolvedMap((prev) => ({ ...prev, [theirField]: canonicalKey }));
  };

  const handleConfirm = () => {
    // Merge existing fieldMap with user-resolved entries (skip blanks)
    const merged = { ...fieldMap };
    for (const [their, canonical] of Object.entries(resolvedMap)) {
      if (canonical) merged[their] = canonical;
    }
    onConfirm(merged);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      <div>
        <h2 className="font-heading font-bold text-lg">Map Unmapped Fields</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {unmapped.length} field{unmapped.length !== 1 ? "s" : ""} in your document couldn't be auto-matched.
          Assign each one to a SiteHawk key or leave it blank to skip.
        </p>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr,auto,1fr] gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
          <span>Their Field</span>
          <span />
          <span>SiteHawk Field</span>
        </div>
        {unmapped.map((field) => (
          <div key={field} className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-mono truncate">
              {field}
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <select
              value={resolvedMap[field] || ""}
              onChange={(e) => setMapping(field, e.target.value)}
              className="h-9 rounded-md border border-input bg-background text-sm px-2 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— skip —</option>
              {CANONICAL_KEYS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={loading} className="flex-1">
          ← Back
        </Button>
        <Button onClick={handleConfirm} disabled={loading} className="flex-1 gap-2">
          {loading ? "Processing…" : <><SkipForward className="w-4 h-4" /> Confirm & Fill</>}
        </Button>
      </div>
    </div>
  );
}