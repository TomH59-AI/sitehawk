import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";

// EPA ECHO (Enforcement & Compliance History Online) REST API lookup.
// Queries active RCRA hazardous waste handlers, facilities with violations,
// and enforcement actions within a radius of the target site.
// Complements epaHazWasteLookup (Superfund/Brownfields/CIMC) with the full
// RCRA permittee universe — which is what 47 CFR 1.1307 actually screens for.
// Uses the target parcel coordinates so all data aligns to the selected target.

const ECHO_BASE = "https://echo.epa.gov/rest_services";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_mi = 0.5 } = await req.json();
    const la = Number(lat), lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const apiKey = secrets.get("EPA_ECHO_API_KEY") || "";
    const radiusMiles = Math.min(Number(radius_mi) || 0.5, 2);

    // Search for RCRA hazardous waste handlers within radius
    const params = new URLSearchParams({
      output: "JSON",
      lat: String(la),
      long: String(lo),
      search_type: "radial",
      radius: String(radiusMiles),
      program: "RCRA",
      response_type: "FACILITIES",
    });
    if (apiKey) params.set("api_key", apiKey);

    const res = await fetch(`${ECHO_BASE}/facility_search?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      return Response.json({
        echo_present: false,
        echo_count: 0,
        rcra_handlers: [],
        facilities_with_violations: [],
        enforcement_actions: [],
        error: `ECHO API returned ${res.status}`,
      });
    }

    const data = await res.json();
    const facilities = Array.isArray(data?.Results?.Facilities) ? data.Results.Facilities : [];

    const rcraHandlers = [];
    const withViolations = [];
    const enforcementActions = [];

    for (const f of facilities) {
      const handler = {
        name: f.FacilityName || f.facilityName || "Unknown",
        registry_id: f.RegistryID || f.registryId || null,
        address: f.StreetAddress || f.facilityStreetAddress || null,
        city: f.City || f.facilityCity || null,
        state: f.State || f.facilityState || null,
        zip: f.Zip || f.facilityZip || null,
        program: f.ProgramCodes || "RCRA",
        source_url: f.RegistryID ? `https://echo.epa.gov/detailed-facility-report?fid=${f.RegistryID}` : null,
      };
      rcraHandlers.push(handler);

      // QNC = quarters in non-compliance
      const qnc = Number(f.QNC || f.qnc || 0);
      if (qnc > 0) withViolations.push({ ...handler, quarters_noncompliance: qnc });

      // FEA = formal enforcement actions
      const fea = Number(f.FEA || f.formalEnforcementActions || 0);
      if (fea > 0) enforcementActions.push({ ...handler, formal_actions: fea });
    }

    return Response.json({
      echo_present: facilities.length > 0,
      echo_count: facilities.length,
      rcra_handlers: rcraHandlers.slice(0, 20),
      facilities_with_violations: withViolations.slice(0, 10),
      enforcement_actions: enforcementActions.slice(0, 10),
      search_radius_mi: radiusMiles,
      source: "EPA ECHO REST API",
    });
  } catch (error) {
    console.error("epaEchoLookup error:", error?.message);
    return Response.json({
      echo_present: false,
      echo_count: 0,
      rcra_handlers: [],
      facilities_with_violations: [],
      enforcement_actions: [],
      error: error?.message,
    }, { status: 500 });
  }
}