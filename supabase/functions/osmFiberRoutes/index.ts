import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bbox } = await req.json()
    // bbox = { north, south, east, west }

    const overpassQuery = `[out:json][timeout:55];
(
  way["communication"="line"]["communication:fibre_optic"="yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["communication"="line"]["communication:medium"="fibre"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["cable"="fiber_optic"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["man_made"="street_cabinet"]["utility"="telecom"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["man_made"="manhole"]["telecom"="yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["man_made"="junction_box"]["telecom"="yes"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out geom;`

    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    })

    if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`)
    const osm = await resp.json()

    const features: any[] = []

    for (const el of (osm.elements || [])) {
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: el.geometry.map((n: any) => [n.lon, n.lat]),
          },
          properties: {
            id: `osm_way_${el.id}`,
            provider: 'osm_fiber',
            name: el.tags?.name || el.tags?.operator || 'OSM Fiber Route',
            operator: el.tags?.operator || '',
            source: 'OpenStreetMap',
          },
        })
      } else if (el.type === 'node' && el.lat != null && el.lon != null) {
        const tags = el.tags || {}
        const isSplice = ['street_cabinet', 'manhole', 'junction_box'].includes(tags.man_made)
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: {
            id: `osm_node_${el.id}`,
            route_type: isSplice ? 'splice_point' : 'point',
            provider: 'osm_fiber',
            name: tags.name || tags.ref || `Telecom ${tags.man_made || 'Node'}`,
            description: `OSM telecom ${tags.man_made} — ${tags.operator || 'unknown operator'}`,
            source: 'OpenStreetMap',
          },
        })
      }
    }

    return new Response(
      JSON.stringify({ type: 'FeatureCollection', features, meta: { count: features.length, source: 'OSM Overpass', bbox } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), type: 'FeatureCollection', features: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
