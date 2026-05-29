import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Build a GeoJSON circle polygon (ring of points) around a center, given radius in miles.
function circlePolygon(lat, lon, radiusMiles, steps = 48) {
  const radiusKm = radiusMiles * 1.609344;
  const coords = [];
  const latR = (lat * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(theta);
    const dy = radiusKm * Math.sin(theta);
    const dLat = dy / 110.574;
    const dLon = dx / (111.320 * Math.cos(latR));
    coords.push([Number((lon + dLon).toFixed(5)), Number((lat + dLat).toFixed(5))]);
  }
  return coords;
}

// Approximate the zoom that fits the selected radius into ~70% of map height (850px @2x).
function fitZoom(lat, radiusMiles, mapHeightPx = 850) {
  const radiusMeters = radiusMiles * 1609.344;
  // We want the diameter (2*radius) to span ~70% of map height.
  const targetMeters = (2 * radiusMeters) / 0.70;
  const latR = (lat * Math.PI) / 180;
  // meters per pixel at zoom z = 156543.03392 * cos(lat) / 2^z
  // solve for z so that mapHeightPx * mpp = targetMeters
  const mpp = targetMeters / mapHeightPx;
  const z = Math.log2((156543.03392 * Math.cos(latR)) / mpp);
  return Math.max(8, Math.min(17, z));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const token = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!token) return Response.json({ error: 'Mapbox token not configured' }, { status: 500 });

    const { lat, lon, search_radius, site_name } = await req.json();
    const latN = Number(lat);
    const lonN = Number(lon);
    const selected = String(search_radius);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      return Response.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const SKY_BLUE = '#1B3FAE';
    const SKY_YELLOW = '#FFC72C';
    const SKY_NAVY = '#0F2876';

    const allRadii = ['0.25', '0.50', '1.00'];
    const features = [];

    // Reference (other) radii — light, fewer points. Drawn first so selected sits on top.
    for (const r of allRadii) {
      if (r === selected) continue;
      features.push({
        type: 'Feature',
        properties: { stroke: SKY_BLUE, 'stroke-width': 1.5, 'stroke-opacity': 0.45, 'fill-opacity': 0 },
        geometry: { type: 'Polygon', coordinates: [circlePolygon(latN, lonN, parseFloat(r), 36)] },
      });
    }

    // Selected radius — solid, prominent, light blue fill.
    features.push({
      type: 'Feature',
      properties: { stroke: SKY_BLUE, 'stroke-width': 3, 'stroke-opacity': 1, fill: SKY_BLUE, 'fill-opacity': 0.10 },
      geometry: { type: 'Polygon', coordinates: [circlePolygon(latN, lonN, parseFloat(selected), 48)] },
    });

    const geojson = encodeURIComponent(JSON.stringify({ type: 'FeatureCollection', features }));
    // Compact yellow center pin via Mapbox marker syntax (much shorter than a GeoJSON point).
    const pin = `pin-l+${SKY_YELLOW.replace('#', '')}(${lonN},${latN})`;
    const zoom = fitZoom(latN, parseFloat(selected)).toFixed(2);
    const size = '1100x850@2x';

    const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/geojson(${geojson}),${pin}/${lonN},${latN},${zoom},0/${size}?access_token=${token}&attribution=true&logo=true`;

    // Fetch the rendered PNG and persist it for a stable URL.
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      const txt = await imgRes.text();
      console.error('Mapbox static render failed:', imgRes.status, txt.slice(0, 300));
      return Response.json({ error: `Map render failed (${imgRes.status})` }, { status: 502 });
    }
    const blob = await imgRes.blob();
    const safeName = (site_name || 'sarf').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
    const file = new File([blob], `sarf_${safeName}.png`, { type: 'image/png' });
    const uploaded = await base44.integrations.Core.UploadFile({ file });

    return Response.json({
      map_image_url: uploaded.file_url,
      bbox: null,
      width: 1100,
      height: 850,
      zoom: Number(zoom),
    });
  } catch (error) {
    console.error('generateSarfMap error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});