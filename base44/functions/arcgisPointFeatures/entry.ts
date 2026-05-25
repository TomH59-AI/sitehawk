/**
 * arcgisPointFeatures — Generic viewport-driven query for HIFLD-style ArcGIS
 * FeatureServer point datasets (cell towers, data centers, etc.).
 *
 * Datasets are pinned to verified endpoints. Add new datasets to the DATASETS
 * map as needed.
 *
 * Body params:
 *   dataset      string  required  e.g. "cell_towers"
 *   bbox         object  required  { minLon, minLat, maxLon, maxLat }
 *   limit        number  optional  default 2000, hard cap 5000
 *   where        string  optional  extra SQL filter ANDed with bbox
 *
 * Returns: { type: "FeatureCollection", features: [...], count }
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const DATASETS = {
  cell_towers: {
    // HIFLD Cellular Towers (FCC ULS-derived). Confirmed live FeatureServer.
    // Note: the short alias "Cellular_Towers" 404s on direct fetch — the canonical
    // service name on services2/FiaPA4ga0iQKduv3 is "Cellular_Towers_in_the_United_States".
    url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Cellular_Towers_in_the_United_States/FeatureServer/0/query",
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { dataset, bbox, limit = 2000, where = "" } = body || {};

    if (!dataset || !DATASETS[dataset]) {
      return Response.json(
        { error: `Unknown dataset. Available: ${Object.keys(DATASETS).join(", ")}` },
        { status: 400 }
      );
    }
    if (!bbox || bbox.minLon == null || bbox.minLat == null || bbox.maxLon == null || bbox.maxLat == null) {
      return Response.json({ error: "Missing bbox { minLon, minLat, maxLon, maxLat }" }, { status: 400 });
    }

    const { url } = DATASETS[dataset];
    const cap = Math.min(Math.max(parseInt(limit, 10) || 2000, 1), 5000);

    const params = new URLSearchParams({
      f: "geojson",
      where: where && where.trim() ? where : "1=1",
      outFields: "*",
      geometry: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      outSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      returnGeometry: "true",
      resultRecordCount: String(cap),
    });

    const resp = await fetch(`${url}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return Response.json(
        { error: `ArcGIS upstream ${resp.status}`, details: text.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const features = Array.isArray(data.features) ? data.features : [];
    return Response.json({
      type: "FeatureCollection",
      features,
      count: features.length,
      dataset,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});