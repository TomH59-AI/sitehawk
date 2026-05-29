/**
 * RestartTourButton — small question-mark icon that replays the SARF coachmark tour.
 * Clears the persisted completion flags and invokes the global start hook
 * exposed by SARFCoachTour. Only fires on /search or /scip (where anchors exist).
 */

import { HelpCircle } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export default function RestartTourButton({ className = "" }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = () => {
    try {
      localStorage.removeItem("sarf_coach_tour_completed_v1");
      localStorage.removeItem("sarf_coach_search_done_v1");
    } catch {}
    // If we're not on a page that has anchors, send the user to /search first
    if (location.pathname !== "/search" && location.pathname !== "/scip") {
      navigate("/search");
      // SARFCoachTour's mount-effect will pick it up on route change
      return;
    }
    if (typeof window.__sarfCoachStart === "function") {
      window.__sarfCoachStart();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ${className}`}
      title="Restart tour"
      aria-label="Restart guided tour"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );
}