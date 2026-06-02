import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { hawklawAnalyze } from "@/functions/hawklawAnalyze";
import { toast } from "sonner";
import ReviewsList from "./ReviewsList";
import NewReview from "./NewReview";
import SidePicker from "./SidePicker";
import AnalysisView from "./AnalysisView";

// Lease Analysis (single-side, hard-locked). Extracted from the old HawkLaw
// page so it can live inside the unified Hawk Docs hub. Screens: list -> new -> side -> analysis
export default function LeaseAnalysis() {
  const [screen, setScreen] = useState("list");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [leaseText, setLeaseText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function loadReviews() {
    setLoading(true);
    try {
      setReviews(await base44.entities.HawkLawReview.list("-created_date", 100));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReviews(); }, []);

  function goList() {
    setActive(null); setLeaseText(""); setAnalysis(null); setScreen("list");
    loadReviews();
  }
  function openCompleted(rec) { setActive(rec); setAnalysis(rec.analysis); setScreen("analysis"); }
  function onUploadReady(rec, text) { setActive(rec); setLeaseText(text); setScreen("side"); }

  async function confirmSide(side) {
    if (!active) return;
    setAnalyzing(true);
    try {
      const res = await hawklawAnalyze({ reviewId: active.id, side, leaseText, disclaimerAck: true });
      const data = res?.data ?? res;
      if (data?.error) {
        toast.error(data.locked_side ? `Locked to the ${data.locked_side} side — cannot switch.` : data.error);
        return;
      }
      setAnalysis(data);
      setScreen("analysis");
    } catch (err) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  if (screen === "new") return <NewReview onBack={goList} onReady={onUploadReady} />;
  if (screen === "side") return <SidePicker leaseName={active?.lease_name} analyzing={analyzing} onBack={goList} onConfirm={confirmSide} />;
  if (screen === "analysis" && analysis) return <AnalysisView review={active} analysis={analysis} onBack={goList} />;
  return <ReviewsList reviews={reviews} loading={loading} onNew={() => setScreen("new")} onOpen={openCompleted} />;
}