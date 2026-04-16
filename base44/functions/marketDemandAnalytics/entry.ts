import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { lat, lon, radius_miles = 5, market_type } = body;

    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    // Fetch historical search data for context
    const recentSearches = await base44.asServiceRole.entities.SearchHistory.list('-created_date', 50);
    const historicalCount = recentSearches.length;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a wireless infrastructure market analyst. Perform a predictive market demand analysis for new cell tower sites.

Location: ${lat}, ${lon}
Search radius: ${radius_miles} miles
Market type focus: ${market_type || 'general'}
Historical scan activity in this app: ${historicalCount} scans logged

Using your knowledge of telecom industry trends, FCC data patterns, population growth projections, and wireless infrastructure demand factors, provide a comprehensive market demand analysis:

1. Current coverage demand score for this area (0-100)
2. 3-year projected demand growth (percentage)
3. Key demand drivers for this specific location type
4. Market saturation assessment (how many towers currently vs needed)
5. Revenue potential estimate for a new tower ($K/year range)
6. Risk factors that could reduce demand
7. Technology trends affecting demand (5G densification, CBRS, FirstNet, etc.)
8. Recommended tower types (macro, small cell, DAS, rooftop)
9. Competitive landscape assessment
10. 5-year demand forecast with confidence level

Be specific, data-driven, and reference actual industry trends from your training data.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: "object",
        properties: {
          demand_score: { type: "number" },
          demand_tier: { type: "string", enum: ["Very High", "High", "Moderate", "Low", "Very Low"] },
          projected_growth_3yr_pct: { type: "number" },
          revenue_potential_low_k: { type: "number" },
          revenue_potential_high_k: { type: "number" },
          market_saturation: { type: "string", enum: ["Undersupplied", "Balanced", "Oversupplied"] },
          confidence_level: { type: "string", enum: ["High", "Medium", "Low"] },
          summary: { type: "string" },
          demand_drivers: { type: "array", items: { type: "string" } },
          risk_factors: { type: "array", items: { type: "string" } },
          recommended_tower_types: { type: "array", items: { type: "string" } },
          technology_trends: { type: "array", items: { type: "string" } },
          five_year_forecast: {
            type: "array",
            items: {
              type: "object",
              properties: {
                year: { type: "number" },
                demand_index: { type: "number" },
                notes: { type: "string" }
              }
            }
          }
        }
      }
    });

    console.log(`Market demand analysis complete for user=${user.email} lat=${lat} lon=${lon}`);
    return Response.json({ analytics: result });

  } catch (error) {
    console.error('marketDemandAnalytics error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});