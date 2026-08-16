import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { bbox, layer } = await req.json()
    // bbox = { north, south, east, west }
    // layer = one of: transmission_lines, distribution_lines, transmission_towers,
    //                 distribution_poles, transformers

    const s = bbox.south, w = bbox.west, n = bbox.north, e = bbox.east

    // Build targeted Overpass query based on requested layer
    let overpassQuery = `[out:json][timeout:55];\n(`

    if (layer === 'transmission_lines') {
      overpassQuery += `
  way["power"="line"](${s},${w},${n},${e});
  way["power"="cable"]["location"!="underground"](${s},${w},${n},${e});`
    } else if (layer === 'distribution_lines') {
      overpassQuery += `
  way["power"="minor_line"](${s},${w},${n},${e});
  way["power"="cable"]["location"="underground"](${s},${w},${n},${e});`
    } else if (layer === 'transmission_towers') {
      overpassQuery += `
  node["power"="tower"](${s},${w},${n},${e});`
    } else if (layer === 'distribution_poles') {
      overpassQuery += `
  node["power"="pole"](${s},${w},${n},${e});`
    } else if (layer === 'transformers') {
      overpassQuery += `
  node["power"="transformer"](${s},${w},${n},${e});
  way["power"="transformer"](${s},${w},${n},${e});`
    } else {
      // Default: all power infrastructure in bbox
      overpassQuery += `
  way["power"="line"](${s},${w},${n},${e});
  way["power"="minor_line"](${s},${w},${n},${e});
  way["power"="cable"](${s},${w},${n},${e});
  node["power"="tower"](${s},${w},${n},${e});
  node["power"="pole"](${s},${w},${n},${e});
  node["power"="transformer"](${s},${w},${n},${e});`
    }

    overpassQuery += `\n);\nout geom;`

    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    })

    if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`)
    const osm = await resp.json()

    const features: any[] = []

    for (const el of (osm.elements || [])) {
      const tags = el.tags || {}
      const voltageRaw = tags.voltage || ''
      // OSM voltage tag is in volts (e.g. "138000") — convert to kV
      const voltageKv = voltageRaw
        ? Math.round(parseFloat(voltageRaw.split(';')[0]) / 1000)
        : null
      const operator = tags.operator || tags['operator:en'] || ''
      const name = tags.name || tags.ref || ''

      const props: any = {
        id: `osm_${el.type}_${el.id}`,
        power_type: tags.power || 'unknown',
        voltage: voltageKv,        // kV for Mapbox expression
        voltage_display: voltageKv ? `${voltageKv} kV` : '',
        operator,
        name,
        location: tags.location || 'overhead',
        material: tags.material || '',
        source: 'OpenStreetMap',
        layer,
      }

      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: el.geometry.map((n: any) => [n.lon, n.lat]),
          },
          properties: props,
        })
      } else if (el.type === 'node' && el.lat != null && el.lon != null) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: props,
        })
      }
    }

    return new Response(
      JSON.stringify({
        type: 'FeatureCollection',
        features,
        meta: { count: features.length, layer, source: 'OSM Overpass', bbox },
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
