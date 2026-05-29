import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SUPABASE_URL = "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qlmz0RMO8qXUrWi1i6bpaQ_9tcqSzFZ";
const EIA_UTILITY_URL = "https://services1.arcgis.com/4yjifSiIG17X0gW4/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0/query";
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

async function fetchNearestTower(lat, lon) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nearest_cell_tower`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ center_lat: Number(lat), center_lon: Number(lon), radius_miles: null }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const t = Array.isArray(data) ? data[0] : data;
    if (!t) return null;
    return {
      distance_miles: t.distance_miles != null ? parseFloat(Number(t.distance_miles).toFixed(2)) : null,
      licensee: t.licensee || null,
      structure_type: t.structure_type || null,
    };
  } catch (e) {
    console.warn("nearest tower failed:", e.message);
    return null;
  }
}

async function fetchFccBlock(lat, lon) {
  try {
    const r = await fetch(`https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`);
    const data = await r.json();
    return data?.Block?.FIPS || null;
  } catch { return null; }
}

async function fetchUtility(lat, lon) {
  try {
    const params = new URLSearchParams({
      geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
      spatialRel: "esriSpatialRelIntersects", outFields: "NAME,STATE,HOLDING_CO",
      returnGeometry: "false", f: "json", resultRecordCount: "1",
    });
    const r = await fetch(`${EIA_UTILITY_URL}?${params}`);
    const data = await r.json();
    const f = data?.features?.[0]?.attributes;
    if (!f) return null;
    return f.STATE ? `${f.NAME || f.HOLDING_CO} (${f.STATE})` : (f.NAME || f.HOLDING_CO);
  } catch { return null; }
}

async function fetchAssetCounts(lat, lon, radius_m) {
  const q = `[out:json][timeout:25];(node(around:${radius_m},${lat},${lon})[power~"^(pole|tower|transformer|substation)$"];way(around:${radius_m},${lat},${lon})[power~"^(line|minor_line|cable)$"];node(around:${radius_m},${lat},${lon})[telecom];way(around:${radius_m},${lat},${lon})[communication=line];way(around:${radius_m},${lat},${lon})[telecom];);out body 200;`;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SiteHawk/1.0", "Accept": "application/json" },
        body: "data=" + encodeURIComponent(q),
      });
      if (!r.ok) continue;
      const data = await r.json();
      let electric = 0, fiber = 0;
      for (const el of data.elements || []) {
        const t = el.tags || {};
        if (t.power) electric++;
        else if (t.telecom || t.communication === "line") fiber++;
      }
      return { electric, fiber };
    } catch { /* try next endpoint */ }
  }
  return { electric: null, fiber: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { lat, lon, radius_miles = 5, market_type } = body;

    if (!lat || !lon) return Response.json({ error: 'lat and lon are required' }, { status: 400 });

    // ─── HARD DATA GATHERING ──────────────────────────────────────────────
    // Pull real first-party / public signals BEFORE the LLM so the forecast is
    // grounded in measurable infrastructure facts, not pure model estimate.
    const haversineMiles = (la1, lo1, la2, lo2) => {
      const R = 3958.7613, toRad = d => d * Math.PI / 180;
      const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    const radius_m = Math.round(radius_miles * 1609);
    const [towerRes, blockRes, utilRes, assetsRes, searchRes] = await Promise.allSettled([
      fetchNearestTower(lat, lon),
      fetchFccBlock(lat, lon),
      fetchUtility(lat, lon),
      fetchAssetCounts(lat, lon, radius_m),
      base44.asServiceRole.entities.SearchHistory.list('-created_date', 500),
    ]);

    const tower = towerRes.status === 'fulfilled' ? towerRes.value : null;
    const blockGeoid = blockRes.status === 'fulfilled' ? blockRes.value : null;
    const utility = utilRes.status === 'fulfilled' ? utilRes.value : null;
    const assets = assetsRes.status === 'fulfilled' ? (assetsRes.value || {}) : {};
    const allSearches = searchRes.status === 'fulfilled' ? (searchRes.value || []) : [];

    // Cluster the app's own scan history within the radius → local prospecting interest
    const nearbyScans = allSearches.filter(s =>
      s.latitude != null && s.longitude != null &&
      haversineMiles(lat, lon, s.latitude, s.longitude) <= radius_miles
    );

    const evidence = {
      nearest_tower_distance_miles: tower?.distance_miles ?? null,
      nearest_tower_licensee: tower?.licensee ?? null,
      nearest_tower_type: tower?.structure_type ?? null,
      fcc_block_geoid: blockGeoid ?? null,
      power_utility: utility ?? null,
      electric_asset_count: assets.electric ?? null,
      fiber_asset_count: assets.fiber ?? null,
      nearby_scans_in_radius: nearbyScans.length,
      total_scans_logged: allSearches.length,
    };

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a wireless infrastructure market analyst. Perform a predictive market demand analysis for new cell tower sites. Ground your assessment in the MEASURED SITE EVIDENCE below — cite these real numbers in your reasoning rather than relying only on general assumptions.

Location: ${lat}, ${lon}
Search radius: ${radius_miles} miles
Market type focus: ${market_type || 'general'}

MEASURED SITE EVIDENCE (real data pulled for this exact location):
- Nearest existing FCC-registered tower: ${evidence.nearest_tower_distance_miles != null ? `${evidence.nearest_tower_distance_miles} miles away (${evidence.nearest_tower_licensee || 'unknown licensee'}, ${evidence.nearest_tower_type || 'unknown type'})` : 'none found nearby'}
- FCC census block GEOID: ${evidence.fcc_block_geoid || 'unknown'}
- Electric utility serving site: ${evidence.power_utility || 'unknown'}
- Mapped electric assets within radius: ${evidence.electric_asset_count ?? 'unknown'}
- Mapped fiber/telecom assets within radius: ${evidence.fiber_asset_count ?? 'unknown'}
- Site-acquisition scans logged in this radius (prospecting interest): ${evidence.nearby_scans_in_radius}

Interpretation guidance: A nearby existing tower indicates either coverage saturation OR a proven RF-viable corridor (good collocation/competition signal). Close fiber + power lowers buildout cost and raises viability. High local scan activity signals active prospecting demand. Use these to anchor your demand score, saturation call, and revenue range.

Provide a comprehensive market demand analysis:

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

    console.log(`Market demand analysis complete for user=${user.email} lat=${lat} lon=${lon} evidence=${JSON.stringify(evidence)}`);
    return Response.json({ analytics: result, evidence });

  } catch (error) {
    console.error('marketDemandAnalytics error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});