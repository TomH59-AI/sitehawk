import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('REGRID_API_KEY');
    const res = await fetch(`https://tiles.regrid.com/api/v1/parcels?token=${encodeURIComponent(token || '')}&format=mvt`);
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }

    return Response.json({
      has_tileserver_access: res.ok,
      status: res.status,
      body,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});