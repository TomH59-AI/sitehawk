import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// EPA ECHO (Enforcement & Compliance History Online) REST API lookup.
// Queries regulated facilities (RCRA hazardous waste handlers, air, water, TRI)
// and their compliance/enforcement status within a radius of the target site.
// Uses the SAME target parcel coordinates as all other SCIP lookups.
// Base URL: https://echodata.epa.gov/echo
// Endpoints: echo_rest_services.get_facility_info (query) → .get_qid (rows)
// Complements epaHazWasteLookup (Superfund/Brownfields/CIMC) with active
// permittees — the full 47 CFR 1.1307 hazardous waste screening scope.
// Public service, no API key required.

const ECHO_BASE = "https://echodata.epa.gov/echo";
const EMPTY = {
  echo_present: false,
  echo_count: 0,
  rcra_handlers: [],
  facilities_with_violations: [],
  enforcement_actions: [],
};

function isHtml(text) {
  return /^\s*<(!DOCTYPE|html)/i.test(text);
}

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
    const radiusMiles = Math.min(Number(radius_mi) || 0.5, 2);

    const params = new URLSearchParams({
      output: "JSON",
      p_lat: String(la),
      p_long: String(lo),
      p_radius: String(radiusMiles),
    });

    const infoRes = await fetch(`${ECHO_BASE}/echo_rest_services.get_facility_info?${params}`, {
      headers: { "User-Agent": "SiteHawk/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!infoRes.ok) return Response.json({ ...EMPTY, error: `ECHO API returned ${infoRes.status}` });

    const infoText = await infoRes.text();
    if (isHtml(infoText)) {
      return Response.json({ ...EMPTY, error: "ECHO API returned HTML (possibly rate-limited)" });
    }
    const info = JSON.parse(infoText);
    const errorMsg = info?.Results?.Error?.ErrorMessage;
    if (errorMsg) return Response.json({ ...EMPTY, error: `ECHO API error: ${errorMsg}` });

    const totalCount = parseInt(info?.Results?.QueryRows ?? "0", 10) || 0;
    const qid = info?.Results?.QueryID;
    if (!qid || !totalCount) {
      return Response.json({ ...EMPTY, search_radius_mi: radiusMiles, source: "EPA ECHO REST API (echodata.epa.gov)" });
    }

    // Second call returns the actual facility rows for the query id.
    const rowsRes = await fetch(
      `${ECHO_BASE}/echo_rest_services.get_qid?qid=${qid}&output=JSON&responseset=50&pageno=1`,
      { headers: { "User-Agent": "SiteHawk/1.0" }, signal: AbortSignal.timeout(30000) }
    );
    if (!rowsRes.ok) {
      return Response.json({ ...EMPTY, echo_present: true, echo_count: totalCount, error: `ECHO rows returned ${rowsRes.status}` });
    }
    const rowsText = await rowsRes.text();
    if (isHtml(rowsText)) {
      return Response.json({ ...EMPTY, echo_present: true, echo_count: totalCount, error: "ECHO API returned HTML (possibly rate-limited)" });
    }
    const data = JSON.parse(rowsText);
    const facilities = Array.isArray(data?.Results?.Facilities) ? data.Results.Facilities : [];

    const rcraHandlers = [];
    const withViolations = [];
    const enforcementActions = [];

    for (const f of facilities) {
      const handler = {
        name: f.FacName || "Unknown",
        registry_id: f.RegistryID || null,
        address: f.FacStreet || null,
        city: f.FacCity || null,
        state: f.FacState || null,
        zip: f.FacZip || null,
        county: f.FacCounty || null,
        rcra: f.RCRAComplianceStatus != null,
        air: f.CAAComplianceStatus != null,
        water: f.CWAComplianceStatus != null,
        sdwa: f.SDWAComplianceStatus != null,
        compliance_status: f.FacComplianceStatus || null,
        rcra_compliance_status: f.RCRAComplianceStatus || null,
        source_url: f.RegistryID ? `https://echo.epa.gov/detailed-facility-report?fid=${f.RegistryID}` : null,
      };
      rcraHandlers.push(handler);

      if (f.FacSNCFlg === "Y" || Number(f.FacQtrsWithNC || 0) > 0) {
        withViolations.push({
          name: handler.name,
          registry_id: handler.registry_id,
          compliance_status: handler.compliance_status,
          quarters_noncompliance: Number(f.FacQtrsWithNC || 0),
          significant_noncompliance: f.FacSNCFlg === "Y",
          source_url: handler.source_url,
        });
      }

      const formalActions =
        Number(f.CAAFormalActionCount || 0) +
        Number(f.CWAFormalActionCount || 0) +
        Number(f.RCRAFormalActionCount || 0) +
        Number(f.SDWAFormalActionCount || 0);
      if (formalActions > 0 || f.FacDateLastFormalAction) {
        enforcementActions.push({
          name: handler.name,
          registry_id: handler.registry_id,
          formal_actions: formalActions,
          last_formal_action_date: f.FacDateLastFormalAction || null,
          source_url: handler.source_url,
        });
      }
    }

    return Response.json({
      echo_present: facilities.length > 0,
      echo_count: totalCount,
      returned_count: facilities.length,
      rcra_handlers: rcraHandlers.slice(0, 20),
      facilities_with_violations: withViolations.slice(0, 10),
      enforcement_actions: enforcementActions.slice(0, 10),
      search_radius_mi: radiusMiles,
      source: "EPA ECHO REST API (echodata.epa.gov)",
    });
  } catch (error) {
    console.error("epaEchoLookup error:", error?.message);
    return Response.json({ ...EMPTY, error: error?.message }, { status: 500 });
  }
}