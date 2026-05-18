import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// USGS Elevation Point Query Service (EPQS) — free, no key required
// Returns ground elevation in feet AMSL for any lat/lon in the US.
const EPQS_URL = "https://epqs.nationalmap.gov/v1/json";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { lat, lon } = await req.json();
    if (lat == null || lon == null) {
      return Response.json({ error: 'lat and lon are required' }, { status: 400 });
    }

    const url = `${EPQS_URL}?x=${lon}&y=${lat}&units=Feet&wkid=4326&includeDate=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EPQS request failed: ${res.status}`);

    const data = await res.json();
    // EPQS response: { value: <feet> } or { value: -1000000 } on no-data
    const raw = data?.value;
    const elevation_ft = (raw != null && raw > -100000) ? parseFloat(parseFloat(raw).toFixed(1)) : null;

    console.log(`EPQS: elevation at ${lat},${lon} = ${elevation_ft} ft AMSL`);

    return Response.json({
      elevation_ft,
      lat,
      lon,
      units: "feet",
      datum: "NAVD88",
      source: "USGS EPQS (3DEP)",
    });
  } catch (error) {
    console.error('pointElevation error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});