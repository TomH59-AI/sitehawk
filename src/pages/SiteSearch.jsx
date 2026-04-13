import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import SearchForm from "../components/search/SearchForm";
import OrdinanceCard from "../components/search/OrdinanceCard";
import ResultCard from "../components/search/ResultCard";
import MapboxSatelliteMap from "../components/search/MapboxSatelliteMap";
import { Radio } from "lucide-react";
import AIChatPanel from "../components/search/AIChatPanel";
import PDFReportButton from "../components/search/PDFReportButton";
import HawkIcon from "../components/HawkIcon";

const TIER_LIMITS = { blind: 0, free: 0, monthly: 50, annual: 50, pro: 50 };

export default function SiteSearch() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [extraResults, setExtraResults] = useState([]);
  const [ordinance, setOrdinance] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [existingSearch, setExistingSearch] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [currentSearchId, setCurrentSearchId] = useState(null);
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
          const existingResults = await base44.entities.SearchResult.filter({ search_id: searchId }, "-match_score", 5);
          setResults(existingResults);
        }
      }

      setPageLoading(false);
    }
    init();
  }, []);

  const handleSearch = async (latitude, longitude) => {
    const tier = user?.tier || "free";
    const limit = TIER_LIMITS[tier] || 3;

    if (tier === "blind" || tier === "free" || !tier) {
      toast({
        title: "Upgrade required",
        description: "Upgrade to 20/20 Hawk AI Vision to start scanning.",
        variant: "destructive",
      });
      return;
    }

    if (searchesThisMonth >= limit) {
      toast({
        title: "Search limit reached",
        description: `Your plan allows ${limit} searches/month. Upgrade to continue.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResults([]);
    setExtraResults([]);
    setOrdinance(null);
    setScanError(null);
    setSearchCenter({ lat: latitude, lon: longitude });

    // Create search history record
    const search = await base44.entities.SearchHistory.create({
      latitude,
      longitude,
      status: "pending",
      search_label: `Scan @ ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    });

    // Call Supabase Edge Function
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrcHhlb3V2aWt6Z3NhdXJrb2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MzcxNDgsImV4cCI6MjA1ODUxMzE0OH0.GMm2u8HJeCv8vboySM8CNgIAdbCS27-wrCnMmlRzFCY";
    const res = await fetch("https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ lat: latitude, lon: longitude, radius_miles: 0.5 }),
    });
    const data = await res.json();

    if (data.error) {
      setScanError(data.error);
      await base44.entities.SearchHistory.update(search.id, { status: "failed" });
      setLoading(false);
      return;
    }

    if (data.ordinance) setOrdinance(data.ordinance);

    const parcels = (data.candidates || []).slice(0, 5);

    // Save results to DB
    const savedResults = [];
    for (const parcel of parcels) {
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
        fema_risk_factor: parcel.fema_risk,
        phone: parcel.phone,
        email: parcel.email,
        match_score: parcel.match_score,
      });
      savedResults.push({ ...saved, match_reason: parcel.match_reason });
    }

    // Update search history
    await base44.entities.SearchHistory.update(search.id, {
      status: "completed",
      results_count: savedResults.length,
    });

    setResults(savedResults);
    setCurrentSearchId(search.id);
    setSearchesThisMonth((prev) => prev + 1);
    setLoading(false);

    toast({
      title: "Scan complete",
      description: `Found ${savedResults.length} buildable parcels in the search area.`,
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
  const limit = TIER_LIMITS[tier] || 1;
  const isBlind = tier === "blind" || tier === "free" || !tier;
  const atLimit = isBlind || searchesThisMonth >= limit;

  const handleNeedMore = async () => {
    if (atLimit) return;
    setLoadingMore(true);
    const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrcHhlb3V2aWt6Z3NhdXJrb2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI5MzcxNDgsImV4cCI6MjA1ODUxMzE0OH0.GMm2u8HJeCv8vboySM8CNgIAdbCS27-wrCnMmlRzFCY";
    const res = await fetch("https://skpxeouvikzgsaurkohf.supabase.co/functions/v1/sitehawk-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ lat: searchCenter.lat, lon: searchCenter.lon, radius_miles: 0.5, offset: 5 }),
    });
    const data = await res.json();
    const extra = (data.candidates || []).slice(0, 3);
    const search = await base44.entities.SearchHistory.create({
      latitude: searchCenter.lat,
      longitude: searchCenter.lon,
      status: "completed",
      results_count: extra.length,
      search_label: `More Results @ ${searchCenter.lat.toFixed(4)}, ${searchCenter.lon.toFixed(4)}`,
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
    setExtraResults(saved);
    setSearchesThisMonth((prev) => prev + 1);
    setLoadingMore(false);
  };

  return (
    <div className="space-y-6">
      {/* AI Chat toggle button */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        className="fixed right-6 bottom-8 z-40 w-14 h-14 rounded-full bg-[#0C1B2E] shadow-xl flex items-center justify-center hover:scale-105 transition-transform border border-[#2563A0]"
        title="SiteHawk AI"
      >
        <HawkIcon size={36} />
      </button>

      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        searchId={currentSearchId}
        candidates={[...results, ...extraResults]}
        ordinance={ordinance}
      />
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">Site Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {tier === "blind" || tier === "free" || !tier
            ? "Upgrade to 20/20 Hawk AI Vision to start scanning."
            : "Enter coordinates to find buildable parcels for a 199-ft cell tower"}
        </p>
      </div>

      {/* Search Form */}
      <SearchForm onSearch={handleSearch} isLoading={loading} disabled={atLimit} />

      {scanError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <span className="text-destructive text-sm font-medium">Error: {scanError}</span>
        </div>
      )}

      {atLimit && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-destructive text-sm font-medium">
              {isBlind
                ? "Upgrade to 20/20 Hawk AI Vision to start scanning."
                : `You've reached your monthly limit of ${limit} searches. Upgrade your plan to continue.`}
            </p>
        </div>
      )}

      {/* Map — only renders after scan completes */}
      {(searchCenter || loading) && (
        <MapboxSatelliteMap
          centerLat={searchCenter?.lat}
          centerLon={searchCenter?.lon}
          results={results}
          loading={loading}
          mapImageGetterRef={mapImageGetterRef}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="font-heading font-semibold text-foreground">Scanning area...</p>
          <p className="text-sm text-muted-foreground mt-1">Analyzing parcels within 0.5-mile radius</p>
        </div>
      )}

      {/* Results */}
      {ordinance && <OrdinanceCard ordinance={ordinance} />}

      {results.length > 0 && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-primary" />
            <h2 className="font-heading font-semibold text-lg text-foreground">
              Top {results.length} Candidate Parcels
            </h2>
          </div>
          {results.map((result, idx) => (
            <ResultCard key={result.id} result={result} rank={idx + 1} />
          ))}

          {extraResults.length === 0 && (
            <div className="text-center pt-2">
              <button
                onClick={handleNeedMore}
                disabled={loadingMore || atLimit}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <><div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Loading more...</>
                ) : (
                  <>Need More? Get 3 Additional Candidates</>
                )}
              </button>
              {atLimit && <p className="text-xs text-muted-foreground mt-2">Upgrade your plan to run more searches.</p>}
            </div>
          )}

          {extraResults.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <Radio className="w-5 h-5 text-accent" />
                <h2 className="font-heading font-semibold text-lg text-foreground">Additional Candidates</h2>
              </div>
              {extraResults.map((result, idx) => (
                <ResultCard key={result.id} result={result} rank={results.length + idx + 1} />
              ))}
            </>
          )}

          {/* PDF Download */}
          <div className="flex justify-center pt-4 pb-2">
            <PDFReportButton
              results={results}
              extraResults={extraResults}
              ordinance={ordinance}
              searchCenter={searchCenter}
              mapImageGetterRef={mapImageGetterRef}
            />
          </div>
        </div>
      )}
    </div>
  );
}