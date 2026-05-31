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
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
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
import ScanResults from './pages/ScanResults';
import SendUpdate from './pages/SendUpdate';
import MailOrders from './pages/MailOrders';
import CRM from './pages/CRM';
import RefundPolicy from './pages/RefundPolicy';
import ParcelScout from './pages/ParcelScout';
import AIVisionAnalyzer from './pages/AIVisionAnalyzer';
import MarketAnalytics from './pages/MarketAnalytics';
import MailAnalytics from './pages/MailAnalytics';
import TowerPlacement from './pages/TowerPlacement';
import SCIPPreview from './pages/SCIPPreview';
import SCIPShareView from './pages/SCIPShareView';
import PowerLinesDashboard from './pages/PowerLinesDashboard';
import HawkFrequency from './pages/HawkFrequency';
import Infrastructure from './pages/Infrastructure';
import CoverageAnalysis from './pages/CoverageAnalysis';
import SiteEvaluate from './pages/SiteEvaluate';
import SARFMap from './pages/SARFMap';
import ScipNew from './pages/ScipNew';
import ScipDetail from './pages/ScipDetail';
import HawkLaw from './pages/HawkLaw';
import HawkDocs from './pages/HawkDocs';

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
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/search" element={<SiteSearch />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/results" element={<ScanResults />} />
        <Route path="/send-update" element={<SendUpdate />} />
        <Route path="/mail-orders" element={<MailOrders />} />
        <Route path="/crm" element={<CRM />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/parcel-scout" element={<ParcelScout />} />
        <Route path="/ai-vision" element={<AIVisionAnalyzer />} />
        <Route path="/market-analytics" element={<MarketAnalytics />} />
        <Route path="/mail-analytics" element={<MailAnalytics />} />
        <Route path="/tower-placement" element={<TowerPlacement />} />
        <Route path="/scip" element={<SCIPPreview />} />
        <Route path="/power-lines" element={<PowerLinesDashboard />} />
        <Route path="/hawk-frequency" element={<HawkFrequency />} />
        <Route path="/infrastructure" element={<Infrastructure />} />
        <Route path="/coverage-analysis" element={<CoverageAnalysis />} />
        <Route path="/dashboard/evaluate" element={<SiteEvaluate />} />
        <Route path="/sarf-map" element={<SARFMap />} />
        <Route path="/scip/new" element={<ScipNew />} />
        <Route path="/scip/:id" element={<ScipDetail />} />
        <Route path="/hawklaw" element={<HawkLaw />} />
        <Route path="/hawk-docs" element={<HawkDocs />} />
        <Route path="*" element={<PageNotFound />} />
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