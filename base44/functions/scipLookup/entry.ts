import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FCC_BASE = "https://broadbandmap.fcc.gov/nbm/map/api";
const FCC_DATASET_ID = "42de708f-3c85-4893-9f95-abc09d5aa3e5";

function getTechLabel(code) {
  const labels = {
    10: 'DSL', 40: 'Cable', 50: 'Fiber',
    70: 'Fixed Wireless', 300: 'Licensed Fixed Wireless',
    400: 'Licensed Terrestrial', 500: 'Satellite', 600: 'Unlicensed'
  };
  return labels[code] || `Tech Code ${code}`;
}

async function fccFetch(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(`${FCC_BASE}${url}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 SiteHawk/1.0",
        }
      });
      if (res.status === 503 || res.status === 429) {
        if (i < retries) await new Promise(r => setTimeout(r, 1500));
        else return { error: "FCC servers temporarily unavailable", retry: true };
      } else if (!res.ok) {
        return { error: `FCC API error: ${res.status}`, retry: false };
      } else {
        return await res.json();
      }
    } catch (e) {
      if (i < retries) await new Promise(r => setTimeout(r, 1000));
      else return { error: `FCC connection failed: ${e.message}`, retry: true };
    }
  }
}

async function lookupAddress(address) {
  const encoded = encodeURIComponent(address.trim().toLowerCase());
  const data = await fccFetch(`/fabric/address/${FCC_DATASET_ID}/${encoded}`);

  if (data.error) return { found: false, locations: [], error: data.error };
  const items = Array.isArray(data) ? data : (data.data || []);
  if (!items.length) return { found: false, locations: [] };

  return {
    found: true,
    locations: items.map(loc => ({
      location_id: loc.location_id,
      address: loc.addr_full,
      city: loc.city,
      state: loc.state,
      zip: loc.zip_code,
      bsl_flag: loc.bsl_flag,
    }))
  };
}

async function getFiberCoverage(location_id) {
  const data = await fccFetch(`/fabric/detail/${FCC_DATASET_ID}/${location_id}`);

  if (data.error) return { has_fiber: false, providers: [], fiber_providers: [], error: data.error };
  const items = Array.isArray(data) ? data : (data.data || []);
  if (!items.length) return { has_fiber: false, providers: [], fiber_providers: [] };

  const allProviders = items.map(p => ({
    provider_name: p.brand_name,
    technology: p.technology_code,
    technology_label: getTechLabel(p.technology_code),
    max_download_mbps: p.max_advertised_download_speed,
    max_upload_mbps: p.max_advertised_upload_speed,
    is_fiber: p.technology_code === 50,
    is_cable: p.technology_code === 40,
    is_fixed_wireless: p.technology_code === 70,
  }));

  const fiberProviders = allProviders.filter(p => p.is_fiber);
  const underserved = !allProviders.some(p => p.max_download_mbps >= 100);

  return {
    has_fiber: fiberProviders.length > 0,
    fiber_count: fiberProviders.length,
    total_providers: allProviders.length,
    providers: allProviders,
    fiber_providers: fiberProviders,
    underserved,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { address, location_id, action } = await req.json();

    // Action: lookupAddress only
    if (action === "lookupAddress") {
      if (!address) return Response.json({ error: "address is required" }, { status: 400 });
      const result = await lookupAddress(address);
      return Response.json(result);
    }

    // Action: getFiberCoverage only
    if (action === "getFiberCoverage") {
      if (!location_id) return Response.json({ error: "location_id is required" }, { status: 400 });
      const result = await getFiberCoverage(location_id);
      return Response.json(result);
    }

    // Default: full scipLookup (address → location → coverage)
    if (!address) return Response.json({ error: "address is required" }, { status: 400 });

    const lookup = await lookupAddress(address);
    if (!lookup.found) {
      return Response.json({
        status: "not_found",
        message: "Address not found in FCC Fabric database",
        address,
      });
    }

    const location = lookup.locations[0];
    const coverage = await getFiberCoverage(location.location_id);

    const scip_tier = coverage.has_fiber ? "fiber_rich"
      : coverage.underserved ? "underserved"
      : "standard";

    console.log(`SCIP lookup: ${address} → ${scip_tier} (${coverage.total_providers} providers)`);

    return Response.json({
      status: "success",
      address: location.address,
      location_id: location.location_id,
      bsl_flag: location.bsl_flag,
      has_fiber: coverage.has_fiber,
      underserved: coverage.underserved,
      fiber_providers: coverage.fiber_providers,
      all_providers: coverage.providers,
      scip_tier,
    });

  } catch (error) {
    console.error("scipLookup error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});