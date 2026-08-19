/**
 * Propagation Explorer — authenticated CloudRF + FCC analysis for TalonFit.
 *
 * Input:  { lat, lng, radiusMiles (0.5-3), carrier, heightFt? }
 * Output: { coverage, towers, opportunityZones, usage }
 *
 * The 3-mile cap and daily plan quotas are enforced here, regardless of
 * anything the browser sends. CloudRF and Supabase/FCC credentials stay in
 * backend functions and are never returned to the browser.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.43";

const MIN_RADIUS_MILES = 0.5;
const MAX_RADIUS_MILES = 3;
const ALLOWED_CARRIERS = new Set(["verizon", "att", "tmobile"]);
const UNLIMITED_TIERS = new Set([
  "hawk_command",
  "hawkeye_apex",
  "hawkeyes",
  "enterprise_trial",
]);
const UNLIMITED_EMAILS = new Set([
  "hodgesthomas@outlook.com",
  "hodges.thomas@gmail.com",
  "tomhodges@onairs.org",
  "jcuttone@pyramidns.com",
  "rhanson@pyramidns.com",
  "jsuriano@pyramidns.com",
  "cfazio@pyramidns.com",
]);
const DAILY_LIMITS = {
  free: 0,
  hawk_site: 0,
  hawk_site_law: 0,
  hawk_vision: 10,
  hawk_vision_law: 25,
};

function unwrap(call) {
  return call?.data ?? call;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function quotaForUser(user) {
  const tier = String(user?.tier || "free").toLowerCase();
  const email = String(user?.email || "").toLowerCase();
  const plan = String(user?.subscription_plan || "").toLowerCase();
  const unlimited =
    user?.role === "admin" ||
    user?.role === "demo" ||
    UNLIMITED_TIERS.has(tier) ||
    UNLIMITED_EMAILS.has(email) ||
    /apex|command|unlimited/.test(plan);

  if (unlimited) return { tier: tier || "hawk_command", limit: null };
  return { tier, limit: DAILY_LIMITS[tier] ?? 0 };
}

function upgradeForTier(tier) {
  if (tier === "hawk_site_law") return "hawk_vision_law";
  if (tier === "hawk_vision" || tier === "hawk_vision_law") return "hawk_command";
  return "hawk_vision";
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  if (!Array.isArray(ring) || ring.length < 3) return false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, coordinates) {
  if (!Array.isArray(coordinates) || !pointInRing(lng, lat, coordinates[0])) return false;
  for (let i = 1; i < coordinates.length; i++) {
    if (pointInRing(lng, lat, coordinates[i])) return false;
  }
  return true;
}

function pointInCoverage(lng, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  }
  if (geometry.type === "GeometryCollection") {
    return (geometry.geometries || []).some((child) => pointInCoverage(lng, lat, child));
  }
  return false;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const earthMiles = 3958.8;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeTowers(rawTowers, lat, lng, radiusMiles) {
  return (Array.isArray(rawTowers) ? rawTowers : [])
    .map((tower, index) => {
      const towerLat = finiteNumber(tower.latitude ?? tower.lat);
      const towerLng = finiteNumber(tower.longitude ?? tower.lon ?? tower.lng);
      if (towerLat == null || towerLng == null) return null;
      const distanceMiles =
        finiteNumber(tower.distance_miles) ??
        haversineMiles(lat, lng, towerLat, towerLng);
      if (distanceMiles > radiusMiles) return null;
      return {
        id: tower.asrn || tower.call_letters || `tower-${index}`,
        lat: towerLat,
        lng: towerLng,
        source: tower.source || "FCC ASR",
        registration_number: tower.asrn || null,
        call_letters: tower.call_letters || null,
        structure_type: tower.structure_label || tower.structure_type || "Registered structure",
        height_ft: finiteNumber(tower.height_ft),
        distance_miles: Math.round(distanceMiles * 100) / 100,
        fcc_url: tower.fcc_url || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_miles - b.distance_miles);
}

function squareFeature(lat, lng, sideMiles, properties) {
  const half = sideMiles / 2;
  const dLat = half / 69.0;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dLng = half / (69.172 * cosLat);
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ]],
    },
  };
}

function computeOpportunityZones({ coverageGeometry, towers, lat, lng, radiusMiles }) {
  const cellMiles = Math.max(0.12, Math.min(0.3, radiusMiles / 8));
  const towerClearanceMiles = Math.max(0.3, radiusMiles * 0.2);
  const candidates = [];

  for (let north = -radiusMiles; north <= radiusMiles; north += cellMiles) {
    for (let east = -radiusMiles; east <= radiusMiles; east += cellMiles) {
      const centerDistance = Math.sqrt(north ** 2 + east ** 2);
      if (centerDistance > radiusMiles - cellMiles / 2) continue;
      const sampleLat = lat + north / 69.0;
      const cosLat = Math.max(0.2, Math.cos((sampleLat * Math.PI) / 180));
      const sampleLng = lng + east / (69.172 * cosLat);
      if (pointInCoverage(sampleLng, sampleLat, coverageGeometry)) continue;

      const nearestTowerMiles = towers.length
        ? Math.min(...towers.map((tower) =>
            haversineMiles(sampleLat, sampleLng, tower.lat, tower.lng)
          ))
        : radiusMiles;
      if (nearestTowerMiles < towerClearanceMiles) continue;

      const score = Math.min(
        100,
        Math.round(60 + 30 * Math.min(1, nearestTowerMiles / Math.max(radiusMiles, 0.5)))
      );
      candidates.push({
        score,
        nearestTowerMiles,
        feature: squareFeature(sampleLat, sampleLng, cellMiles * 0.86, {
          score,
          nearest_tower_miles: Math.round(nearestTowerMiles * 100) / 100,
          reason: "Below the selected CloudRF threshold with sparse registered-tower density.",
        }),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    type: "FeatureCollection",
    features: candidates.slice(0, 80).map((candidate) => candidate.feature),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Sign in to run propagation.", code: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const lat = finiteNumber(body?.lat);
    const lng = finiteNumber(body?.lng ?? body?.lon);
    if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return Response.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
    }

    const requestedRadius = finiteNumber(body?.radiusMiles ?? body?.radius_miles) ?? 1;
    const radiusMiles = Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, requestedRadius));
    const carrier = String(body?.carrier || "verizon").toLowerCase();
    if (!ALLOWED_CARRIERS.has(carrier)) {
      return Response.json({ error: "Unsupported carrier preset." }, { status: 400 });
    }
    const heightFt = Math.min(500, Math.max(50, finiteNumber(body?.heightFt ?? body?.height_ft) ?? 199));

    const usageDay = new Date().toISOString().slice(0, 10);
    const quota = quotaForUser(user);
    const existingRuns = await base44.asServiceRole.entities.PropagationRunLog.filter(
      { user_id: user.id, usage_day: usageDay },
      "-created_date",
      100
    );
    const usedBefore = Array.isArray(existingRuns) ? existingRuns.length : 0;

    if (quota.limit === 0) {
      return Response.json({
        error: "Propagation Explorer requires HawkVision Pro or higher.",
        code: "propagation_upgrade_required",
        upgrade_to: upgradeForTier(quota.tier),
        usage: { tier: quota.tier, used: usedBefore, limit: 0, remaining: 0 },
      }, { status: 403 });
    }
    if (quota.limit != null && usedBefore >= quota.limit) {
      return Response.json({
        error: `Daily propagation limit reached (${quota.limit} runs). Upgrade for more capacity.`,
        code: "propagation_quota_exceeded",
        upgrade_to: upgradeForTier(quota.tier),
        usage: { tier: quota.tier, used: usedBefore, limit: quota.limit, remaining: 0 },
      }, { status: 429 });
    }

    const [coverageSettled, towerSettled] = await Promise.allSettled([
      base44.functions.invoke("cloudRFCoveragePolygon", {
        lat,
        lon: lng,
        height_ft: heightFt,
        radius_mi: radiusMiles,
        site_name: `Propagation Explorer · ${carrier}`,
        threshold_dbm: -100,
        carrier,
      }),
      base44.functions.invoke("colocationOpportunities", {
        lat,
        lon: lng,
        radius_miles: radiusMiles,
      }),
    ]);

    if (coverageSettled.status === "rejected") {
      throw coverageSettled.reason;
    }
    const coverageData = unwrap(coverageSettled.value);
    if (!coverageData?.success || !coverageData?.polygon) {
      return Response.json({
        error: coverageData?.error || "CloudRF returned no usable coverage geometry.",
        code: "coverage_unavailable",
      }, { status: 502 });
    }

    const towerData = towerSettled.status === "fulfilled" ? unwrap(towerSettled.value) : {};
    const towers = normalizeTowers(towerData?.towers, lat, lng, radiusMiles);
    const opportunityZones = computeOpportunityZones({
      coverageGeometry: coverageData.polygon,
      towers,
      lat,
      lng,
      radiusMiles,
    });

    const generatedAt = new Date().toISOString();
    const runId = crypto.randomUUID();
    const used = usedBefore + 1;
    const limit = quota.limit;
    const usage = {
      tier: quota.tier,
      used,
      limit,
      remaining: limit == null ? null : Math.max(0, limit - used),
    };

    await base44.asServiceRole.entities.PropagationRunLog.create({
      run_id: runId,
      user_id: user.id,
      user_email: user.email || "",
      usage_day: usageDay,
      tier_at_time: quota.tier,
      carrier,
      latitude: lat,
      longitude: lng,
      radius_miles: radiusMiles,
      tower_height_ft: heightFt,
      coverage_area_sq_km: finiteNumber(coverageData?.meta?.area_covered_sq_km),
      tower_count: towers.length,
      opportunity_count: opportunityZones.features.length,
      generated_at: generatedAt,
    });

    return Response.json({
      success: true,
      run_id: runId,
      center: { lat, lng },
      carrier,
      radius_miles: radiusMiles,
      height_ft: heightFt,
      generated_at: generatedAt,
      coverage: {
        type: "Feature",
        geometry: coverageData.polygon,
        properties: {
          carrier,
          threshold_dbm: coverageData?.meta?.threshold_dbm ?? -100,
          area_covered_sq_km: coverageData?.meta?.area_covered_sq_km ?? null,
          frequency_mhz: coverageData?.meta?.frequency_mhz ?? null,
        },
        raster: coverageData.raster || null,
      },
      towers,
      tower_source: towerData?.source || "FCC ASR",
      tower_warning: towerSettled.status === "rejected" ? "FCC tower lookup was unavailable." : null,
      opportunityZones,
      usage,
    });
  } catch (error) {
    console.error("propagationExplorerRun error:", error);
    const message =
      error?.response?.data?.error ||
      error?.message ||
      "Propagation run failed.";
    return Response.json({ error: message, code: "propagation_run_failed" }, { status: 500 });
  }
});
