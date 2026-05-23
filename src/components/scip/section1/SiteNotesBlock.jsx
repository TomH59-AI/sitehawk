/**
 * SiteNotesBlock — Section 1.5.
 *
 * Free-form textarea for site development concerns (terrain, foliage,
 * obstructions, generators or microwaves prohibited, etc.). Matches the
 * SITE NOTES row in SectionOne.xlsx — no Generate button.
 */

import Section1Shell from "./Section1Shell";
import { StickyNote } from "lucide-react";

export default function SiteNotesBlock({ value, onChange }) {
  return (
    <Section1Shell step={5} title="Site Notes" subtitle="Manual entry · site development concerns" icon={StickyNote}>
      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/20 border-b border-border">
        Please elaborate on any site development concerns (i.e. terrain, foliage, obstructions, generators or
        microwaves prohibited).
      </div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder="Enter site notes..."
        className="w-full px-3 py-2 text-sm bg-card focus:outline-none focus:bg-primary/5 resize-y"
      />
    </Section1Shell>
  );
}