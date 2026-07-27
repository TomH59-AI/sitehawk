import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    let accessToken;
    try {
      ({ accessToken } = await base44.asServiceRole.connectors.getConnection("hubspot"));
    } catch {
      return Response.json({ status: "disconnected" });
    }
    if (!accessToken) return Response.json({ status: "disconnected" });

    const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401 || response.status === 403) {
      return Response.json({ status: "disconnected" });
    }
    if (!response.ok) {
      console.error(`hubspotStatus check failed: HTTP ${response.status}`);
      return Response.json({ status: "error" });
    }

    return Response.json({ status: "connected", checked_at: new Date().toISOString() });
  } catch (error) {
    console.error("hubspotStatus error:", error.message);
    return Response.json({ status: "error" });
  }
}