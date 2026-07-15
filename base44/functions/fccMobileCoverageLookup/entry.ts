/**
 * fccMobileCoverageLookup — FCC BDC mobile coverage (5G-NR / 4G LTE / 3G / Voice)
 * by point, nationwide.
 *
 * Unlike fixed/fiber, the FCC publishes NO national aggregated mobile FeatureServer —
 * mobile coverage is ~tens of millions of H3 res-9 hexagons. So SiteHawk ingests that
 * data into Supabase (table: fcc_mobile_coverage, keyed by H3 res-9 cell), and this
 * function turns a point into its H3 res-9 cell and does an equality lookup. No polygon
 * math, O(1) via the primary key.
 *
 * Input:  { lat: Number, lon: Number, technology?: "5g" | "lte" | "3g" | "voice" | "all" }
 *         technology defaults to "5g".
 * Output: { found, cell, requested, coverage: [{technology,label,providerCount,maxDown,maxUp}], source }
 *
 * Requires Base44 secrets: SUPABASE_URL, SUPABASE_ANON_KEY (RLS allows anon SELECT).
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { latLngToCell } from "npm:h3-js@4";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") || "https://vkiwvctpxhbsoeagivnl.supabase.co";
const SUPABASE_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

// technology key <-> FCC code
const TECH_CODE = { "5g": 400, lte: 300, "3g": 200, voice: 100 };
const CODE_LABEL = { 400: "5G-NR", 300: "4G LTE", 200: "3G", 100: "Mobile Voice" };

async function queryCell(cell, code) {
  let url =
    `${SUPABASE_URL}/rest/v1/fcc_mobile_coverage` +
    `?h3_res9=eq.${encodeURIComponent(cell)}` +
    `&select=technology,provider_count,max_down,max_up,data_vintage`;
  if (code != null) url += `&technology=eq.${code}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return await res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ found: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!SUPABASE_KEY) {
      return Response.json(
        { found: false, error: "SUPABASE_ANON_KEY secret not configured" },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const techKey = body.technology === "all" ? "all"
      : (TECH_CODE[body.technology] != null ? body.technology : "5g");

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json(
        { found: false, error: "lat and lon must be numbers" },
        { status: 400 },
      );
    }

    const cell = latLngToCell(lat, lon, 9);
    const code = techKey === "all" ? null : TECH_CODE[techKey];
    const rows = await queryCell(cell, code);

    const coverage = rows.map((r) => ({
      technology: r.technology,
      label: CODE_LABEL[r.technology] || `code ${r.technology}`,
      providerCount: r.provider_count,
      maxDown: r.max_down,
      maxUp: r.max_up,
      dataVintage: r.data_vintage,
    })).sort((a, b) => b.technology - a.technology);

    return Response.json({
      found: coverage.length > 0,
      covered: coverage.length > 0,
      cell,
      requested: techKey,
      coverage,
      source: {
        dataset: "FCC Broadband Data Collection — Mobile Broadband (propagation-modeled)",
        store: "Supabase fcc_mobile_coverage (H3 res-9)",
        note:
          "Modeled outdoor/in-vehicle coverage, not a guarantee of on-the-ground service; " +
          "no indoor modeling. Empty result = no ingested coverage for this cell (either no " +
          "coverage, or that state/vintage not yet loaded).",
      },
    });
  } catch (err) {
    console.error("fccMobileCoverageLookup error:", err);
    return Response.json(
      { found: false, error: err.message || String(err) },
      { status: 502 },
    );
  }
});
