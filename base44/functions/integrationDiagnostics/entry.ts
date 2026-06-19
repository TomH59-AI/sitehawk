import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Lightweight integration health check.
// For each integration: confirms the secret is set and (where cheap) performs a single live ping.
// Never throws — returns { ok: bool, error?: string } per integration so the UI can render red/green dots.

async function check(name, fn) {
  try {
    const result = await fn();
    return { name, ...result };
  } catch (e) {
    return { name, ok: false, error: e.message || String(e) };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
    const cesiumToken = Deno.env.get("CESIUM_ION_API");
    const notionToken = Deno.env.get("NOTION_API_TOKEN");
    const notionDbId = Deno.env.get("NOTION_MASTER_ZONING_PAGE_ID");
    const realieKey = Deno.env.get("REALIE_API_KEY");
    const cloudrfKey = Deno.env.get("CloudRF_API_KEY");
    const lobKey = Deno.env.get("LOB_API_KEY");

    const checks = await Promise.all([
      check("Mapbox", async () => {
        if (!mapboxToken) return { ok: false, error: "MAPBOX_ACCESS_TOKEN secret not set" };
        const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/0,0.json?access_token=${mapboxToken}&limit=1`);
        if (!r.ok) return { ok: false, error: `Mapbox HTTP ${r.status}` };
        return { ok: true };
      }),
      check("Cesium", async () => {
        if (!cesiumToken) return { ok: false, error: "CESIUM_ION_API secret not set" };
        // Cesium Ion v1/assets is a GET endpoint that validates auth
        const r = await fetch("https://api.cesium.com/v1/assets?limit=1&type=IMAGERY", {
          headers: { Authorization: `Bearer ${cesiumToken}` },
        });
        if (r.status === 401 || r.status === 403) return { ok: false, error: `Cesium auth rejected (HTTP ${r.status})` };
        // 200 or even 404 means the token was accepted; we only flag auth failures
        return { ok: true };
      }),
      check("USGS", async () => {
        // Public tile service — ping a known tile
        const r = await fetch("https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer?f=json");
        if (!r.ok) return { ok: false, error: `USGS HTTP ${r.status}` };
        return { ok: true };
      }),
      check("Notion", async () => {
        if (!notionToken) return { ok: false, error: "NOTION_API_TOKEN secret not set" };
        if (!notionDbId) return { ok: false, error: "NOTION_MASTER_ZONING_PAGE_ID secret not set" };
        // Strip whitespace/non-hex chars, then insert canonical UUID dashes (8-4-4-4-12).
        const clean = notionDbId.trim().replace(/[^a-fA-F0-9]/g, "").toLowerCase();
        if (clean.length !== 32) {
          return { ok: false, error: `Notion DB ID has ${clean.length} hex chars (expected 32). Raw value: "${notionDbId.slice(0, 60)}"` };
        }
        const formattedId = `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
        // ID points to a Notion page (zoning content lives on a page, not a queryable DB)
        const r = await fetch(`https://api.notion.com/v1/pages/${formattedId}`, {
          headers: {
            Authorization: `Bearer ${notionToken.trim()}`,
            "Notion-Version": "2022-06-28",
          },
        });
        if (!r.ok) {
          const body = await r.text();
          return { ok: false, error: `Notion HTTP ${r.status} (id=${formattedId}): ${body.slice(0, 200)}` };
        }
        return { ok: true };
      }),
      check("Realie", async () => {
        if (!realieKey) return { ok: false, error: "REALIE_API_KEY secret not set" };
        // Realie auth ping — small location search at a known point
        const r = await fetch("https://app.realie.ai/api/public/property/location/?latitude=27.95&longitude=-82.45&radius=0.1&limit=1", {
          headers: { Authorization: realieKey },
        });
        if (r.status === 401 || r.status === 403) {
          return { ok: false, error: `Realie auth rejected (HTTP ${r.status})` };
        }
        if (!r.ok && r.status !== 404) return { ok: false, error: `Realie HTTP ${r.status}` };
        return { ok: true };
      }),
      check("CloudRF", async () => {
        if (!cloudrfKey) return { ok: false, error: "CloudRF_API_KEY secret not set" };
        return { ok: true, note: "Key present (full check on first simulation)" };
      }),
      check("Lob", async () => {
        if (!lobKey) return { ok: false, error: "LOB_API_KEY secret not set" };
        // /us_verifications/zip_lookups is the lightest valid Lob call that works with both test & live keys
        const r = await fetch("https://api.lob.com/v1/us_zip_lookups", {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(lobKey + ":")}`, "Content-Type": "application/json" },
          body: JSON.stringify({ zip_code: "94107" }),
        });
        if (r.status === 401) return { ok: false, error: "Lob auth rejected — verify LOB_API_KEY" };
        if (r.status === 403) return { ok: false, error: "Lob HTTP 403 — key may lack permissions" };
        if (!r.ok && r.status !== 422) return { ok: false, error: `Lob HTTP ${r.status}` };
        return { ok: true };
      }),
    ]);

    return Response.json({ checks });
  } catch (error) {
    console.error("integrationDiagnostics error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});