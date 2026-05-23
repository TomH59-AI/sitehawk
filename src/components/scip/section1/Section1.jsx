/**
 * Section1 — top-level orchestrator for SCIP Section One.
 *
 * Strict hierarchy (every block has its own Generate button on the top-right):
 *   1. Site Acquisition User      (manual)
 *   2. SARF Map                   (Mapbox · GENERATE SARF MAP)
 *   3. Hawk Vision Targets 1/2/3  (Realie API · GENERATE 3 TARGETS)
 *   4. Target One Existing Cond.  (FEMA + NWI · GENERATE CONDITIONS)
 *   5. Site Notes                 (manual)
 *
 * Data flows downward: acquisition → SARF (uses lat/lon/radius) →
 * Hawk Vision (uses lat/lon/radius/height/compound) → Existing Conditions
 * (uses Target One lat/lon).
 */

import { useState } from "react";
import SiteAcquisitionBlock from "./SiteAcquisitionBlock";
import SARFBlock from "./SARFBlock";
import HawkVisionTargetsBlock from "./HawkVisionTargetsBlock";
import ExistingConditionsBlock from "./ExistingConditionsBlock";
import SiteNotesBlock from "./SiteNotesBlock";

const DEFAULT_ACQUISITION = {
  agent_name: "",
  tower_height_ft: "199",
  search_radius: "1.0",
  compound_dimensions: "100' x 100' (10,000 SF)",
  latitude: "",
  longitude: "",
};

export default function Section1({ initialAcquisition = {}, onChange }) {
  const [acquisition, setAcquisition] = useState({ ...DEFAULT_ACQUISITION, ...initialAcquisition });
  const [targets, setTargets] = useState([]);
  const [siteNotes, setSiteNotes] = useState("");

  const updateAcquisition = (next) => {
    setAcquisition(next);
    onChange?.({ acquisition: next, targets, siteNotes });
  };
  const updateTargets = (next) => {
    setTargets(next);
    onChange?.({ acquisition, targets: next, siteNotes });
  };
  const updateSiteNotes = (next) => {
    setSiteNotes(next);
    onChange?.({ acquisition, targets, siteNotes: next });
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Section banner */}
      <div className="px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent border border-cyan-500/30">
        <div className="text-[10px] font-mono text-cyan-600 tracking-[0.3em] mb-0.5">SCIP · SECTION ONE</div>
        <div className="font-heading font-bold text-lg text-foreground">Site Acquisition, SARF, Hawk Vision & Conditions</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Fill Site Acquisition first, then run each section's Generate button top-down. Every row is fillable.
        </div>
      </div>

      <SiteAcquisitionBlock values={acquisition} onChange={updateAcquisition} />
      <SARFBlock acquisition={acquisition} />
      <HawkVisionTargetsBlock acquisition={acquisition} onTargetsReady={updateTargets} />
      <ExistingConditionsBlock targetOne={targets[0]} />
      <SiteNotesBlock value={siteNotes} onChange={updateSiteNotes} />
    </div>
  );
}