// DISABLED — Zoneomics removed to stop runaway billing charges.
// All FLUM data now comes from zoneResolve (ArcGIS / FL GeoPlan).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
Deno.serve(async (req) => {
  return Response.json({ ok: false, flum: null, disabled: true, error: 'Zoneomics disabled — use zoneResolve instead.' });
});