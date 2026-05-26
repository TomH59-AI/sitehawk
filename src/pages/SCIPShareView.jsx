/**
 * SCIPShareView — public read-only view of a shared SCIP.
 * Accessed via /scip-share?id=<share_id>. No login required.
 * Reuses the same SCIP components as the authenticated view.
 */

import { useEffect, useState } from "react";
import { scipShare } from "@/functions/scipShare";
import SCIPSection from "../components/scip/SCIPSection";
import SCIPCoverPage from "../components/scip/SCIPCoverPage";
import SCIPPhotographsGrid from "../components/scip/SCIPPhotographsGrid";
import PrintSCIPButton from "../components/scip/PrintSCIPButton";
import { buildScipData, SCIP_SECTION_ORDER } from "@/lib/scipFields";

export default function SCIPShareView() {
  const [snap, setSnap] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) {
      setError("Missing share id");
      return;
    }
    scipShare({ action: "get", share_id: id })
      .then((res) => setSnap(res.data))
      .catch((e) => setError(e.message || "Failed to load shared SCIP"));
  }, []);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="font-heading font-bold text-xl text-foreground">SCIP unavailable</h1>
        <p className="text-muted-foreground mt-2">{error}</p>
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const { candidate, ordinance, searchCenter, agent } = snap;
  const scipData = buildScipData(candidate, ordinance, searchCenter, agent || {}, {});

  return (
    <div id="scip-print-root" className="space-y-6 max-w-5xl mx-auto pb-12 pt-6 px-4">
      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <div>
          <div className="text-[10px] text-cyan-500 tracking-[0.25em] font-bold font-mono">SHARED · READ-ONLY</div>
          <h1 className="font-heading font-bold text-2xl text-foreground">Site Candidate Information Package</h1>
        </div>
        <PrintSCIPButton />
      </div>

      <SCIPCoverPage candidate={candidate} searchCenter={searchCenter} agent={agent || {}} />

      <div className="space-y-3">
        {SCIP_SECTION_ORDER.map((key) => (
          <SCIPSection
            key={key}
            sectionKey={key}
            title={scipData[key].title}
            fields={scipData[key].fields}
            onFieldChange={() => {}}
          />
        ))}
        <SCIPPhotographsGrid candidate={candidate} />
      </div>
    </div>
  );
}