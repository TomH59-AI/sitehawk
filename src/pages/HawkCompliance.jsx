/*
 * ============================================================================
 *  HAWK COMPLIANCE v1 — 2026-06-01
 * ----------------------------------------------------------------------------
 *  Standalone Section 106 / NEPA regulatory clearance tool. Peer of /hawk-docs
 *  and /hawklaw — NOT part of the SiteSearch pipeline (Sections 1–8). Reads from
 *  ScipRecord (which Sections 1–8 populate); writes only to ComplianceCheck.
 *
 *  ADDED IN v1:
 *  • Entity:   ComplianceCheck (linked to ScipRecord via scipRecordId)
 *  • Entity:   User.hawk_compliance_active (feature-gate flag)
 *  • Pages:    pages/HawkCompliance.jsx (portfolio + site dashboard + gate)
 *  • Routes:   /hawk-compliance, /hawk-compliance/:siteId
 *  • Nav:      "Hawk Compliance" (Shield) added to Layout after /hawklaw
 *  • Components: components/compliance/* (Locked, PortfolioSummary,
 *               ShotClocksWidget, PortfolioTable, SiteDashboard, TriggersPanel,
 *               ShpoPanel, ThpoPanel, ShotClockBar, AuditTimeline,
 *               complianceConst.js, preScreen.js)
 *  • Backend:  stripeCheckout (compliance_checkout/complete_compliance actions),
 *               stripeWebhook (hawk_compliance unlock/lock)
 *  • Stripe:   Product "Hawk Compliance" (prod_UcYtZTxwTUoYEE)
 *               Price $99/mo (price_1TdJlxIE4fOP88RJBeqKRVgw)
 *
 *  PHASE 1 SCOPE: pre-screen reads existing ScipRecord data only. External
 *  lookups (EPA Envirofacts, USFWS Critical Habitat, NPS Historic Districts,
 *  NPS NACD tribal) + Form 620/621 PDF packet generators are stubbed / pending.
 * ============================================================================
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { stripeCheckout } from "@/functions/stripeCheckout";
import { Shield } from "lucide-react";
import HawkFlightSpinner from "../components/search/HawkFlightSpinner";
import ComplianceLocked from "../components/compliance/ComplianceLocked";
import PortfolioSummary from "../components/compliance/PortfolioSummary";
import ShotClocksWidget from "../components/compliance/ShotClocksWidget";
import PortfolioTable from "../components/compliance/PortfolioTable";
import SiteDashboard from "../components/compliance/SiteDashboard";
import { preScreenFromScip, scipDisplay } from "../components/compliance/preScreen";
import { computeDetermination, HC } from "../components/compliance/complianceConst";

export default function HawkCompliance() {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [scips, setScips] = useState([]);
  const [activeRecord, setActiveRecord] = useState(null);

  // Confirm Stripe checkout success then unlock.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      stripeCheckout({ action: "complete_compliance" }).finally(() => {
        window.history.replaceState({}, "", "/hawk-compliance");
        boot();
      });
    } else {
      boot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function boot() {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setUser(me);
      if (!me?.hawk_compliance_active && me?.role !== "admin") { setLoading(false); return; }
      const [recs, sc] = await Promise.all([
        base44.entities.ComplianceCheck.list("-updated_date", 200),
        base44.entities.ScipRecord.list("-created_date", 200),
      ]);
      setRecords(recs);
      setScips(sc);
    } finally {
      setLoading(false);
    }
  }

  // When a siteId is in the URL, load-or-create the compliance record for it.
  useEffect(() => {
    if (loading || !user || (!user.hawk_compliance_active && user.role !== "admin")) return;
    if (!siteId) { setActiveRecord(null); return; }
    ensureRecord(siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, loading, user, records, scips]);

  async function ensureRecord(scipRecordId) {
    let rec = records.find((r) => r.scipRecordId === scipRecordId);
    if (!rec) {
      // Pre-screen from the ScipRecord and create a fresh ComplianceCheck.
      const scip = scips.find((s) => s.id === scipRecordId) || await base44.entities.ScipRecord.get(scipRecordId).catch(() => null);
      if (!scip) { navigate("/hawk-compliance"); return; }
      const { flags, notes } = preScreenFromScip(scip);
      const d = scipDisplay(scip);
      const determination = computeDetermination(flags, 0, "new_tower");
      rec = await base44.entities.ComplianceCheck.create({
        scipRecordId,
        siteName: d.siteName,
        ownerName: d.ownerName,
        projectType: "new_tower",
        nepaTriggerFlags: flags,
        nepaDetermination: determination,
        shpoRecords: [],
        thpoRecords: [],
        nacdTribesIdentified: [],
        documents: [],
        auditLog: [{ timestamp: new Date().toISOString(), user: user.email, action: "pre_screen", field: "", oldValue: "", newValue: determination, note: notes.join(" | ") }],
      });
      setRecords((p) => [rec, ...p]);
    }
    setActiveRecord(rec);
  }

  if (loading) return <HawkFlightSpinner label="Loading Hawk Compliance…" />;

  if (!user?.hawk_compliance_active && user?.role !== "admin") return <ComplianceLocked />;

  if (siteId) {
    if (!activeRecord) return <HawkFlightSpinner label="Pre-screening site…" />;
    return <SiteDashboard record={activeRecord} userEmail={user.email} onBack={() => navigate("/hawk-compliance")} />;
  }

  // Portfolio view
  const linkedIds = new Set(records.map((r) => r.scipRecordId));
  const unlinkedScips = scips.filter((s) => !linkedIds.has(s.id));

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-6 h-6" style={{ color: HC.green }} />
        <h1 className="text-2xl font-heading font-bold">Hawk Compliance</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Section 106 / NEPA clearance cockpit · 30-day FCC NPA shot clocks</p>

      <PortfolioSummary records={records} />
      <ShotClocksWidget records={records} />
      <PortfolioTable records={records} unlinkedScips={unlinkedScips} />
    </div>
  );
}