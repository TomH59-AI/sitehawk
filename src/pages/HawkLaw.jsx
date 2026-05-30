import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { hawklawAnalyze } from "@/functions/hawklawAnalyze";
import { toast } from "sonner";
import ReviewsList from "../components/hawklaw/ReviewsList";
import NewReview from "../components/hawklaw/NewReview";
import SidePicker from "../components/hawklaw/SidePicker";
import AnalysisView from "../components/hawklaw/AnalysisView";

// Screens: list -> new -> side -> analysis
export default function HawkLaw() {
  const [screen, setScreen] = useState("list");
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);     // current HawkLawReview record
  const [leaseText, setLeaseText] = useState(""); // extracted text (new reviews only)
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function loadReviews() {
    setLoading(true);
    try {
      const list = await base44.entities.HawkLawReview.list("-created_date", 100);
      setReviews(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReviews(); }, []);

  function goList() {
    setActive(null); setLeaseText(""); setAnalysis(null); setScreen("list");
    loadReviews();
  }

  function openCompleted(rec) {
    setActive(rec);
    setAnalysis(rec.analysis);
    setScreen("analysis");
  }

  function onUploadReady(rec, text) {
    setActive(rec);
    setLeaseText(text);
    setScreen("side");
  }

  async function confirmSide(side) {
    if (!active) return;
    setAnalyzing(true);
    try {
      const res = await hawklawAnalyze({
        reviewId: active.id, side, leaseText, disclaimerAck: true,
      });
      const data = res?.data ?? res;
      if (data?.error) {
        // belt-and-suspenders: surface lock conflict (409) clearly
        toast.error(data.locked_side
          ? `Locked to the ${data.locked_side} side — cannot switch.`
          : data.error);
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