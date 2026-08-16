import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { lat, lon } = await req.json()

    // Point-in-polygon query against HIFLD Electric Retail Service Territories
    const url = 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services' +
      '/Electric_Retail_Service_Territories/FeatureServer/0/query' +
      `?f=geojson` +
      `&geometry=${encodeURIComponent(`${lon},${lat}`)}` +
      `&geometryType=esriGeometryPoint` +
      `&inSR=4326` +
      `&spatialRel=esriSpatialRelWithin` +
      `&outFields=${encodeURIComponent('NAME,ADDRESS,CITY,STATE,ZIP,TELEPHONE,WEBSITE,NAICS_DESC')}` +
      `&returnGeometry=false` +
      `&resultRecordCount=3` +
      `&outSR=4326`

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'SiteHawk/1.0 (telecom site acquisition)',
        'Accept': 'application/json',
      },
    })

    if (!resp.ok) throw new Error(`HIFLD HTTP ${resp.status}`)
    const data = await resp.json()

    const utilities = (data.features || []).map((f: any) => ({
      name: f.properties?.NAME || 'Unknown Utility',
      address: [f.properties?.ADDRESS, f.properties?.CITY, f.properties?.STATE, f.properties?.ZIP]
        .filter(Boolean).join(', '),
      phone: f.properties?.TELEPHONE || '',
      website: f.properties?.WEBSITE || '',
      type: f.properties?.NAICS_DESC || '',
      source: 'HIFLD Electric Retail Service Territories',
    }))

    return new Response(
      JSON.stringify({ lat, lon, utilities, count: utilities.length, source: 'HIFLD' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), utilities: [], count: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
