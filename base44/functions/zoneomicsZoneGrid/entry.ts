// DISABLED — Zoneomics removed to stop runaway billing charges.
// All zoning map data now comes from zoneResolve (ArcGIS / FL GeoPlan).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
Deno.serve(async (req) => {
  return Response.json({ ok: false, cells: [], districts: [], count: 0, disabled: true, error: 'Zoneomics disabled — use zoneResolve instead.' });
});