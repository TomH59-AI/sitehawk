/**
 * fccBlockGroupFiberLookup — FCC Broadband Data Collection (Dec 2024 view)
 * sub-county fiber stats by lat/lon (Census Block Group resolution, layer /3).
 *
 * Input:  { lat: Number, lon: Number }
 * Output: { found: Boolean, geo, population, bsls, fiber, providers, source }
 *
 * Public FCC FeatureServer — no auth required.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const FCC_BASE =
  "https://services8.arcgis.com/peDZJliSvYims39Q/arcgis/rest/services/" +
  "FCC_Broadband_Data_Collection_December_2024_View/FeatureServer";

const BLOCK_GROUP_LAYER = "/3";

const OUT_FIELDS = [
  "GEOID",
  "CountyGEOID",
  "StateGEOID",
  "CountyName",
  "StateName",
  "StateAbbr",
  "TotalPop",
  "TotalBSLs",
  "ServedBSLs",
  "UnderservedBSLs",
  "UnservedBSLs",
  "ServedBSLsFiber",
  "UnderservedBSLsFiber",
  "UnservedBSLsFiber",
  "ServedBSLsFiber_6monthPrevious",
  "ServedBSLsFiber_12monthPrevious",
  "UniqueProviders",
  "UniqueProvidersFiber",
  "UniqueProvidersCable",
  "UniqueProvidersCopper",
  "UniqueProvidersLTFW",
  "UniqueProvidersLBRTFW",
].join(",");

// Safe divide → percentage (0–100), rounded to 1 decimal.
const pct = (num, den) =>
  !den || den <= 0 ? null : Math.round((num / den) * 1000) / 10;

// Safe divide → ratio per 1,000 BSLs.
const per1k = (num, den) =>
  !den || den <= 0 ? null : Math.round((num / den) * 10000) / 10;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { lat, lon } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json(
        { found: false, error: "lat and lon must be numbers" },
        { status: 400 },
      );
    }

    const geometry = encodeURIComponent(
      JSON.stringify({
        x: lon,
        y: lat,
        spatialReference: { wkid: 4326 },
      }),
    );

    const url =
      `${FCC_BASE}${BLOCK_GROUP_LAYER}/query` +
      `?geometry=${geometry}` +
      `&geometryType=esriGeometryPoint` +
      `&inSR=4326` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&outFields=${encodeURIComponent(OUT_FIELDS)}` +
      `&returnGeometry=false` +
      `&outSR=4326` +
      `&f=json`;

    const res = await fetch(url);
    if (!res.ok) {
      return Response.json({ found: false, error: `FCC HTTP ${res.status}` }, { status: 502 });
    }
    const json = await res.json();

    if (json.error) {
      return Response.json(
        { found: false, error: `FCC API: ${json.error.message}` },
        { status: 502 },
      );
    }

    const feat = json.features && json.features[0];
    if (!feat) {
      return Response.json({
        found: false,
        reason: "no_block_group_at_point",
        lat,
        lon,
      });
    }

    const a = feat.attributes;

    const fiberServedPct = pct(a.ServedBSLsFiber, a.TotalBSLs);
    const fiberUnderservedPct = pct(a.UnderservedBSLsFiber, a.TotalBSLs);
    const fiberUnservedPct = pct(a.UnservedBSLsFiber, a.TotalBSLs);

    const fiberGrowth12mo =
      a.ServedBSLsFiber - (a.ServedBSLsFiber_12monthPrevious ?? 0);
    const fiberGrowth12moPct = pct(
      fiberGrowth12mo,
      a.ServedBSLsFiber_12monthPrevious || 1,
    );

    const fiberGrowth6mo =
      a.ServedBSLsFiber - (a.ServedBSLsFiber_6monthPrevious ?? 0);

    const fiberProvidersPer1kBSL = per1k(a.UniqueProvidersFiber, a.TotalBSLs);

    return Response.json({
      found: true,
      geo: {
        level: "blockGroup",
        geoid: a.GEOID,
        countyGeoid: a.CountyGEOID,
        stateGeoid: a.StateGEOID,
        countyName: a.CountyName,
        stateName: a.StateName,
        stateAbbr: a.StateAbbr,
      },
      population: a.TotalPop,
      bsls: {
        total: a.TotalBSLs,
        served: a.ServedBSLs,
        underserved: a.UnderservedBSLs,
        unserved: a.UnservedBSLs,
      },
      fiber: {
        served: a.ServedBSLsFiber,
        underserved: a.UnderservedBSLsFiber,
        unserved: a.UnservedBSLsFiber,
        served6moPrev: a.ServedBSLsFiber_6monthPrevious,
        served12moPrev: a.ServedBSLsFiber_12monthPrevious,
        servedPct: fiberServedPct,
        underservedPct: fiberUnderservedPct,
        unservedPct: fiberUnservedPct,
        growth6moAbs: fiberGrowth6mo,
        growth12moAbs: fiberGrowth12mo,
        growth12moPct: fiberGrowth12moPct,
      },
      providers: {
        total: a.UniqueProviders,
        fiber: a.UniqueProvidersFiber,
        cable: a.UniqueProvidersCable,
        copper: a.UniqueProvidersCopper,
        licensedFW: a.UniqueProvidersLTFW,
        licensedByRuleFW: a.UniqueProvidersLBRTFW,
        fiberPer1kBSL: fiberProvidersPer1kBSL,
      },
      source: {
        dataset: "FCC Broadband Data Collection (Dec 2024 view)",
        layer: "BlockGroup (/3)",
        query: "point-intersect",
        itemId: "e1343efcefc344709057260ee57290a0",
      },
    });
  } catch (error) {
    console.error("fccBlockGroupFiberLookup error:", error);
    return Response.json({ found: false, error: error.message }, { status: 500 });
  }
});