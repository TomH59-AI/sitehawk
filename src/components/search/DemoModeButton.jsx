import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DEMO_RESULTS, DEMO_ORDINANCE, DEMO_CENTER } from "@/lib/demoData";

export default function DemoModeButton() {
  const navigate = useNavigate();

  const launchDemo = () => {
    navigate("/results", {
      state: {
        results: DEMO_RESULTS,
        ordinance: DEMO_ORDINANCE,
        searchCenter: DEMO_CENTER,
        searchId: "demo-scan",
        usage: { searches_used_today: 1, daily_search_limit: 999 },
        plan: { id: "demo", features: { exports: ["pdf", "csv"], mailer: true, skip_trace: true } },
        isDemo: true,
      },
    });
  };

  return (
    <button
      onClick={launchDemo}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-500 hover:to-pink-400 text-white text-sm font-bold shadow-lg shadow-purple-500/30 transition-all hover:scale-105"
      title="Pre-loaded sample scan — perfect for live demos"
    >
      <Sparkles className="w-4 h-4" />
      Demo Mode
    </button>
  );
}