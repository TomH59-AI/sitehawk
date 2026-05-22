/**
 * SCIPPage1SiteNotes — Page 1 SITE NOTES block.
 *
 * Single tall textarea matching the SCIP template, with an optional
 * "Auto-Generate Notes" button that uses the LLM to summarize site
 * development concerns from the EXISTING CONDITIONS data we already pulled
 * (flood, wetlands, airport proximity, terrain hints, etc.).
 */

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

const PROMPT_LABEL = `Please elaborate on any site development concerns
(i.e. terrain, foliage, obstructions, generators or microwaves prohibited)`;

export default function SCIPPage1SiteNotes({ page1Values, siteOwner }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function autoGenerate() {
    const lat = parseFloat(siteOwner?.site?.latitude || page1Values?.latitude);
    const lon = parseFloat(siteOwner?.site?.longitude || page1Values?.longitude);
    if (!isFinite(lat) || !isFinite(lon)) {
      setError("Enter Latitude / Longitude (or run Find Best Parcel) first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const context = [
        `Site name: ${page1Values?.site_name || "TBD"}`,
        `Coordinates: ${lat}, ${lon}`,
        `Tower height: ${page1Values?.sarf_height || "TBD"}`,
        `Tower type: ${page1Values?.tower_type || "TBD"}`,
        `Parcel address: ${siteOwner?.site?.parcel_street_address || ""}, ${siteOwner?.site?.parcel_city || ""}, ${siteOwner?.site?.parcel_state || ""}`,
        `Parcel size: ${siteOwner?.site?.parcel_size_acres || "TBD"}`,
        `Conforming size: ${siteOwner?.site?.conforming_size || "TBD"}`,
      ].join("\n");

      const result = await base44.integrations.Core.InvokeLLM({
        prompt:
          `You are a telecom site-acquisition agent writing the SITE NOTES section of a Site Candidate Information Package (SCIP). ` +
          `Write a concise, professional paragraph (3-6 sentences) elaborating on site development concerns at this candidate site. ` +
          `Cover terrain, foliage / tree canopy, nearby obstructions, airspace concerns (if near an airport), flood/wetland constraints, ` +
          `and any operator-specific restrictions (generators or microwaves prohibited). Use the live web to ground claims in real ` +
          `surroundings — Google Maps, satellite imagery, FAA Part 77, FEMA NFHL, USFWS NWI. If a concern is not present, say so briefly. ` +
          `Do NOT fabricate. Do NOT include bullet points — write flowing prose suitable for a printed SCIP.\n\n` +
          `SITE CONTEXT:\n${context}`,
        add_context_from_internet: true,
        model: "gemini_3_1_pro",
      });

      const text = typeof result === "string" ? result : result?.text || result?.content || "";
      if (text) setNotes(text.trim());
      else setError("LLM returned no content");
    } catch (e) {
      setError(e.message || "Auto-generate failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="px-3 py-2 bg-[#0C1B2E] text-white text-xs font-bold tracking-widest uppercase flex items-center justify-between">
        <span>Site Notes</span>
        <button
          onClick={autoGenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold tracking-wider bg-cyan-500 text-[#0C1B2E] hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? "Generating…" : "Auto-Generate Notes"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-[260px_1fr] border-b border-border last:border-b-0">
        <div className="px-3 py-2 text-sm text-foreground bg-muted/40 border-r border-border whitespace-pre-line">
          {PROMPT_LABEL}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Site sits on flat upland 4 ft above 100-yr flood line. Dense oak canopy on north & west edges of parcel; clear-cut required within 80-ft compound fall zone. No FAA Part 77 obstructions within 3 mi. Verizon design standards prohibit microwaves on this build. Diesel generator allowed per local fire code."
          rows={8}
          className="px-3 py-2 text-sm bg-card focus:outline-none focus:bg-primary/5 resize-y min-h-[140px]"
        />
      </div>
    </>
  );
}