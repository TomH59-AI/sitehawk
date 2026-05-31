import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuthenticated = await base44.auth.isAuthenticated();

    if (!isAuthenticated) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json({
      mapboxAccessToken: Deno.env.get("MAPBOX_ACCESS_TOKEN") || "",
      cesiumIonToken: Deno.env.get("CESIUM_ION_API") || "",
      zoneomicsApiKey: Deno.env.get("ZONEOMICS_API_KEY") || "",
    });
  } catch (error) {
    console.error("getPublicConfig error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});