/**
 * esriGeocode — ESRI World Geocoding Service fallback for the SiteHawk pipeline.
 *
 * Two modes (auto-detected from the body):
 *   FORWARD   — { address, city?, state? }  → { lat, lon, match_address, score }
 *   REVERSE   — { lat, lon }                → { county, city, jurisdiction, state, match_address }
 *
 * Used as a fallback when Realie can't geocode an address, or when a parcel's
 * governing county/jurisdiction can't be resolved from parcel data or zoneResolve
 * (this reverse path directly fixes wrong-jurisdiction matches nationwide).
 *
 * Authenticates with ESRI_API_KEY (ArcGIS Location Platform API key).
 */
import { createClientFromRequest } from "npm:@base44/sdk@0.8.39";

const FIND_URL =
  "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates";
const REVERSE_URL =
  "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = Deno.env.get("ESRI_API_KEY");
    if (!apiKey) return Response.json({ error: "ESRI_API_KEY not set" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const { address, city, state, lat, lon } = body || {};

    // ── REVERSE geocode (coords → jurisdiction) ──
    if (address == null && lat != null && lon != null) {
      const params = new URLSearchParams({
        location: `${Number(lon)},${Number(lat)}`,
        outSR: "4326",
        f: "json",
        token: apiKey,
      });
      const res = await fetch(`${REVERSE_URL}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || data?.error) {
        console.error("esriGeocode reverse error:", res.status, JSON.stringify(data?.error || data)?.slice(0, 400));
        return Response.json({ error: "ESRI reverse geocode failed", detail: data?.error ?? null }, { status: 502 });
      }
      const a = data?.address || {};
      // ESRI "Subregion" is the US county; "City" is the incorporated place / municipality.
      return Response.json({
        mode: "reverse",
        match_address: a.LongLabel || a.Match_addr || null,
        state: a.RegionAbbr || a.Region || null,
        county: a.Subregion || null,
        city: a.City || null,
        jurisdiction: a.City || a.Subregion || null,
        raw: a,
      });
    }

    // ── FORWARD geocode (address → coords) ──
    if (!address) return Response.json({ error: "Provide `address` (forward) or `lat`+`lon` (reverse)" }, { status: 400 });
    const singleLine = [address, city, state].filter(Boolean).join(", ");
    const params = new URLSearchParams({
      SingleLine: singleLine,
      outFields: "Match_addr,Addr_type,StAddr,City,Subregion,RegionAbbr",
      maxLocations: "1",
      outSR: "4326",
      countryCode: "USA",
      f: "json",
      token: apiKey,
    });
    const res = await fetch(`${FIND_URL}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok || data?.error) {
      console.error("esriGeocode forward error:", res.status, JSON.stringify(data?.error || data)?.slice(0, 400));
      return Response.json({ error: "ESRI geocode failed", detail: data?.error ?? null }, { status: 502 });
    }
    const cand = data?.candidates?.[0];
    if (!cand) return Response.json({ mode: "forward", found: false });
    const attr = cand.attributes || {};
    return Response.json({
      mode: "forward",
      found: true,
      lat: cand.location?.y ?? null,
      lon: cand.location?.x ?? null,
      score: cand.score ?? null,
      match_address: cand.address || attr.Match_addr || null,
      county: attr.Subregion || null,
      city: attr.City || null,
      state: attr.RegionAbbr || null,
    });
  } catch (error) {
    console.error("esriGeocode error:", error?.message || error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});