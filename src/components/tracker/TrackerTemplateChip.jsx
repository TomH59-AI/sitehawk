import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";

const TEMPLATE_URL =
  "https://media.base44.com/files/public/69dd277f9504047a559d5834/fee55114c_SiteHawkCandidate_Site_Info_Template.xlsx";
const DISMISS_KEY = "hawk_tracker_template_chip_dismissed";

/**
 * "Click for tracker" chip — sits beside the Sites / Weekly Report tabs and
 * downloads the SiteHawk Candidate Site Info template. Once clicked it hides
 * itself and remembers that (localStorage), so it never nags again.
 */
export default function TrackerTemplateChip() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });

  if (hidden) return null;

  const handleClick = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
    setHidden(true);
  };

  return (
    <a
      href={TEMPLATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      download
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 h-8 text-xs font-heading font-semibold text-primary hover:bg-primary/20 transition-colors"
    >
      <FileSpreadsheet className="w-4 h-4" /> Click for tracker
    </a>
  );
}