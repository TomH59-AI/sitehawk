import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HIFLD_BASE = 'https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services'

async function queryHifld(
  serviceUrl: string,
  bbox: { west: number; south: number; east: number; north: number },
  outFields: string,
  extraParams: string = ''
): Promise<any[]> {
  const geometry = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`
  const url = `${serviceUrl}/query?f=geojson` +
    `&geometry=${encodeURIComponent(geometry)}` +
    `&geometryType=esriGeometryEnvelope` +
    `&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&outFields=${encodeURIComponent(outFields)}` +
    `&resultRecordCount=500` +
    `&outSR=4326` +
    extraParams

  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'SiteHawk/1.0 (telecom site acquisition)',
      'Accept': 'application/json',
    },
  })
  if (!resp.ok) return []
  const data = await resp.json()
  return data.features || []
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bbox, layer } = await req.json()

    let features: any[] = []

    if (layer === 'substations') {
      const raw = await queryHifld(
        `${HIFLD_BASE}/Electric_Substations/FeatureServer/0`,
        bbox,
        'NAME,OWNER,STATE,COUNTY,NAICS_DESC,TYPE,STATUS,LINES,MAX_VOLT,MIN_VOLT,TELEPHONE'
      )
      features = raw.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          id: `hifld_sub_${f.properties?.OBJECTID || Math.random()}`,
          name: f.properties?.NAME || 'Substation',
          owner: f.properties?.OWNER || '',
          type: f.properties?.TYPE || '',
          status: f.properties?.STATUS || '',
          max_voltage_kv: f.properties?.MAX_VOLT,
          min_voltage_kv: f.properties?.MIN_VOLT,
          lines: f.properties?.LINES,
          phone: f.properties?.TELEPHONE || '',
          county: f.properties?.COUNTY || '',
          state: f.properties?.STATE || '',
          source: 'HIFLD',
          layer: 'substations',
        },
      }))
    } else if (layer === 'electric_service_territory') {
      const raw = await queryHifld(
        `${HIFLD_BASE}/Electric_Retail_Service_Territories/FeatureServer/0`,
        bbox,
        'NAME,ADDRESS,CITY,STATE,ZIP,TELEPHONE,WEBSITE,NAICS_DESC,SOURCEDATE'
      )
      features = raw.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          id: `hifld_est_${f.properties?.OBJECTID || Math.random()}`,
          name: f.properties?.NAME || 'Unknown Utility',
          address: f.properties?.ADDRESS || '',
          city: f.properties?.CITY || '',
          state: f.properties?.STATE || '',
          zip: f.properties?.ZIP || '',
          phone: f.properties?.TELEPHONE || '',
          website: f.properties?.WEBSITE || '',
          utility_type: f.properties?.NAICS_DESC || '',
          source: 'HIFLD',
          layer: 'electric_service_territory',
        },
      }))
    }

    return new Response(
      JSON.stringify({
        type: 'FeatureCollection',
        features,
        meta: { count: features.length, layer, source: 'HIFLD', bbox },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), type: 'FeatureCollection', features: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
