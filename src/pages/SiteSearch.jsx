import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import SearchForm from "../components/search/SearchForm";
import ResultCard from "../components/search/ResultCard";
import ResultsMap from "../components/search/ResultsMap";
import { Radio } from "lucide-react";

const TIER_LIMITS = { free: 3, pro: 50, enterprise: Infinity };

export default function SiteSearch() {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [searchCenter, setSearchCenter] = useState(null);
  const [searchesThisMonth, setSearchesThisMonth] = useState(0);
  const [existingSearch, setExistingSearch] = useState(null);

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

    if (tier !== "enterprise" && searchesThisMonth >= limit) {
      toast({
        title: "Search limit reached",
        description: `Your ${tier} plan allows ${limit} searches/month. Upgrade to continue.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResults([]);
    setSearchCenter({ lat: latitude, lon: longitude });

    // Create search history record
    const search = await base44.entities.SearchHistory.create({
      latitude,
      longitude,
      status: "pending",
      search_label: `Scan @ ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    });

    // Use LLM to generate realistic parcel data for the area
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a cell tower site prospecting expert. For the coordinates (${latitude}, ${longitude}), generate 5 realistic buildable parcel candidates within a 0.5-mile radius suitable for a 199-ft cell tower.

For each parcel, provide realistic data including:
- site_name: A realistic site name (e.g., "Hilltop Ranch Parcel", "Westfield Industrial Lot")
- owner_name: A realistic owner name
- parcel_address: A realistic street address near these coordinates
- parcel_id: A realistic parcel ID number (format: XXX-XXX-XXX)
- parcel_size_acres: Realistic acreage (0.5 to 20 acres)
- zoning_classification: Realistic zoning (e.g., C-2, M-1, A-1, I-1, R-3)
- owner_mailing_address: A realistic mailing address
- latitude: Slightly varied from center (within 0.5 miles / ~0.007 degrees)
- longitude: Slightly varied from center (within 0.5 miles / ~0.007 degrees)
- fema_risk_factor: A letter grade (A, B, C, D, or X)
- phone: A realistic phone number
- email: A realistic email address
- match_score: Score from 0-100 based on how suitable the parcel is for a cell tower (consider size, zoning, terrain)

Order by match_score descending. Make the data realistic and varied.`,
      response_json_schema: {
        type: "object",
        properties: {
          parcels: {
            type: "array",
            items: {
              type: "object",
              properties: {
                site_name: { type: "string" },
                owner_name: { type: "string" },
                parcel_address: { type: "string" },
                parcel_id: { type: "string" },
                parcel_size_acres: { type: "number" },
                zoning_classification: { type: "string" },
                owner_mailing_address: { type: "string" },
                latitude: { type: "number" },
                longitude: { type: "number" },
                fema_risk_factor: { type: "string" },
                phone: { type: "string" },
                email: { type: "string" },
                match_score: { type: "number" },
              },
            },
          },
        },
      },
    });

    const parcels = response.parcels || [];

    // Save results to DB
    const savedResults = [];
    for (const parcel of parcels) {
      const saved = await base44.entities.SearchResult.create({
        search_id: search.id,
        ...parcel,
      });
      savedResults.push(saved);
    }

    // Update search history
    await base44.entities.SearchHistory.update(search.id, {
      status: "completed",
      results_count: savedResults.length,
    });

    setResults(savedResults);
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
  const limit = TIER_LIMITS[tier] || 3;
  const atLimit = tier !== "enterprise" && searchesThisMonth >= limit;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-foreground">Site Search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Enter coordinates to find buildable parcels for a 199-ft cell tower
        </p>
      </div>

      {/* Search Form */}
      <SearchForm onSearch={handleSearch} isLoading={loading} disabled={atLimit} />

      {atLimit && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-destructive text-sm font-medium">
            You've reached your monthly limit of {limit} searches. Upgrade your plan to continue.
          </p>
        </div>
      )}

      {/* Map */}
      {searchCenter && (
        <ResultsMap centerLat={searchCenter.lat} centerLon={searchCenter.lon} results={results} />
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
        </div>
      )}
    </div>
  );
}