import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { redlineAnalyze } from "@/functions/redlineAnalyze";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import RedlineList from "./RedlineList";
import NewRedline from "./NewRedline";
import RedlineView from "./RedlineView";
import { HL } from "../hawklawConst";

// Screens: list -> new -> (analyze) -> view
export default function RedlineCounter() {
  const [screen, setScreen] = useState("list");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function loadReviews() {
    setLoading(true);
    try {
      setReviews(await base44.entities.RedlineReview.list("-created_date", 100));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReviews(); }, []);

  function goList() {
    setActive(null); setComparison(null); setScreen("list");
    loadReviews();
  }

  function openCompleted(rec) {
    setActive(rec);
    setComparison({ summary: rec.summary, changes: rec.changes });
    setScreen("view");
  }

  async function onReady(rec, originalText, redlinedText) {
    setActive(rec);
    setAnalyzing(true);
    setScreen("analyzing");
    try {
      const res = await redlineAnalyze({
        reviewId: rec.id, originalText, redlinedText, disclaimerAck: true,
      });
      const data = res?.data ?? res;
      if (data?.error) {
        toast.error(data.error);
        setScreen("list");
        loadReviews();
        return;
      }
      setComparison(data);
      setScreen("view");
    } catch (err) {
      toast.error(err.message || "Comparison failed");
      setScreen("list");
      loadReviews();
    } finally {
      setAnalyzing(false);
    }
  }

  if (screen === "new") return <NewRedline onBack={goList} onReady={onReady} />;
  if (screen === "analyzing" || analyzing) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: HL.blue }} />
        <p className="text-sm">Comparing your lease against the landlord's redline…</p>
      </div>
    );
  }
  if (screen === "view" && comparison) return <RedlineView review={active} comparison={comparison} onBack={goList} />;
  return <RedlineList reviews={reviews} loading={loading} onNew={() => setScreen("new")} onOpen={openCompleted} />;
}