import { useCallback, useEffect, useRef, useState } from "react";
import { showcaseJobs } from "@/functions/showcaseJobs";
import { useToast } from "@/components/ui/use-toast";

const MONO = "'Space Mono', monospace";

export default function SiteShowcaseSection({ candidate }) {
  const { toast } = useToast();
  const [job, setJob] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const pollRef = useRef(null);

  const fetchLatest = useCallback(async () => {
    const res = await showcaseJobs({ action: "latest", candidate_id: candidate.id });
    setJob(res.data?.job || null);
    setLoaded(true);
  }, [candidate.id]);

  useEffect(() => {
    fetchLatest().catch(() => setLoaded(true));
  }, [fetchLatest]);

  // Poll every 15s while queued/running
  useEffect(() => {
    const active = job && (job.status === "queued" || job.status === "running");
    if (active && !pollRef.current) {
      pollRef.current = setInterval(() => fetchLatest().catch(() => {}), 15000);
    }
    if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [job, fetchLatest]);

  const handleGenerate = async () => {
    if (queuing) return;
    setQueuing(true);
    try {
      const res = await showcaseJobs({
        action: "insert",
        candidate_id: candidate.id,
        site_name: candidate.site_name || null,
        prepared_for: candidate.owner_name || null,
        jurisdiction: candidate.county || candidate.zoning_jurisdiction || null,
        latitude: candidate.latitude ?? null,
        longitude: candidate.longitude ?? null,
      });
      if (res.data?.job) setJob(res.data.job);
      else await fetchLatest();
      toast({ description: "Showcase queued — generating in the background." });
    } catch {
      toast({ description: "Could not queue the showcase. Please try again.", variant: "destructive" });
    }
    setTimeout(() => setQueuing(false), 2500);
  };

  const isGenerating = job && (job.status === "queued" || job.status === "running");

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #1e293b" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 9, color: "#00d4ff", fontFamily: MONO, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 6 }}>
        SITE SHOWCASE
      </div>

      <button
        onClick={handleGenerate}
        disabled={queuing}
        style={{
          width: "100%", padding: "9px 10px", borderRadius: 8,
          cursor: queuing ? "default" : "pointer",
          background: queuing ? "#00d4ff66" : "#00d4ff", border: "1px solid #00d4ff",
          color: "#0a0e17", fontWeight: 700, fontSize: 12,
          fontFamily: MONO, letterSpacing: "0.05em",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "background 0.15s",
        }}
      >
        🎬 GENERATE SITE SHOWCASE
      </button>

      {/* Status card */}
      <div style={{ marginTop: 8 }}>
        {!loaded ? null : !job ? (
          <div style={{ fontSize: 10, color: "#475569", fontFamily: MONO, fontStyle: "italic", textAlign: "center" }}>
            No showcase generated yet
          </div>
        ) : isGenerating ? (
          <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "#0f1a2b", border: "1px solid #00d4ff33",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{
              display: "inline-block", width: 14, height: 14, flexShrink: 0,
              border: "2px solid #00d4ff44", borderTopColor: "#00d4ff",
              borderRadius: "50%", animation: "showcaseSpin 0.9s linear infinite",
            }} />
            <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: MONO, lineHeight: 1.5 }}>
              Generating your showcase PDF… this runs in the background and takes a minute or two.
            </span>
            <style>{`@keyframes showcaseSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : job.status === "done" ? (
          <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "#22c55e0f", border: "1px solid #22c55e33",
          }}>
            <a
              href={job.output_file_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "8px 10px", borderRadius: 7, textDecoration: "none",
                background: "#22c55e", color: "#0a0e17",
                fontWeight: 700, fontSize: 11, fontFamily: MONO, letterSpacing: "0.05em",
              }}
            >
              ⬇ DOWNLOAD SHOWCASE PDF
            </a>
            {(job.verdict || job.pe_letter) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                {job.verdict && (
                  <span style={{
                    background: "#22c55e18", border: "1px solid #22c55e33", color: "#22c55e",
                    fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 10, fontFamily: MONO,
                  }}>Verdict: {job.verdict}</span>
                )}
                {job.pe_letter && (
                  <span style={{
                    background: "#00d4ff18", border: "1px solid #00d4ff33", color: "#00d4ff",
                    fontSize: 9, fontWeight: 600, padding: "1px 7px", borderRadius: 10, fontFamily: MONO,
                  }}>PE Letter: {job.pe_letter}</span>
                )}
              </div>
            )}
          </div>
        ) : job.status === "error" ? (
          <div style={{
            padding: "10px 12px", borderRadius: 8,
            background: "#ef44440f", border: "1px solid #ef444433",
          }}>
            <div style={{ fontSize: 10, color: "#ef4444", fontFamily: MONO, lineHeight: 1.5, marginBottom: 8 }}>
              {job.error_message || "Showcase generation failed."}
            </div>
            <button
              onClick={handleGenerate}
              disabled={queuing}
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 7,
                cursor: queuing ? "default" : "pointer",
                background: "transparent", border: "1px solid #ef444455",
                color: "#ef4444", fontWeight: 700, fontSize: 11, fontFamily: MONO, letterSpacing: "0.05em",
              }}
            >
              ↻ RETRY
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}