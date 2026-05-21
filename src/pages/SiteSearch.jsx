import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import SearchForm from "../components/search/SearchForm";
import OrdinanceCard from "../components/search/OrdinanceCard";
import ResultCard from "../components/search/ResultCard";
import MapboxSatelliteMap from "../components/search/MapboxSatelliteMap";
import { Radio } from "lucide-react";
import AIChatPanel from "../components/search/AIChatPanel";
import PDFReportButton from "../components/search/PDFReportButton";
import HawkIcon from "../components/HawkIcon";
import FilterPanel from "../components/search/FilterPanel";
import ScanProgressLoader from "../components/search/ScanProgressLoader";
import DemoModeButton from "../components/search/DemoModeButton";
import DiagnosticsPanel from "../components/search/DiagnosticsPanel";
import RealieParcelsTable from "../components/search/RealieParcelsTable";
import { DEMO_RESULTS, DEMO_ORDINANCE } from "@/lib/demoData";
import { siteSearch } from "@/functions/siteSearch";
import { fccBroadbandLookup } from "@/functions/fccBroadbandLookup";
import { electricUtilityLookup } from "@/functions/electricUtilityLookup";
import { cellTowerLookup } from "@/functions/cellTowerLookup";
import { nearestAirport } from "@/functions/nearestAirport";
import { wetlandsLookup } from "@/functions/wetlandsLookup";
import { femaFloodLookup } from "@/functions/femaFloodLookup";
import { windSpeedLookup } from "@/functions/windSpeedLookup";
import { pointElevation } from "@/functions/pointElevation";
import { publicSafetyLookup } from "@/functions/publicSafetyLookup";
import { extractTelecomOrdinance } from "@/functions/extractTelecomOrdinance";
import { runSkipTrace } from "../components/search/SkipTraceButton";

const TIER_LIMITS = { blind: 0, free: 0, hawk_site: 1, hawkeyes: 5, hawkeye_apex: Infinity };

export default function SiteSearch() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [extraResults, setExtraResults] = useState([]);
  const [ordinance, setOrdinance] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [existingSearch, setExistingSearch] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [currentSearchId, setCurrentSearchId] = useState(null);
  const [filteredResultIds, setFilteredResultIds] = useState(null);
  const [skipTraceResults, setSkipTraceResults] = useState({});
  const [skipTraceAllLoading, setSkipTraceAllLoading] = useState(false);
  const [skipTraceAllProgress, setSkipTraceAllProgress] = useState(0);
  const mapImageGetterRef = useRef(null);

  useEffect(() => {
    async function init() {
      const me = await base44.auth.me();
      setUser(me);

      // Count monthly searches
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const allSearches = await base44.entities.SearchHistory.filter({ created_by: me.email }, "-created_date", 100);
      const monthly = allSearches.filter(s => new Date(s.created_date) >= monthStart);
      setSearchesThisMonth(monthly.length);

      // Check for search ID in URL
      const urlParams = new URLSearchParams(window.location.search);
      const searchId = urlParams.get("id");
      if (searchId) {
        const found = allSearches.find(s => s.id === searchId);
        if (found) {
          setExistingSearch(found);
          setSearchCenter({ lat: found.latitude, lon: found.longitude });
          if (found.ordinance_metadata) setOrdinance(found.ordinance_metadata);
          const existingResults = await base44.entities.SearchResult.filter({ search_id: searchId }, "-match_score", 5);
          setResults(existingResults);
        }
      }

      setPageLoading(false);
    }
    init();
  }, []);

  const handleSearch = async (latitude, longitude) => {
    // Require login for all scans (including free trial)
    if (!user) {
      base44.auth.redirectToLogin(window.location.href);
      return;
    }

    const tier = user?.tier || "free";
    const isAdmin = user?.role === "admin";
    const limit = isAdmin ? Infinity : (TIER_LIMITS[tier] ?? 0);
    const isFreeTrialEligible = (tier === "blind" || tier === "free") && !user.free_trial_used;

    if (!isAdmin && (!tier || tier === "blind" || tier === "free") && !isFreeTrialEligible) {
      toast({
        title: "Upgrade required",
        description: "Subscribe to Hawk Site or higher to start scanning.",
        variant: "destructive",
      });
      return;
    }

    if (!isAdmin && !isFreeTrialEligible && limit !== Infinity && searchesThisMonth >= limit) {
      toast({
        title: "Daily search limit reached",
        description: `Your ${tier === "hawk_site" ? "Hawk Site" : "Hawkeyes"} plan allows ${limit} Target Search${limit !== 1 ? "es" : ""}/day. Upgrade to continue.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResults([]);
    setExtraResults([]);
    setOrdinance(null);
    setScanError(null);
    // New site → reset pagination to offset 0
    setNextOffset(null);
    setHasMore(false);
    setSearchCenter({ lat: latitude, lon: longitude });

    // Create search history record
    const search = await base44.entities.SearchHistory.create({
      latitude,
      longitude,
      status: "pending",
      search_label: `Scan @ ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    });

    // Call via Base44 backend proxy — always starts at offset 0 for a new site
    let res, data;
    try {
      res = await siteSearch({ lat: latitude, lon: longitude, radius_miles: 0.5, offset: 0 });
      data = res.data;
    } catch (err) {
      // OFFLINE FALLBACK: if the live scan completely fails (network/API down), serve demo data
      // so a live presentation never shows a red error screen.
      console.warn("[SiteSearch] Live scan failed — serving offline demo fallback:", err);
      await base44.entities.SearchHistory.update(search.id, { status: "failed" });
      navigate("/results", {
        state: {
          results: DEMO_RESULTS,
          ordinance: DEMO_ORDINANCE,
          searchCenter: { lat: latitude, lon: longitude },
          searchId: search.id,
          usage: { searches_used_today: searchesThisMonth + 1, daily_search_limit: 999 },
          plan: { id: tier, features: { exports: ["pdf", "csv"], mailer: true, skip_trace: true } },
          isDemo: true,
          fallbackReason: "Live data temporarily unavailable — showing sample results.",
        },
      });
      setLoading(false);
      return;
    }

    if (data.error) {
      setScanError(data.error);
      await base44.entities.SearchHistory.update(search.id, { status: "failed" });
      setLoading(false);
      return;
    }

    let ordinanceMetadata = data.ordinance || null;

    // Backend returns exactly 3 parcels per page
    const parcels = (data.candidates || []).slice(0, 3);
    setNextOffset(data.next_offset ?? null);
    setHasMore(Boolean(data.has_more));

    const ordinanceExtraction = await extractTelecomOrdinance({
      lat: latitude,
      lon: longitude,
      ordinance: data.ordinance || null,
      candidates: parcels,
    });

    if (ordinanceExtraction.data?.ordinance_metadata) {
      ordinanceMetadata = {
        ...(data.ordinance || {}),
        ...ordinanceExtraction.data.ordinance_metadata,
      };
      setOrdinance(ordinanceMetadata);
    }

    // Look up all external data sources in parallel
    const [airportLookups, cellTowerLookups, fccLookups, wetlandLookups, femaLookups, windLookups, utilityLookups, elevationLookups, publicSafetyLookups] = await Promise.all([
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await nearestAirport({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await cellTowerLookup({ lat: parcel.latitude, lon: parcel.longitude, radius_miles: 2 });
            return res.data || { towers: [] };
          } catch (e) { return { towers: [] }; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await fccBroadbandLookup({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await wetlandsLookup({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await femaFloodLookup({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await windSpeedLookup({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await electricUtilityLookup({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await pointElevation({ lat: parcel.latitude, lon: parcel.longitude });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
      Promise.all(
        parcels.map(async (parcel) => {
          try {
            const res = await publicSafetyLookup({ lat: parcel.latitude, lon: parcel.longitude, radius_miles: 15 });
            return res.data || {};
          } catch (e) { return {}; }
        })
      ),
    ]);

    // Save results to DB
    const savedResults = [];
    for (let i = 0; i < parcels.length; i++) {
      const parcel = parcels[i];
      const airport = airportLookups[i] || {};
      const cellTowers = cellTowerLookups[i]?.towers || [];
      const fcc = fccLookups[i] || {};
      const wetlands = wetlandLookups[i] || {};
      const fema = femaLookups[i] || {};
      const wind = windLookups[i] || {};
      const utility = utilityLookups[i] || {};
      const elevation = elevationLookups[i] || {};
      const safety = publicSafetyLookups[i] || {};
      const saved = await base44.entities.SearchResult.create({
        search_id: search.id,
        site_name: parcel.site_name,
        owner_name: parcel.owner_name,
        parcel_address: parcel.parcel_address,
        parcel_id: parcel.parcel_id,
        parcel_size_acres: parcel.parcel_size_acres,
        zoning_classification: parcel.zoning,
        owner_mailing_address: parcel.owner_mailing_address,
        latitude: parcel.latitude,
        longitude: parcel.longitude,
        parcel_geometry: parcel.parcel_geometry || null,
        fema_risk_factor: fema.fema_zone || parcel.fema_risk,
        fema_zone_description: fema.fema_zone_description || null,
        fema_risk_level: fema.fema_risk_level || null,
        fema_sfha: fema.sfha ?? null,
        fema_bfe: fema.static_bfe ?? null,
        fema_zone_subtype: fema.zone_subtype ?? null,
        phone: parcel.phone,
        email: parcel.email,
        match_score: parcel.match_score,
        airport_iata: airport.iata || airport.icao || null,
        airport_name: airport.name ? `${airport.name}${airport.city ? ' · ' + airport.city : ''}${airport.state ? ', ' + airport.state : ''}` : null,
        airport_distance_miles: airport.distance_miles || null,
        airport_lat: airport.lat || null,
        airport_lon: airport.lon || null,
        cell_towers: cellTowers,
        fiber_providers: fcc.fiber_providers || [],
        has_fiber: fcc.has_fiber ?? null,
        fiber_distance_miles: fcc.fiber_distance_miles ?? null,
        fiber_infrastructure_type: fcc.fiber_infrastructure_type || null,
        fiber_operator: fcc.fiber_operator || null,
        power_utility: utility.utility_name || fcc.power_utility || null,
        utility_type: utility.utility_type || null,
        utility_holding_company: utility.holding_company || null,
        utility_website: utility.website && utility.website !== "NOT AVAILABLE" ? utility.website : null,
        utility_phone: utility.telephone && utility.telephone !== "NOT AVAILABLE" ? utility.telephone : null,
        utility_control_area: utility.control_area && utility.control_area !== "NOT AVAILABLE" ? utility.control_area : null,
        utility_customers: utility.customers || null,
        utility_overlapping: utility.overlapping_territories || [],
        fcc_block_geoid: fcc.fcc_block_geoid || null,
        transmission_line_distance_miles: fcc.transmission_line_distance_miles || null,
        transmission_line_voltage: fcc.transmission_line_voltage || null,
        wetlands_present: wetlands.wetlands_present ?? null,
        wetland_types: wetlands.wetland_types || [],
        wetland_proximity: wetlands.wetland_proximity ?? null,
        wetland_type: wetlands.wetland_type ?? null,
        wetland_code: wetlands.wetland_code ?? null,
        wetland_acres: wetlands.wetland_acres ?? null,
        wetlands_map_url: wetlands.wetlands_map_url ?? null,
        wetlands_topo_map_url: wetlands.wetlands_topo_map_url ?? null,
        wetlands_detail_map_url: wetlands.wetlands_detail_map_url ?? null,
        wind_speed_mph: wind.wind_speed_mph ?? null,
        wind_mri: wind.wind_mri || null,
        wind_risk_level: wind.wind_risk_level || null,
        in_hurricane_prone_region: wind.in_hurricane_prone_region ?? null,
        in_special_wind_region: wind.in_special_wind_region ?? null,
        ground_elevation_ft: elevation.elevation_ft ?? null,
        police_name: safety.police?.name ?? null,
        police_address: safety.police?.address ?? null,
        police_phone: safety.police?.phone ?? null,
        police_distance_miles: safety.police?.distance_miles ?? null,
        fire_name: safety.fire?.name ?? null,
        fire_address: safety.fire?.address ?? null,
        fire_phone: safety.fire?.phone ?? null,
        fire_distance_miles: safety.fire?.distance_miles ?? null,
      });
      savedResults.push({ ...saved, match_reason: parcel.match_reason });
    }

    // Update search history
    await base44.entities.SearchHistory.update(search.id, {
      status: "completed",
      results_count: savedResults.length,
      ordinance_metadata: ordinanceMetadata,
    });

    // Auto-save all results to CRM for free trial users so we capture their lead data
    if (isFreeTrialEligible) {
      for (const r of savedResults) {
        try {
          await base44.entities.CRMDeal.create({
            owner_name: r.owner_name || "Unknown Owner",
            parcel_address: r.parcel_address,
            owner_mailing_address: r.owner_mailing_address,
            candidate_id: r.id,
            search_id: search.id,
            stage: "prospect",
            phone: r.phone || null,
            email: r.email || null,
            match_score: r.match_score,
            latitude: r.latitude,
            longitude: r.longitude,
            notes: `Free trial scan — auto-captured on ${new Date().toLocaleDateString()}`,
          });
        } catch (_) { /* silently continue */ }
      }
    }

    setResults(savedResults);
    setCurrentSearchId(search.id);
    setSearchesThisMonth((prev) => prev + 1);
    setLoading(false);

    // Navigate to the interactive results page
    const dailyLimit = TIER_LIMITS[tier] === Infinity ? 999 : (TIER_LIMITS[tier] || 1);
    navigate("/results", {
      state: {
        results: savedResults,
        ordinance: ordinanceMetadata,
        searchCenter: { lat: latitude, lon: longitude },
        searchId: search.id,
        usage: data.usage || { searches_used_today: searchesThisMonth + 1, daily_search_limit: dailyLimit },
        plan: data.plan || { id: tier, features: { exports: tier !== "hawk_site" ? ["pdf", "csv"] : [], mailer: tier === "hawkeye_apex", skip_trace: tier === "hawkeye_apex" } },
      },
    });
  };

  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const tier = user?.tier || "free";
  const isAdmin = user?.role === "admin";
  const limit = isAdmin ? Infinity : (TIER_LIMITS[tier] ?? 0);
  const isFreeTrialEligible = (tier === "blind" || tier === "free") && !user?.free_trial_used;
  const isBlind = !isAdmin && (!tier || tier === "blind" || tier === "free") && !isFreeTrialEligible;
  const atLimit = !isAdmin && (isBlind || (limit !== Infinity && !isFreeTrialEligible && searchesThisMonth >= limit));

  const handleSkipTraceResult = (candidateId, data) => {
    setSkipTraceResults(prev => ({ ...prev, [candidateId]: data }));
  };

  const handleSkipTraceAll = async () => {
    const allCandidates = [...results, ...extraResults];
    setSkipTraceAllLoading(true);
    setSkipTraceAllProgress(0);
    for (let i = 0; i < allCandidates.length; i++) {
      const c = allCandidates[i];
      if (!skipTraceResults[c.id]) {
        const data = await runSkipTrace({
          owner_name: c.owner_name,
          mailing_address: c.owner_mailing_address,
          candidate_id: c.id,
          search_id: currentSearchId,
        });
        setSkipTraceResults(prev => ({ ...prev, [c.id]: data }));
      }
      setSkipTraceAllProgress(i + 1);
    }
    setSkipTraceAllLoading(false);
  };

  const handleNeedMore = async () => {
    if (atLimit || nextOffset == null) return;
    setLoadingMore(true);
    const res = await siteSearch({
      lat: searchCenter.lat,
      lon: searchCenter.lon,
      radius_miles: 0.5,
      offset: nextOffset,
    });
    const data = res.data;
    const extra = (data.candidates || []).slice(0, 3);
    const search = await base44.entities.SearchHistory.create({
      latitude: searchCenter.lat,
      longitude: searchCenter.lon,
      status: "completed",
      results_count: extra.length,
      search_label: `More Results @ ${searchCenter.lat.toFixed(4)}, ${searchCenter.lon.toFixed(4)} (offset ${nextOffset})`,
    });
    const saved = [];
    for (const parcel of extra) {
      const r = await base44.entities.SearchResult.create({
        search_id: search.id,
        site_name: parcel.site_name,
        owner_name: parcel.owner_name,
        parcel_address: parcel.parcel_address,
        parcel_id: parcel.parcel_id,
        parcel_size_acres: parcel.parcel_size_acres,
        zoning_classification: parcel.zoning,
        owner_mailing_address: parcel.owner_mailing_address,
        latitude: parcel.latitude,
        longitude: parcel.longitude,
        fema_risk_factor: parcel.fema_risk,
        phone: parcel.phone,
        email: parcel.email,
        match_score: parcel.match_score,
      });
      saved.push({ ...r, match_reason: parcel.match_reason });
    }
    // Append to extraResults so successive "Need More" calls accumulate
    setExtraResults((prev) => [...prev, ...saved]);
    setNextOffset(data.next_offset ?? null);
    setHasMore(Boolean(data.has_more));
    setSearchesThisMonth((prev) => prev + 1);
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      {/* AI Chat toggle button — paid subscribers only */}
      {!isBlind && (
      <button
        onClick={() => setChatOpen((o) => !o)}
        className="fixed right-6 bottom-8 z-40 w-14 h-14 rounded-full bg-[#0C1B2E] shadow-xl flex items-center justify-center hover:scale-105 transition-transform border border-[#2563A0]"
        title="SiteHawk Vision"
      >
        <HawkIcon size={36} />
      </button>
      )}

      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        searchId={currentSearchId}
        candidates={[...results, ...extraResults]}
        ordinance={ordinance}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">Site Search</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isFreeTrialEligible
              ? "🎁 You have 1 free trial scan — enter coordinates to see it in action."
              : isBlind
              ? "Subscribe to Hawk Site or higher to start scanning."
              : "Enter coordinates to find buildable parcels for a 199-ft cell tower"}
          </p>
        </div>
        {isAdmin && <DemoModeButton />}
      </div>

      {/* Search Form */}
      <SearchForm onSearch={handleSearch} isLoading={loading} disabled={atLimit} />

      {/* Integration Diagnostics — green/red dots per integration */}
      <DiagnosticsPanel />

      {scanError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <span className="text-destructive text-sm font-medium">Error: {scanError}</span>
        </div>
      )}

      {atLimit && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-destructive text-sm font-medium">
            {isBlind
              ? "Your free trial scan has been used. Subscribe to Hawk Site or higher to continue scanning."
              : `You've reached your daily limit of ${limit} Target Search${limit !== 1 ? "es" : ""}. Upgrade your plan to continue.`}
          </p>
          <a href="/pricing" className="text-xs text-primary underline mt-1 inline-block">View upgrade options →</a>
        </div>
      )}

      {/* Map — only renders after scan completes */}
      {(searchCenter || loading) && (
        <MapboxSatelliteMap
          centerLat={searchCenter?.lat}
          centerLon={searchCenter?.lon}
          results={[...results, ...extraResults]}
          loading={loading}
          mapImageGetterRef={mapImageGetterRef}
          filteredResultIds={filteredResultIds}
        />
      )}

      {/* Realie parcels within 1-mile ring — source for owner mailers */}
      {searchCenter && !loading && (
        <RealieParcelsTable
          centerLat={searchCenter.lat}
          centerLon={searchCenter.lon}
          searchId={currentSearchId}
        />
      )}

      {/* Loading state — progressive AI scan loader */}
      {loading && <ScanProgressLoader />}

      {/* Results */}
      {ordinance && <OrdinanceCard ordinance={ordinance} />}

      {results.length > 0 && !loading && (
        <div className="space-y-4">
          <FilterPanel
            results={results}
            extraResults={extraResults}
            onFilterChange={(ids) => setFilteredResultIds(ids)}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-primary" />
              <h2 className="font-heading font-semibold text-lg text-foreground">
                Top {results.length} Candidate Parcels
              </h2>
            </div>
            <button
              onClick={handleSkipTraceAll}
              disabled={skipTraceAllLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold transition-all disabled:opacity-60"
            >
              {skipTraceAllLoading ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Tracing {skipTraceAllProgress}/{results.length + extraResults.length}...</>
              ) : (
                <>📞 Skip Trace All</>
              )}
            </button>
          </div>
          {results.map((result, idx) => (
            <div key={result.id} className={filteredResultIds && !filteredResultIds.has(result.id) ? "opacity-30 pointer-events-none" : ""}>
              <ResultCard
                result={result}
                rank={idx + 1}
                searchId={currentSearchId}
                skipTraceResult={skipTraceResults[result.id]}
                onSkipTraceResult={(data) => handleSkipTraceResult(result.id, data)}
                ordinance={ordinance}
              />
            </div>
          ))}

          {extraResults.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <Radio className="w-5 h-5 text-accent" />
                <h2 className="font-heading font-semibold text-lg text-foreground">Additional Candidates</h2>
              </div>
              {extraResults.map((result, idx) => (
                <div key={result.id} className={filteredResultIds && !filteredResultIds.has(result.id) ? "opacity-30 pointer-events-none" : ""}>
                  <ResultCard
                    result={result}
                    rank={results.length + idx + 1}
                    searchId={currentSearchId}
                    skipTraceResult={skipTraceResults[result.id]}
                    onSkipTraceResult={(data) => handleSkipTraceResult(result.id, data)}
                    ordinance={ordinance}
                  />
                </div>
              ))}
            </>
          )}

          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={handleNeedMore}
                disabled={loadingMore || atLimit || nextOffset == null}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Loading more...</>
                ) : (
                  <>Need More? Get Next 3 Candidates</>
                )}
              </button>
              {atLimit && <p className="text-xs text-muted-foreground mt-2">Upgrade your plan to run more searches.</p>}
            </div>
          )}

          {/* PDF Download — gated to Hawkeyes+ */}
          <div className="flex justify-center pt-4 pb-2">
            {tier === "hawkeyes" || tier === "hawkeye_apex" ? (
              <PDFReportButton
                results={results}
                extraResults={extraResults}
                ordinance={ordinance}
                searchCenter={searchCenter}
                mapImageGetterRef={mapImageGetterRef}
                skipTraceResults={skipTraceResults}
              />
            ) : (
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-accent/40 bg-accent/5 text-accent text-sm font-semibold hover:bg-accent/10 transition-all"
              >
                ⬆ Upgrade to Hawkeyes for PDF & CSV Exports
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}