import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { lat, lon, radius_deg = 1.5 } = await req.json()

    const url = new URL('https://www.peeringdb.com/api/fac')
    url.searchParams.set('format', 'json')
    url.searchParams.set('status', 'ok')
    url.searchParams.set('latitude__gte', String(lat - radius_deg))
    url.searchParams.set('latitude__lte', String(lat + radius_deg))
    url.searchParams.set('longitude__gte', String(lon - radius_deg))
    url.searchParams.set('longitude__lte', String(lon + radius_deg))

    const resp = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SiteHawk/1.0 (telecom site acquisition platform)',
        'Accept': 'application/json',
      },
    })

    if (!resp.ok) throw new Error(`PeeringDB HTTP ${resp.status}`)
    const data = await resp.json()

    const features = (data.data || [])
      .filter((f: any) => f.latitude && f.longitude)
      .map((f: any) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [parseFloat(f.longitude), parseFloat(f.latitude)],
        },
        properties: {
          id: `pdb_${f.id}`,
          route_type: 'splice_point',
          name: f.name,
          org: f.org_name || '',
          city: f.city,
          state: f.state,
          phone: f.phone || '',
          website: f.website || '',
          peeringdb_url: `https://www.peeringdb.com/fac/${f.id}`,
          type: 'Carrier PoP / Backhaul Node',
          source: 'PeeringDB',
        },
      }))

    return new Response(
      JSON.stringify({ type: 'FeatureCollection', features, meta: { count: features.length, source: 'PeeringDB', lat, lon } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), type: 'FeatureCollection', features: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
