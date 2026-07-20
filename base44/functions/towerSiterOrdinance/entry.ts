import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { findOrdinance } from '../../shared/telecomOrdinance.ts';

// HawkPerch ordinance lookup — served from the Base44 TelecomOrdinance entity
// (migrated from Supabase). Matching logic lives in shared/telecomOrdinance.ts.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { state, jurisdiction } = await req.json();
    if (!state || !jurisdiction) {
      return Response.json({ error: "state and jurisdiction required" }, { status: 400 });
    }

    const { row, rules } = await findOrdinance(base44, state, jurisdiction);
    return Response.json({ rules, matchedRow: !!row });
  } catch (error) {
    console.error("towerSiterOrdinance error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});