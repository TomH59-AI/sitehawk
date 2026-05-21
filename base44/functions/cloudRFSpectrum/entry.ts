import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// CloudRF interference/spectrum survey around a waypoint.
// Uses the /interference endpoint to return a heatmap of surrounding frequency activity.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, radius_mi = 5, frequency_mhz = 700 } = await req.json();
    if (lat == null || lon == null) return Response.json({ error: "lat and lon required" }, { status: 400 });

    const apiKey = Deno.env.get("CloudRF_API_KEY");
    if (!apiKey) return Response.json({ error: "CloudRF_API_KEY not set" }, { status: 500 });

    const radiusKm = radius_mi * 1.609344;

    const payload = {
      site: "SiteHawk Spectrum Survey",
      network: "sitehawk-spectrum",
      transmitter: {
        lat,
        lon,
        alt: 60,
        frq: frequency_mhz,
        txw: 40,
        bwi: 10,
      },
      receiver: {
        lat: 0,
        lon: 0,
        alt: 2,
        rxg: 2.15,
        rxs: -100,
      },
      antenna: { txg: 12, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 30, pol: "v" },
      model: { pm: 1, pe: 2, cli: 6, ked: 0, rel: 95, ter: 4 },
      environment: { clm: 1, cll: 2, mat: 0.25 },
      output: { units: "metric", col: "RAINBOW.dBm", out: 2, ber: 0, mod: 0, nf: -114, res: 30, rad: radiusKm },
    };

    const r = await fetch("https://api.cloudrf.com/interference", {
      method: "POST",
      headers: { "Content-Type": "application/json", key: apiKey },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (!r.ok) {
      return Response.json({ success: false, error: `CloudRF HTTP ${r.status}`, details: data }, { status: 502 });
    }
    return Response.json({
      success: true,
      png_url: data.PNG_Mercator || data.PNG_WGS84 || data.png_url || null,
      bounds: data.bounds || null,
      frequency_mhz,
      radius_mi,
      raw: { area: data.area, max_range: data.range },
    });
  } catch (error) {
    console.error("cloudRFSpectrum error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});