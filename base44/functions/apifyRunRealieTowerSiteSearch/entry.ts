// functions/apifyRunRealieTowerSiteSearch.js
//
// Mirrors realieTowerSiteSearch but sources parcel data via the Apify actor
// hodges.thomas~realie-tower-site-search instead of calling Realie directly.
//
// Uses the run-sync-get-dataset-items endpoint so the HTTP call blocks until
// the actor finishes and returns the dataset items array in one shot.
//
// Input body:
// {
//   latitude              // required (number)
//   longitude             // required (number)
//   limit                 // accepted but not forwarded (ignored by actor)
//   frequencyMHz          // optional string, default "700"
//   losThresholdDbm       // optional string, default "-100"
//   pathGatesDeliverable  // optional bool,   default false
//   rxHeightM             // optional string, default "2"
//   txHeightM             // optional string, default "60.7"
// }
//
// NOTE: cloudRfApiKey and realieApiKey are stored as encrypted secrets
// inside Apify itself — the actor pulls them from there; do NOT pass them here.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ACTOR_ID = "hodges.thomas~realie-tower-site-search";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST" },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: "Unauthorized" }, 401);

    let body;
    try { body = await req.json(); } catch { return json({ error: "body must be JSON" }, 400); }

    const {
      latitude,
      longitude,
      limit,           // accepted for caller compatibility, not forwarded
      frequencyMHz,
      losThresholdDbm,
      pathGatesDeliverable,
      rxHeightM,
      txHeightM,
    } = body || {};

    if (latitude == null || longitude == null) {
      return json({ error: "latitude and longitude are required" }, 400);
    }


    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    if (!apifyToken) return json({ error: "APIFY_API_TOKEN not configured" }, 500);

    const realieApiKey = Deno.env.get("REALIE_API_KEY");
    if (!realieApiKey) return json({ error: "REALIE_API_KEY not configured" }, 500);

    const cloudRfApiKey = Deno.env.get("CloudRF_API_KEY");
    if (!cloudRfApiKey) return json({ error: "CloudRF_API_KEY not configured" }, 500);

    const url = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
      candidates: [{ name: "Candidate-1", lat: latitude, lon: longitude }],
      lat: String(latitude),
      lon: String(longitude),
      frequencyMHz:         frequencyMHz         ?? "700",
      losThresholdDbm:      losThresholdDbm      ?? "-100",
      pathGatesDeliverable: pathGatesDeliverable ?? false,
      rxHeightM:            rxHeightM            ?? "2",
      txHeightM:            txHeightM            ?? "60.7",
      realieApiKey,
      cloudRfApiKey,
    };

    console.log(`[apifyRunRealieTowerSiteSearch] Triggering actor for lat=${latitude} lon=${longitude}`);

    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actorInput),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error(`[apifyRunRealieTowerSiteSearch] Apify HTTP ${r.status}: ${text.slice(0, 500)}`);
      return json({ error: `Apify HTTP ${r.status}`, status: r.status, body: text.slice(0, 300) }, 502);
    }

    const items = await r.json();
    console.log(`[apifyRunRealieTowerSiteSearch] Actor returned ${Array.isArray(items) ? items.length : "?"} items`);

    return json({ items: Array.isArray(items) ? items : [] });

  } catch (error) {
    console.error("[apifyRunRealieTowerSiteSearch] error:", error.message);
    return json({ error: error.message }, 500);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}