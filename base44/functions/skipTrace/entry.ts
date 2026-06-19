/*
 * skipTrace — thin wrapper that delegates to skipTraceBatch (single mode).
 * Kept for backward compatibility with any direct callers.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    // Delegate to skipTraceBatch in single mode
    const result = await base44.functions.invoke("skipTraceBatch", body);
    return Response.json(result);
  } catch (error) {
    console.error("[skipTrace] error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});