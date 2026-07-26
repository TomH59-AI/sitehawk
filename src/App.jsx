/*
 * DEAD CODE PURGE — 2026-05-31
 * ----------------------------
 * Conservative orphan-cleanup pass. Per the safety rules, NOTHING was deleted
 * this pass — the audit found no provably-unreachable code that could be removed
 * without risk to Sections 1–8 or to not-yet-built Sections 9+ (rule F).
 *
 * AUDIT RESULTS (the headline concern — background scans on cold load):
 *   - App.jsx — only warms loadPublicConfig() (Mapbox token). No FEMA/NWI/EPA/
 *     parcel/zoning/utility/propagation/Cesium/OpenCellID/FCC/CloudRF/Realie/
 *     Enformion/Notion/airport/cell-tower/wind/infrastructure/viewshed calls on
 *     mount. CLEAN.
 *   - lib/AuthContext.jsx — auth.me() + referral register only. CLEAN (rule E).
 *   - lib/PipelineContext.jsx — pure useState store, no network. CLEAN.
 *   - components/Layout.jsx — auth.me() admin check only. CLEAN.
 *   Conclusion: no stale shared hook fires a section scan outside its gated
 *   pipelineStep. Nothing to remove or re-gate.
 *
 * FLAGGED — NEEDS HUMAN REVIEW (NOT deleted — could not be proven 100% orphan,
 * and/or fall under the Section 9+ "results / scoring / deliverable" carve-out):
 *   - components/SiteSearchResults.jsx — exported, not a route, references a
 *     scan-results/scoring/buildability shape + an inline CandidateCard. Could be
 *     legacy from the pre-refactor results view OR intended for a Section 9+
 *     results panel. LEFT ALONE (rule B + rule F). Tom: confirm before removing.
 *   - components/scan/* (CandidateCard, ScanResultsSidebar, RFCoveragePanel,
 *     OwnerMailerCard, ResultsFilterSort, etc.) — results/scoring flavored,
 *     reachable via /results. LEFT ALONE (rule F).
 *
 * No env vars, secrets, shared utilities, design tokens, the hawk icon, the
 * loader, routes, or pipeline logic were touched.
 */
import { useState, useEffect } from 'react';
import { loadPublicConfig } from '@/lib/publicConfig';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PipelineProvider } from '@/lib/PipelineContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import SiteSearch from './pages/SiteSearch';
import Pricing from './pages/Pricing';
import About from './pages/About';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import PrivacyPolicyPublic from './pages/PrivacyPolicyPublic';
import ScanResults from './pages/ScanResults';
import SendUpdate from './pages/SendUpdate';
import MailOrders from './pages/MailOrders';
import CRM from './pages/CRM';
import HubSpotIntegration from './pages/HubSpotIntegration';
import RefundPolicy from './pages/RefundPolicy';
import MailAnalytics from './pages/MailAnalytics';
import SCIPPreview from './pages/SCIPPreview';
import SCIPShareView from './pages/SCIPShareView';
import PowerLinesDashboard from './pages/PowerLinesDashboard';
import SitePowerMap from './pages/SitePowerMap';
import HawkFrequency from './pages/HawkFrequency';
import CoverageAnalysis from './pages/CoverageAnalysis';
import InfrastructureIntelligence from './pages/InfrastructureIntelligence';
import ScipNew from './pages/ScipNew';
import ScipDetail from './pages/ScipDetail';
import ScipStudio from './pages/ScipStudio';
import HawkScip from './pages/HawkScip';
import HawkDocs from './pages/HawkDocs';
import HawkDocShareView from './pages/HawkDocShareView';
import SubscriberCRM from './pages/SubscriberCRM';
import UsageAnalytics from './pages/UsageAnalytics';
import PlansSelection from './pages/PlansSelection';
import HawkTracker from './pages/HawkTracker';
import PilotTracker from './pages/PilotTracker';
import TowerSiter from './pages/TowerSiter';
import Tower3DViewer from './pages/Tower3DViewer';
import CesiumTowerViewer from './pages/CesiumTowerViewer';
import Photo3DViewer from './pages/Photo3DViewer';
import HawkLease from './pages/HawkLease';
import HawkLeaseDashboard from './pages/hawklease/HawkLeaseDashboard';
import HawkLeaseSites from './pages/hawklease/HawkLeaseSites';
import HawkLeaseSiteDetail from './pages/hawklease/HawkLeaseSiteDetail';
import HawkLeaseComps from './pages/hawklease/HawkLeaseComps';
import HawkLeaseReports from './pages/hawklease/HawkLeaseReports';
import HawkFill from './pages/HawkFill';
import HawkFit from './pages/HawkFit';
import HawkForms from './pages/HawkForms';
import HawkLaw from './pages/HawkLaw';
import FollowUpTrackerPage from './pages/FollowUpTrackerPage';
import TowerFitExhibit from './pages/TowerFitExhibit';
import Billing from './pages/Billing';
import PricingV2 from './pages/PricingV2';
import HawkLawNewAnalysis from './pages/hawklaw/HawkLawNewAnalysis';
import HawkLawSessions from './pages/hawklaw/HawkLawSessions';
import HawkLawSessionDetail from './pages/hawklaw/HawkLawSessionDetail';
import HawkLawClauses from './pages/hawklaw/HawkLawClauses';
import HawkLawHistory from './pages/hawklaw/HawkLawHistory';
import FiberLayersAdmin from './pages/FiberLayersAdmin';
import RfiEngine from './pages/RfiEngine';
import ZoningVerifier from './pages/ZoningVerifier';
import OrdinanceHunter from './pages/OrdinanceHunter';
import AnthemNetScip from './pages/AnthemNetScip';
import SkipTrace from './pages/SkipTrace';
import HawkVision from './pages/HawkVision';

import SplashScreen from './components/SplashScreen';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import AppProtection from './components/security/AppProtection';

function AppWithSplash() {
  const [splashDone, setSplashDone] = useState(false);
  // Warm the public config (Mapbox token) at app boot so the FIRST Section 1
  // SARF render never waits on a cold backend round-trip.
  useEffect(() => { loadPublicConfig().catch(() => {}); }, []);
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />;
  return <AuthenticatedApp />;
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/scip-share" element={<SCIPShareView />} />
      <Route path="/hawk-doc-share" element={<HawkDocShareView />} />
      {/* PUBLIC privacy policy — required URL for Apple App Store / createPlus */}
      <Route path="/privacy-policy" element={<PrivacyPolicyPublic />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/search" element={<SiteSearch />} />
        <Route path="/pricing" element={<PricingV2 />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/plans-selection" element={<PlansSelection />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/results" element={<ScanResults />} />
        <Route path="/send-update" element={<SendUpdate />} />
        <Route path="/mail-orders" element={<MailOrders />} />
        <Route path="/crm" element={<CRM />} />
        <Route path="/skip-trace" element={<SkipTrace />} />
        <Route path="/hubspot" element={<HubSpotIntegration />} />
        <Route path="/subscriber-crm" element={<SubscriberCRM />} />
        <Route path="/usage-analytics" element={<UsageAnalytics />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/mail-analytics" element={<MailAnalytics />} />
        <Route path="/scip" element={<SCIPPreview />} />
        <Route path="/power-lines" element={<PowerLinesDashboard />} />
        <Route path="/site-power-map" element={<SitePowerMap />} />
        <Route path="/hawk-frequency" element={<HawkFrequency />} />
        <Route path="/coverage-analysis" element={<CoverageAnalysis />} />
        <Route path="/InfrastructureIntelligence" element={<InfrastructureIntelligence />} />
        {/* Admin-only ScipHawk fiber KMZ importer */}
        <Route path="/fiber-layers-admin" element={<FiberLayersAdmin />} />
        {/* RF Intelligence Engine — standalone nationwide RF map module */}
        <Route path="/rfi-engine" element={<RfiEngine />} />
        {/* Hawk Zoning Verifier — AI agent for zoning accuracy checks */}
        <Route path="/zoning-verifier" element={<ZoningVerifier />} />
        {/* Ordinance Hunter — super agent: scrape → extract → registry → Notion */}
        <Route path="/ordinance-hunter" element={<OrdinanceHunter />} />
        <Route path="/scip/new" element={<ScipNew />} />
        <Route path="/scip/:id" element={<ScipDetail />} />
        {/* SCIP Document Studio — new report suite; legacy SCIP form stays untouched */}
        <Route path="/scip/:id/studio" element={<ScipStudio />} />
        <Route path="/scip/:id/hawk" element={<HawkScip />} />
        {/* AnthemNet-format SCIP — auto-populated carrier submittal package */}
        <Route path="/scip/:id/anthemnet" element={<AnthemNetScip />} />
        <Route path="/hawk-docs" element={<HawkDocs />} />
        <Route path="/hawk-fill" element={<HawkFill />} />
        {/* HawkFit Map — interactive tower-siting with Realie lookup */}
        <Route path="/hawkfit-map" element={<HawkFit />} />
        <Route path="/hawk-forms" element={<HawkForms />} />
        <Route path="/hawk-tracker" element={<HawkTracker />} />
        {/* Simplified read-only tracker view for pilot clients */}
        <Route path="/pilot-tracker" element={<PilotTracker />} />
        <Route path="/follow-up-tracker" element={<FollowUpTrackerPage />} />
        <Route path="/tower-fit-exhibit" element={<TowerFitExhibit />} />
        {/* HawkPerch — feature_tower_siter ships dark: route exists, no nav link */}
        <Route path="/tower-siter" element={<TowerSiter />} />
        <Route path="/tower-3d-viewer" element={<Tower3DViewer />} />
        {/* Interactive Cesium scene for a Tower3DRender (viewer_html_url target) */}
        <Route path="/cesium-tower-viewer" element={<CesiumTowerViewer />} />
        <Route path="/photo-3d-viewer" element={<Photo3DViewer />} />
        {/* HawkVision — upload a parcel photo → AI composites tower + compound + landscaping */}
        <Route path="/hawk-vision" element={<HawkVision />} />
        {/* HawkLease */}
        <Route path="/hawk-lease" element={<HawkLease />}>
          <Route index element={<HawkLeaseDashboard />} />
          <Route path="sites" element={<HawkLeaseSites />} />
          <Route path="sites/:id" element={<HawkLeaseSiteDetail />} />
          <Route path="comps" element={<HawkLeaseComps />} />
          <Route path="reports" element={<HawkLeaseReports />} />
        </Route>
        {/* Hawk Law */}
        <Route path="/hawk-law" element={<HawkLaw />}>
          <Route index element={<HawkLawNewAnalysis />} />
          <Route path="sessions" element={<HawkLawSessions />} />
          <Route path="sessions/:id" element={<HawkLawSessionDetail />} />
          <Route path="clauses" element={<HawkLawClauses />} />
          <Route path="history" element={<HawkLawHistory />} />
        </Route>
        {/* Unknown/stale links land on the Dashboard instead of a 404 sheet */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <PipelineProvider>
          <Router>
            <AppWithSplash />
          </Router>
          <Toaster />
          <AppProtection />
          <PWAInstallPrompt />
        </PipelineProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App