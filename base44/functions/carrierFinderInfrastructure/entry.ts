import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

const ENDPOINT = "http://api.carrierfinder.net/api.py";
const SUPPORTED = new Set(["fiber_pops", "fiber_ixps", "fiber_buildings"]);
const SOURCE_DATE = "Live query; provider vintage not disclosed";

function miles(lat1, lon1, lat2, lon2) {
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function providerColor(value) {
  const palette = ["#22d3ee", "#38bdf8", "#818cf8", "#a78bfa", "#34d399", "#f472b6"];
  let hash = 0;
  for (const char of String(value || "CarrierFinder")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function withDistances(features, candidate) {
  return features.map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const distance = candidate ? Number(miles(candidate.lat, candidate.lon, lat, lon).toFixed(2)) : null;
    return { ...feature, properties: { ...feature.properties, distance_miles: distance } };
  });
}

function nearest(features) {
  return features.filter((feature) => feature.properties.distance_miles != null)
    .sort((a, b) => a.properties.distance_miles - b.properties.distance_miles)[0] || null;
}

async function carrierFinderRequest(params) {
  const userid = Deno.env.get("CF_USERID");
  const key = Deno.env.get("CARRIERFINDER_API_KEY") || Deno.env.get("CF_KEY");
  const query = new URLSearchParams({ ...params, userid, key });
  const response = await fetch(`${ENDPOINT}?${query.toString()}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`CarrierFinder request failed with HTTP ${response.status}`);
  const body = await response.json();
  if (String(body?.status || "").toLowerCase() === "error") throw new Error("CarrierFinder could not return this licensed layer");
  return body;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { layer, bbox, candidate } = await req.json();
    if (!["fiber_routes", "fiber_pops", "fiber_ixps", "fiber_buildings"].includes(layer)) {
      return Response.json({ error: "Unsupported fiber layer" }, { status: 400 });
    }
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => !Number.isFinite(Number(value)))) {
      return Response.json({ error: "bbox=[west,south,east,north] is required" }, { status: 400 });
    }

    const normalizedBbox = bbox.map(Number);
    const normalizedCandidate = Number.isFinite(Number(candidate?.lat)) && Number.isFinite(Number(candidate?.lon))
      ? { lat: Number(candidate.lat), lon: Number(candidate.lon) }
      : null;
    const limitations = layer === "fiber_routes"
      ? "The current CarrierFinder API entitlement does not expose licensed route geometry. No route is inferred from nearby buildings, and exact underground placement is never represented."
      : "Results are limited to licensed CarrierFinder display records. The documented provider API uses a radius contained inside the visible bounding box, so corners may be omitted; absence of a feature does not prove absence of infrastructure.";

    if (layer === "fiber_routes") {
      return Response.json({
        geojson: { type: "FeatureCollection", features: [] },
        metadata: { source: "CarrierFinder", source_date: SOURCE_DATE, limitations, queried_bbox: normalizedBbox },
        summary: { fiber_routes_loaded: true }, count: 0, cache: "not_applicable",
      });
    }
    if (!SUPPORTED.has(layer) || !Deno.env.get("CF_USERID") || !(Deno.env.get("CARRIERFINDER_API_KEY") || Deno.env.get("CF_KEY"))) {
      return Response.json({ error: "CarrierFinder credentials are not configured" }, { status: 500 });
    }

    const cacheKey = JSON.stringify([layer, normalizedBbox.map((value) => Number(value.toFixed(5)))]);
    const cache = globalThis.__sitehawkFiberXrayCache ||= new Map();
    let baseFeatures = cache.get(cacheKey)?.expiresAt > Date.now() ? cache.get(cacheKey).features : null;
    const cacheStatus = baseFeatures ? "hit" : "miss";

    if (!baseFeatures) {
      const [west, south, east, north] = normalizedBbox;
      const lat = (south + north) / 2, lon = (west + east) / 2;
      const radiusMiles = Math.max(0.1, Math.min(miles(lat, lon, north, lon), miles(lat, lon, lat, east)));
      const params = {
        function: "get_litbuildings", method: "geo", lat: String(lat), lon: String(lon),
        radius: String(Math.round(radiusMiles * 5280)), count: "25", carrier_count: "1",
        ...(layer !== "fiber_buildings" ? { datacenter: "Y" } : {}),
      };
      const body = await carrierFinderRequest(params);
      const sites = Array.isArray(body?.site) ? body.site : (body?.site ? [body.site] : []);
      baseFeatures = sites.flatMap((site) => {
        const pointLat = Number(site.latitude), pointLon = Number(site.longitude);
        if (!Number.isFinite(pointLat) || !Number.isFinite(pointLon) || pointLon < west || pointLon > east || pointLat < south || pointLat > north) return [];
        const licensedText = [site.xnet_type, site.xnet_description, site.carriertype].filter(Boolean).join(" ");
        if (layer === "fiber_ixps" && !/ixp|internet exchange|interconnection/i.test(licensedText)) return [];
        const provider = site.carriername || "Provider not disclosed";
        return [{
          type: "Feature",
          geometry: { type: "Point", coordinates: [pointLon, pointLat] },
          properties: {
            provider,
            facility_name: site.xnet_description || (site.datacenter === "Y" ? "Licensed data center" : "Licensed on-net location"),
            infrastructure_type: layer === "fiber_ixps" ? "Interconnection facility" : (site.xnet_type || site.carriertype || (site.datacenter === "Y" ? "Data center" : "Lit building")),
            route_type: "Not applicable",
            status: site.xnet_code === "O" ? "On-net" : site.xnet_code === "N" ? "Near-net" : "Status not disclosed",
            source: "CarrierFinder",
            source_date: SOURCE_DATE,
            provider_color: providerColor(provider),
          },
        }];
      });
      cache.set(cacheKey, { features: baseFeatures, expiresAt: Date.now() + 10 * 60 * 1000 });
      if (cache.size > 100) cache.delete(cache.keys().next().value);
    }

    const features = withDistances(baseFeatures, normalizedCandidate);
    const closest = nearest(features);
    const summary = layer === "fiber_pops"
      ? { nearest_fiber_pop: closest?.properties.facility_name || null, nearest_fiber_pop_miles: closest?.properties.distance_miles ?? null }
      : layer === "fiber_ixps"
        ? { nearest_interconnection: closest?.properties.facility_name || null, nearest_interconnection_miles: closest?.properties.distance_miles ?? null }
        : { nearest_lit_building: closest?.properties.facility_name || null, nearest_lit_building_miles: closest?.properties.distance_miles ?? null };

    return Response.json({
      geojson: { type: "FeatureCollection", features },
      metadata: { source: "CarrierFinder", source_date: SOURCE_DATE, limitations, queried_bbox: normalizedBbox },
      summary, count: features.length, cache: cacheStatus,
    });
  } catch (error) {
    console.error("carrierFinderInfrastructure error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});