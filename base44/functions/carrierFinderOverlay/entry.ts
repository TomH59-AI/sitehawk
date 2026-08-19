/**
 * CarrierFinder overlay for Propagation Explorer.
 *
 * Browser input is restricted to a small bbox, zoom, and layer list. Existing
 * CarrierFinder credentials remain server-only. Results are normalized to a
 * safe GeoJSON whitelist, cached for 15 minutes, and governed by a global
 * 500-API-call monthly ceiling plus a per-user request throttle.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.43";
import {
  normalizeCarrierFinderGeoJson,
  safeFeatureMetadata,
} from "./normalizer.mjs";

const MAX_BBOX_DIAGONAL_MILES = 2;
const CACHE_TTL_MS = 15 * 60 * 1000;
const GLOBAL_MONTHLY_API_CALL_LIMIT = 500;
const REQUESTS_PER_MINUTE = 10;
const MAX_RESPONSE_BYTES = 5_000_000;
const ALLOWED_LAYERS = new Set(["runs", "points"]);
const ALLOWED_TIERS = new Set([
  "hawk_vision",
  "hawk_vision_law",
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function radians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const earthMiles = 3958.8;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseBbox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const bbox = value.map(finite);
  if (bbox.some((coordinate) => coordinate == null)) return null;
  const [west, south, east, north] = bbox;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    return null;
  }
  return bbox;
}

function parseLayers(value) {
  const input = Array.isArray(value) ? value : ["runs", "points"];
  const layers = [...new Set(input.map((item) => String(item).toLowerCase()))]
    .filter((item) => ALLOWED_LAYERS.has(item))
    .sort();
  return layers.length ? layers : null;
}

function canUseCarrierFinder(user) {
  const role = String(user?.role || "").toLowerCase();
  const tier = String(user?.tier || "free").toLowerCase();
  const plan = String(user?.subscription_plan || "").toLowerCase();
  const email = String(user?.email || "").toLowerCase();
  return (
    role === "admin" ||
    role === "demo" ||
    ALLOWED_TIERS.has(tier) ||
    UNLIMITED_EMAILS.has(email) ||
    /hawk.?vision|command|apex|unlimited/.test(plan)
  );
}

function cacheKey(bbox, zoom, layers) {
  return [
    ...bbox.map((coordinate) => Number(coordinate).toFixed(5)),
    Math.round(zoom * 2) / 2,
    layers.join(","),
  ].join("|");
}

function publicQuota(used) {
  return {
    used,
    limit: GLOBAL_MONTHLY_API_CALL_LIMIT,
    remaining: Math.max(0, GLOBAL_MONTHLY_API_CALL_LIMIT - used),
  };
}

function baseLog(user, now, requestId) {
  return {
    request_id: requestId,
    user_id: user.id,
    user_email: user.email || "",
    tier_at_time: String(user.tier || "free").toLowerCase(),
    month_key: now.toISOString().slice(0, 7),
    minute_key: now.toISOString().slice(0, 16),
    logged_at: now.toISOString(),
  };
}

async function countMonthlyApiCalls(base44, monthKey) {
  const logs = await base44.asServiceRole.entities.CarrierFinderLookupLog.filter(
    { month_key: monthKey, api_call: true },
    "-created_date",
    GLOBAL_MONTHLY_API_CALL_LIMIT + 1
  );
  return Array.isArray(logs) ? logs.length : 0;
}

async function countMinuteRequests(base44, userId, minuteKey) {
  const logs = await base44.asServiceRole.entities.CarrierFinderLookupLog.filter(
    { user_id: userId, minute_key: minuteKey, request_count: true },
    "-created_date",
    REQUESTS_PER_MINUTE + 1
  );
  return Array.isArray(logs) ? logs.length : 0;
}

async function findCache(base44, key) {
  const records = await base44.asServiceRole.entities.CarrierFinderOverlayCache.filter(
    { cache_key: key },
    "-created_date",
    1
  );
  return Array.isArray(records) ? records[0] || null : null;
}

async function saveCache(base44, existing, payload) {
  if (existing?.id) {
    return base44.asServiceRole.entities.CarrierFinderOverlayCache.update(existing.id, payload);
  }
  return base44.asServiceRole.entities.CarrierFinderOverlayCache.create(payload);
}

function filterLayers(geojson, layers) {
  const allowed = new Set(layers);
  return {
    type: "FeatureCollection",
    features: (geojson?.features || []).filter((feature) => {
      const isRun =
        feature?.properties?.feature_type === "run" ||
        feature?.geometry?.type === "LineString" ||
        feature?.geometry?.type === "MultiLineString";
      return isRun ? allowed.has("runs") : allowed.has("points");
    }),
  };
}

function carrierFinderConfig() {
  const userId = Deno.env.get("CARRIERFINDER_USER_ID") || Deno.env.get("CF_USERID");
  const apiKey = Deno.env.get("CARRIERFINDER_API_KEY") || Deno.env.get("CF_KEY");
  const rawBase =
    Deno.env.get("CARRIERFINDER_BASE_URL") ||
    "https://api.carrierfinder.net/api.py";
  let url;
  try {
    url = new URL(rawBase);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !userId || !apiKey) return null;
  return { userId, apiKey, baseUrl: url.toString() };
}

async function carrierFinderCall({
  base44,
  config,
  action,
  params,
  logData,
}) {
  const callLog = await base44.asServiceRole.entities.CarrierFinderLookupLog.create({
    ...logData,
    lookup_id: crypto.randomUUID(),
    action,
    request_count: false,
    api_call: true,
    cache_hit: false,
    status: "accepted",
  });
  try {
    const url = new URL(config.baseUrl);
    Object.entries({
      ...params,
      userid: config.userId,
      key: config.apiKey,
    }).forEach(([key, value]) => url.searchParams.set(key, String(value)));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SiteHawk-CarrierFinder-Overlay/1.0",
      },
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw Object.assign(new Error("CarrierFinder response was too large."), {
        code: "carrierfinder_response_too_large",
      });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`CarrierFinder returned HTTP ${response.status}.`), {
        code: "carrierfinder_http_error",
      });
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Object.assign(new Error("CarrierFinder returned an unreadable response."), {
        code: "carrierfinder_invalid_json",
      });
    }
    await base44.asServiceRole.entities.CarrierFinderLookupLog.update(callLog.id, {
      status: "success",
    });
    return { ok: true, data };
  } catch (error) {
    await base44.asServiceRole.entities.CarrierFinderLookupLog.update(callLog.id, {
      status: "error",
      error_code: error?.code || "carrierfinder_request_failed",
    }).catch(() => null);
    return {
      ok: false,
      error: error?.message || "CarrierFinder request failed.",
      code: error?.code || "carrierfinder_request_failed",
    };
  }
}

Deno.serve(async (req) => {
  const now = new Date();
  let requestLog = null;
  let base44 = null;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { error: "Sign in to use CarrierFinder.", code: "unauthorized" },
        { status: 401 }
      );
    }
    if (!canUseCarrierFinder(user)) {
      return Response.json(
        {
          error: "CarrierFinder requires HawkVision Pro or higher.",
          code: "carrierfinder_upgrade_required",
          upgrade_to: "hawk_vision",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const action = body?.action === "metadata" ? "metadata" : "geojson";
    const bbox = parseBbox(body?.bbox);
    const layers = parseLayers(body?.layers);
    const zoom = Math.min(22, Math.max(0, finite(body?.zoom) ?? 14));
    if (!bbox || !layers) {
      return Response.json(
        { error: "A valid bbox and layer list are required.", code: "invalid_request" },
        { status: 400 }
      );
    }

    const diagonalMiles = haversineMiles(bbox[1], bbox[0], bbox[3], bbox[2]);
    if (diagonalMiles > MAX_BBOX_DIAGONAL_MILES + 0.01) {
      return Response.json(
        {
          error: "CarrierFinder lookups are limited to a 2-mile diagonal area.",
          code: "carrierfinder_bbox_too_large",
          max_diagonal_miles: MAX_BBOX_DIAGONAL_MILES,
        },
        { status: 400 }
      );
    }

    const requestId = crypto.randomUUID();
    const logData = baseLog(user, now, requestId);
    const minuteUsed = await countMinuteRequests(base44, user.id, logData.minute_key);
    if (minuteUsed >= REQUESTS_PER_MINUTE) {
      return Response.json(
        {
          error: "CarrierFinder is receiving too many requests. Try again in a minute.",
          code: "carrierfinder_rate_limited",
        },
        { status: 429 }
      );
    }

    requestLog = await base44.asServiceRole.entities.CarrierFinderLookupLog.create({
      ...logData,
      lookup_id: crypto.randomUUID(),
      action,
      request_count: true,
      api_call: false,
      cache_hit: false,
      status: "accepted",
      bbox,
    });

    const key = cacheKey(bbox, zoom, layers);
    const cached = await findCache(base44, key);
    const monthUsed = await countMonthlyApiCalls(base44, logData.month_key);
    const cacheFresh =
      cached?.geojson &&
      cached?.expires_at &&
      new Date(cached.expires_at).getTime() > now.getTime();

    if (action === "metadata") {
      const featureId = String(body?.featureId || "").slice(0, 96);
      if (!featureId || !cacheFresh) {
        await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
          status: "rejected",
          error_code: cacheFresh ? "feature_id_required" : "carrierfinder_cache_miss",
        });
        return Response.json(
          {
            error: cacheFresh
              ? "A feature id is required."
              : "Refresh the CarrierFinder overlay before opening details.",
            code: cacheFresh ? "feature_id_required" : "carrierfinder_cache_miss",
            quota: publicQuota(monthUsed),
          },
          { status: cacheFresh ? 400 : 404 }
        );
      }
      const feature = (cached.geojson?.features || []).find(
        (candidate) => String(candidate?.properties?.id || "") === featureId
      );
      const metadata = safeFeatureMetadata(feature);
      if (!metadata) {
        await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
          status: "rejected",
          error_code: "carrierfinder_feature_not_found",
        });
        return Response.json(
          {
            error: "CarrierFinder feature not found.",
            code: "carrierfinder_feature_not_found",
            quota: publicQuota(monthUsed),
          },
          { status: 404 }
        );
      }
      await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
        status: "success",
        cache_hit: true,
        feature_count: 1,
      });
      return Response.json({
        success: true,
        metadata,
        cache: { hit: true, expires_at: cached.expires_at },
        quota: publicQuota(monthUsed),
      });
    }

    if (cacheFresh) {
      await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
        status: "success",
        cache_hit: true,
        feature_count: cached.feature_count || cached.geojson?.features?.length || 0,
      });
      return Response.json({
        success: true,
        geojson: cached.geojson,
        cache: { hit: true, expires_at: cached.expires_at },
        quota: publicQuota(monthUsed),
      });
    }

    const config = carrierFinderConfig();
    if (!config) {
      await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
        status: "rejected",
        error_code: "carrierfinder_not_configured",
      });
      return Response.json(
        {
          error: "CarrierFinder is not configured in Base44 secrets.",
          code: "carrierfinder_not_configured",
          quota: publicQuota(monthUsed),
        },
        { status: 503 }
      );
    }

    const needsPoints = layers.includes("points");
    const callsNeeded = needsPoints ? 2 : 1;
    if (monthUsed + callsNeeded > GLOBAL_MONTHLY_API_CALL_LIMIT) {
      await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
        status: "rejected",
        error_code: "carrierfinder_monthly_quota_exceeded",
      });
      return Response.json(
        {
          error: "The monthly CarrierFinder allowance has been reached.",
          code: "carrierfinder_monthly_quota_exceeded",
          quota: publicQuota(monthUsed),
        },
        { status: 429 }
      );
    }

    const centerLat = (bbox[1] + bbox[3]) / 2;
    const centerLng = (bbox[0] + bbox[2]) / 2;
    const radiusMiles = Math.max(0.05, Math.min(1, diagonalMiles / 2));
    const sharedParams = {
      method: "geo",
      lat: centerLat.toFixed(6),
      lon: centerLng.toFixed(6),
    };
    const litPromise = carrierFinderCall({
      base44,
      config,
      action: "carrierfinder_litbuildings",
      params: {
        ...sharedParams,
        function: "get_litbuildings",
        radius: Math.round(radiusMiles * 5280),
        count: 100,
        carrier_count: 1,
      },
      logData,
    });
    const telcoPromise = needsPoints
      ? carrierFinderCall({
          base44,
          config,
          action: "carrierfinder_telcoinfo",
          params: { ...sharedParams, function: "get_telcoinfo" },
          logData,
        })
      : Promise.resolve({ ok: false, skipped: true, data: {} });

    const [lit, telco] = await Promise.all([litPromise, telcoPromise]);
    if (!lit.ok && !telco.ok) {
      await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
        status: "error",
        error_code: lit.code || telco.code || "carrierfinder_unavailable",
      });
      return Response.json(
        {
          error: "CarrierFinder is temporarily unavailable.",
          code: "carrierfinder_unavailable",
          quota: publicQuota(monthUsed + callsNeeded),
        },
        { status: 502 }
      );
    }

    const normalized = normalizeCarrierFinderGeoJson(
      lit.ok ? lit.data : {},
      telco.ok ? telco.data : {}
    );
    const geojson = filterLayers(normalized, layers);
    const fetchedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + CACHE_TTL_MS).toISOString();
    await saveCache(base44, cached, {
      cache_key: key,
      bbox,
      zoom,
      layers,
      geojson,
      feature_count: geojson.features.length,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
    });

    await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
      status: lit.ok && (telco.ok || telco.skipped) ? "success" : "partial",
      cache_hit: false,
      feature_count: geojson.features.length,
    });

    return Response.json({
      success: true,
      geojson,
      cache: { hit: false, expires_at: expiresAt },
      quota: publicQuota(monthUsed + callsNeeded),
      warnings: [
        ...(!lit.ok ? ["CarrierFinder lit-building data was unavailable."] : []),
        ...(!telco.ok && !telco.skipped ? ["CarrierFinder telco-office data was unavailable."] : []),
      ],
    });
  } catch (error) {
    console.error("carrierFinderOverlay error:", error);
    if (base44 && requestLog?.id) {
      await base44.asServiceRole.entities.CarrierFinderLookupLog.update(requestLog.id, {
        status: "error",
        error_code: "carrierfinder_overlay_failed",
      }).catch(() => null);
    }
    return Response.json(
      {
        error: "CarrierFinder overlay failed.",
        code: "carrierfinder_overlay_failed",
      },
      { status: 500 }
    );
  }
});
