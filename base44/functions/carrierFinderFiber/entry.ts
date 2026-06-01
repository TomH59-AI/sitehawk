import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * carrierFinderFiber — CarrierFinder lookup for the HAWK Infrastructure (Section 7)
 * map. For a Target A lat/lon + radius, returns:
 *   • lit_buildings — fiber-lit / near-net buildings with the named carriers
 *     serving each (the "where the fiber is + who owns it" layer).
 *   • telco         — the incumbent local telco serving the point (central
 *     office, exchange, parent company + phone) for contact info.
 *
 * Endpoint: http://api.carrierfinder.net/api.py
 *   ?function=<fn>&method=geo&lat=&lon=&userid=&key=...
 *   get_litbuildings additionally needs radius (FEET) + count + carrier_count.
 * Auth: userid (CF_USERID) + key (CF_KEY) query params.
 */

const CF_ENDPOINT = "http://api.carrierfinder.net/api.py";

function buildUrl(params) {
  const userid = Deno.env.get("CF_USERID");
  const key = Deno.env.get("CF_KEY");
  const qs = new URLSearchParams({ ...params, userid, key });
  return `${CF_ENDPOINT}?${qs.toString()}`;
}

async function cfFetch(params) {
  const url = buildUrl(params);
  const safeUrl = url.replace(/key=[^&]+/, "key=***").replace(/userid=[^&]+/, "userid=***");
  console.log("[carrierFinderFiber] GET", safeUrl);
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await r.text();
  if (!r.ok) throw new Error(`CarrierFinder HTTP ${r.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`CarrierFinder returned non-JSON: ${text.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    if (!Deno.env.get("CF_USERID") || !Deno.env.get("CF_KEY")) {
      return Response.json({ error: "CF_USERID / CF_KEY not set" }, { status: 500 });
    }

    const { lat, lon, radius_miles = 1.0, state = null, count = 25, carrier_count = 1 } = await req.json();
    const cLat = Number(lat);
    const cLon = Number(lon);
    if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      return Response.json({ error: "lat and lon required" }, { status: 400 });
    }

    const radiusFeet = Math.round(Number(radius_miles) * 5280);

    // 1) Lit buildings (fiber + named carriers) within the radius.
    const litParams = {
      function: "get_litbuildings",
      method: "geo",
      lat: String(cLat),
      lon: String(cLon),
      radius: String(radiusFeet),
      count: String(count),
      carrier_count: String(carrier_count),
    };
    if (state) litParams.state = state;

    // 2) Incumbent telco (central office + parent company + phone) at the point.
    const telcoParams = { function: "get_telcoinfo", method: "geo", lat: String(cLat), lon: String(cLon) };

    const [litRes, telcoRes] = await Promise.all([
      cfFetch(litParams).catch((e) => ({ status: "Error", _error: e.message })),
      cfFetch(telcoParams).catch((e) => ({ status: "Error", _error: e.message })),
    ]);

    // Normalize lit buildings → one entry per building with its carrier list.
    const rawSites = Array.isArray(litRes?.site) ? litRes.site : (litRes?.site ? [litRes.site] : []);
    const lit_buildings = rawSites.map((s, i) => ({
      id: `LIT-${i + 1}`,
      street: s.street || null,
      city: s.city || null,
      state: s.state || null,
      zipcode: s.zipcode || null,
      lat: s.latitude != null ? Number(s.latitude) : null,
      lon: s.longitude != null ? Number(s.longitude) : null,
      distance: s.distance || null,
      distance_int: s.distance_int != null ? Number(s.distance_int) : null,
      carrier_count: s.carrier_count != null ? Number(s.carrier_count) : null,
      // xnet_code: O = OnNet (lit/dark fiber present), N = NearNet (nearby).
      xnet_code: s.xnet_code || null,
      xnet_description: s.xnet_description || null,
      datacenter: s.datacenter === "Y" || s.datacenter === true,
      carrierid: s.carrierid || null,
      carrier: s.carriername || null,
      carriertype: s.carriertype || null,
    }));

    const telco = telcoRes?.status && String(telcoRes.status).toLowerCase() === "ok" ? {
      name: telcoRes.telco_telconame || telcoRes.telco_parentname || null,
      parent: telcoRes.telco_parentname || null,
      phone: telcoRes.telco_telconumber || telcoRes.telco_parentnumber || null,
      exchange: telcoRes.telco_exchange || null,
      clli: telcoRes.telco_clli || null,
      npa_nxx: telcoRes.telco_npanxx || null,
      co_city: telcoRes.telco_co_city || null,
      co_state: telcoRes.telco_co_state || null,
      co_lat: telcoRes.telco_co_lat != null ? Number(telcoRes.telco_co_lat) : null,
      co_lon: telcoRes.telco_co_lon != null ? Number(telcoRes.telco_co_lon) : null,
      co_distance: telcoRes.telco_co_distance || null,
    } : null;

    return Response.json({
      center: { lat: cLat, lon: cLon },
      radius_miles: Number(radius_miles),
      radius_feet: radiusFeet,
      lit_buildings,
      lit_count: lit_buildings.length,
      telco,
      diagnostics: {
        lit_status: litRes?.status || null,
        lit_error: litRes?._error || null,
        telco_status: telcoRes?.status || null,
        telco_error: telcoRes?._error || null,
      },
    });
  } catch (error) {
    console.error("carrierFinderFiber error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});