/**
 * ComplianceStep — Map 12 in the Section 4 Target A pipeline.
 *
 * Replaces the standalone Hawk Compliance page. Pre-screens the 8 NEPA triggers
 * (47 CFR 1.1307) directly from Target A + the live Section 4 data bus
 * (FEMA, wetlands, zoning) and the SARF tower height, computes the NEPA
 * determination, lets the user adjust triggers / project type / ground
 * disturbance, and generates an excellent printable compliance report.
 *
 * Gated like every other sub-step: locked until Map 11 (Fiber) completes; fires
 * only on its own "Run Compliance Report" button.
 */

import { useState, useEffect, useMemo } from "react";
import { Lock, Shield, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import HawkFlightSpinner from "../HawkFlightSpinner";
import TriggersPanel from "@/components/compliance/TriggersPanel";
import ComplianceReport from "@/components/compliance/ComplianceReport";
import { computeDetermination, DISCLAIMER, NEPA_BADGE, HC } from "@/components/compliance/complianceConst";
import { preScreenFromBus } from "./complianceFromBus";

export default function ComplianceStep({
  unlocked, loading, done, targetA, sectionData, towerHeightFt, ringName, onRun,
}) {
  const [flags, setFlags] = useState({});
  const [projectType, setProjectType] = useState("new_tower");
  const [disturbanceArea, setDisturbanceArea] = useState(null);
  const [disturbanceDepth, setDisturbanceDepth] = useState(null);
  const [notes, setNotes] = useState([]);
  const [showReport, setShowReport] = useState(false);

  // Re-run the pre-screen whenever Target A or the relevant bus data changes.
  useEffect(() => {
    if (!targetA) return;
    const { flags: f, notes: n } = preScreenFromBus(targetA, sectionData, towerHeightFt);
    setFlags(f);
    setNotes(n);
  }, [targetA, sectionData?.fema?.flood_zone, sectionData?.wetlands?.present, sectionData?.historic?.present, sectionData?.historic?.count, sectionData?.species?.present, sectionData?.species?.count, sectionData?.hazwaste?.present, sectionData?.hazwaste?.count, sectionData?.zoneomicsDistrict?.zone_code, towerHeightFt]);

  const determination = useMemo(
    () => computeDetermination(flags, disturbanceArea, projectType),
    [flags, disturbanceArea, projectType]
  );
  const badge = NEPA_BADGE[determination] || NEPA_BADGE["Not Started"];

  const toggleFlag = (key) => setFlags((s) => ({ ...s, [key]: !s[key] }));
  const setField = (field, value) => {
    if (field === "projectType") setProjectType(value);
    if (field === "groundDisturbanceArea") setDisturbanceArea(value);
    if (field === "groundDisturbanceDepth") setDisturbanceDepth(value);
  };

  // Assemble a ComplianceCheck-shaped record for the printable report (no entity write).
  const reportRecord = {
    siteName: ringName || targetA?.parcel_address || "Target A Site",
    ownerName: targetA?.owner || targetA?.owner_name || "—",
    targetLat: targetA?.latitude,
    targetLon: targetA?.longitude,
    county: targetA?.county || "",
    state: targetA?.state || "",
    projectType,
    nepaTriggerFlags: flags,
    nepaDetermination: determination,
    groundDisturbanceArea: disturbanceArea,
    groundDisturbanceDepth: disturbanceDepth,
    shpoRecords: [],
    thpoRecords: [],
    nacdTribesIdentified: [],
  };

  // ── LOCKED — previous sub-step not complete ──
  if (!unlocked) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 overflow-hidden opacity-60 pointer-events-none select-none">
        <div className="px-4 py-3 flex items-center gap-2 text-white/80" style={{ background: "#3f5a54" }}>
          <Lock className="w-4 h-4" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-70">SCIP · SECTION 4 · MAP 13 · LOCKED</div>
            <h2 className="font-heading font-bold text-base leading-tight">Compliance Report — Section 106 / NEPA</h2>
          </div>
        </div>
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Complete Map 12 (Power) to unlock the Target A compliance report.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap text-white" style={{ background: HC.green }}>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <div>
            <div className="text-[10px] font-mono tracking-[0.3em] opacity-80">SCIP · MAP 13 · COMPLIANCE</div>
            <h2 className="font-heading font-bold text-base leading-tight">Compliance Report — Section 106 / NEPA</h2>
            <div className="text-[11px] font-mono opacity-90 mt-0.5">30-day FCC NPA shot clocks · 47 CFR 1.1307 pre-screen</div>
          </div>
        </div>
        {done && (
          <Button onClick={() => setShowReport(true)} className="bg-white hover:bg-white/90 font-semibold shadow" style={{ color: HC.green }}>
            <FileText className="w-4 h-4 mr-2" /> Generate Compliance Report
          </Button>
        )}
      </div>

      {loading && <HawkFlightSpinner label="Pre-screening Target A for NEPA / Section 106…" />}

      {!loading && !done && (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          Pre-screen Target A against the 8 NEPA environmental triggers using the FEMA, wetlands, zoning and
          tower-height data already collected in this pipeline. Click{" "}
          <span className="font-semibold text-foreground">Run Compliance Report</span> below to begin.
        </div>
      )}

      {!loading && done && (
        <div className="p-4 space-y-4">
          <div className="flex gap-2 p-3 rounded-lg text-xs" style={{ border: `1.5px solid ${HC.amber}`, background: "rgba(255,184,0,0.08)" }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: HC.amber }} />
            <span>{DISCLAIMER}</span>
          </div>

          {notes.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <div className="font-semibold text-foreground">Auto-detected from pipeline data:</div>
              {notes.map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          )}

          <TriggersPanel
            flags={flags}
            determination={determination}
            onToggle={toggleFlag}
            disturbanceArea={disturbanceArea}
            disturbanceDepth={disturbanceDepth}
            projectType={projectType}
            onField={setField}
          />
        </div>
      )}

      {showReport && <ComplianceReport record={reportRecord} onClose={() => setShowReport(false)} />}

      {/* Run / Regenerate button row */}
      <div className="px-4 pb-4">
        <Button
          onClick={onRun}
          disabled={loading}
          variant={done ? "outline" : "default"}
          className={done ? "" : "text-white"}
          style={done ? { borderColor: HC.green, color: HC.green } : { background: HC.green }}
        >
          <Shield className="w-4 h-4 mr-2" />
          {done ? "Re-run Compliance Pre-Screen" : "Run Compliance Report"}
        </Button>
      </div>

      {/* hidden — badge label referenced so determination is always live */}
      <span className="hidden">{badge.label}</span>
    </div>
  );
}