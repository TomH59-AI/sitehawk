// functions/cloudRFCoveragePolygon.js
//
// Wrapper that ensures CloudRF /area output includes a GeoJSON polygon
// of the served footprint (in addition to the raster PNG). This is the
// vector geometry that gets passed into fccPolygonFiberRollup.
//
// Input body:  { lat, lon, height_ft?, radius_mi?, site_name?, threshold_dbm? }
// Output:      { success, polygon, raster: { url, bounds }, meta }
//
// CloudRF /area returns archive URLs (kmz/shp/json). We use the `json`
// archive endpoint — it returns the coverage as a FeatureCollection of
// signal-band polygons. We merge them into a single MultiPolygon outline.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const CLOUDRF_BASE = "https://api.cloudrf.com";

// Convert any CloudRF GeoJSON response into a single Polygon/MultiPolygon
// representing the full served footprint.
function flattenToCoveragePolygon(geojson) {
  const rings = [];
  const collect = (geom) => {
    if (!geom) return;
    if (geom.type === "Polygon") {
      for (const ring of geom.coordinates) rings.push(ring);
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates) for (const ring of poly) rings.push(ring);
    } else if (geom.type === "GeometryCollection") {
      for (const g of geom.geometries) collect(g);
    }
  };

  if (geojson.type === "FeatureCollection") {
    for (const f of geojson.features) collect(f.geometry);
  } else if (geojson.type === "Feature") {
    collect(geojson.geometry);
  } else {
    collect(geojson);
  }

  if (rings.length === 0) return null;
  if (rings.length === 1) return { type: "Polygon", coordinates: [rings[0]] };
  return { type: "MultiPolygon", coordinates: rings.map((r) => [r]) };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const {
      lat,
      lon,
      height_ft = 199,
      radius_mi = 5,
      site_name = "SiteHawk Candidate",
      threshold_dbm = -100,
    } = await req.json();

    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon are required numbers" }, { status: 400 });
    }

    const apiKey = Deno.env.get("CloudRF_API_KEY");
    if (!apiKey) return Response.json({ error: "CloudRF_API_KEY not configured" }, { status: 500 });

    const txHeightM = Math.round(height_ft * 0.3048);
    const radiusKm = Math.round(radius_mi * 1.60934);

    const payload = {
      site: site_name.substring(0, 60),
      network: "SiteHawk",
      transmitter: { lat, lon, alt: txHeightM, frq: 700, txw: 40, bwi: 10, powerUnit: "W" },
      receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: threshold_dbm },
      antenna: { txg: 12, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 30, fbr: 0, pol: "v" },
      model: { pm: 1, pe: 2, ked: 0, rel: 95, ter: 4, cli: 6 },
      environment: { clm: 1, cll: 2, mat: 0 },
      output: { units: "m", col: "RAINBOW.dBm", out: 2, ber: 1, mod: 1, nf: -120, res: 30, rad: radiusKm },
    };

    const res = await fetch(`${CLOUDRF_BASE}/area`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "key": apiKey },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("CloudRF /area failed:", res.status, text);
      return Response.json({ error: `CloudRF API error: ${res.status}`, detail: text }, { status: 502 });
    }
    const data = await res.json();

    // Fetch the GeoJSON archive (CloudRF returns coverage as a FeatureCollection).
    let polygon = null;
    if (data.json) {
      const jsonRes = await fetch(data.json, { headers: { key: apiKey } });
      if (jsonRes.ok) {
        const gj = await jsonRes.json();
        polygon = flattenToCoveragePolygon(gj);
      } else {
        console.warn("CloudRF JSON archive fetch failed:", jsonRes.status);
      }
    }

    if (!polygon) {
      return Response.json({
        success: false,
        error: "CloudRF returned no parseable coverage polygon",
        raster: { url: data.PNG_Mercator || null, bounds: data.bounds || null },
      }, { status: 502 });
    }

    return Response.json({
      success: true,
      polygon,
      raster: { url: data.PNG_Mercator || data.PNG_WGS84 || null, bounds: data.bounds || null },
      meta: {
        site_name,
        center: { lat, lon },
        height_ft,
        radius_mi,
        threshold_dbm,
        area_covered_sq_km: data.area || null,
        kmz_url: data.kmz || null,
        archive_id: data.sid || null,
      },
    });
  } catch (error) {
    console.error("cloudRFCoveragePolygon error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});