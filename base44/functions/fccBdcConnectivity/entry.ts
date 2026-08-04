import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { getStateProviderFileContext } from "../../shared/fccBdc.js";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { lat, lon } = await req.json();
    const latitude = Number(lat), longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: "lat and lon are required" }, { status: 400 });
    }

    const [coverageCall, bdc] = await Promise.all([
      base44.functions.invoke("fccFiberLookup", { lat: latitude, lon: longitude, resolution: "blockGroup" }),
      getStateProviderFileContext(latitude, longitude, secrets.get("FCC_USERNAME"), secrets.get("FCC_TOKEN")),
    ]);
    const coverage = coverageCall?.data ?? coverageCall;
    return Response.json({
      center: { lat: latitude, lon: longitude },
      coverage: coverage?.found ? coverage : null,
      provider_count: coverage?.providers?.fiber ?? null,
      // State-level fixed-broadband providers named in the FCC availability index.
      provider_names: bdc.fixedProviders.map((p) => p.provider_name),
      state_fixed_providers: bdc.fixedProviders,
      state_provider_totals: bdc.stateProviderTotals,
      facilities: [],
      source: {
        dataset: "FCC Broadband Data Collection",
        as_of_date: bdc.asOfDate,
        provider_list_file: bdc.providerListFile,
        geography: bdc.geography,
        confidence: "FCC-reported block-group availability summary",
      },
      limitations: "FCC BDC does not publish CarrierFinder-style central-office, lit-building, POP, IXP, on-net, near-net, route, capacity, or quote records. Provider count is an area summary and does not confirm service at the parcel.",
    });
  } catch (error) {
    console.error("fccBdcConnectivity error:", error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
}