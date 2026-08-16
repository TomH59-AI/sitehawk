import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { lat, lon } = await req.json()
    const url = new URL('https://broadbandmap.fcc.gov/api/public/map/listAvailability')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lon))
    url.searchParams.set('unit', 'B')
    url.searchParams.set('category', 'Residential')

    const resp = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'SiteHawk/1.0 (telecom site acquisition)',
        'Accept': 'application/json',
      },
    })
    if (!resp.ok) throw new Error(`FCC BDC HTTP ${resp.status}`)
    const data = await resp.json()

    const fiberProviders = (data.availability || data.data || [])
      .filter((p: any) => Number(p.technology_code) === 50)
      .reduce((acc: any[], p: any) => {
        if (!acc.find((x: any) => x.provider_id === p.provider_id)) {
          acc.push({
            provider_id: p.provider_id,
            provider_name: p.holding_company_name || p.brand_name || p.dba_name || p.provider_name || 'Unknown',
            frn: p.frn || '',
            max_down_mbps: p.max_advertised_download_speed || 0,
            max_up_mbps: p.max_advertised_upload_speed || 0,
            technology: 'Fiber to the Premises (FTTP)',
            source: 'FCC BDC',
          })
        }
        return acc
      }, [])

    return new Response(
      JSON.stringify({ lat, lon, fiber_providers: fiberProviders, count: fiberProviders.length, source: 'FCC National Broadband Map' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err), fiber_providers: [], count: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
