import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns the Regrid vector parcel tile URL template(s) for authed users.
// The tokenized tile URLs come from Regrid's TileJSON endpoint.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('REGRID_API_KEY');
    const res = await fetch(`https://tiles.regrid.com/api/v1/parcels?token=${encodeURIComponent(token || '')}&format=mvt`);
    if (!res.ok) {
      const detail = await res.text();
      console.error('Regrid TileJSON fetch failed', res.status, detail.slice(0, 300));
      return Response.json({ error: `Regrid tileserver returned ${res.status}` }, { status: 502 });
    }
    const tilejson = await res.json();

    return Response.json({
      tiles: tilejson.tiles,          // MVT tile URL template(s), token included
      source_layer: tilejson.id || 'parcels',
      max_zoom: tilejson.maxZoom || 21,
    });
  } catch (error) {
    console.error('regridParcelTiles error', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});