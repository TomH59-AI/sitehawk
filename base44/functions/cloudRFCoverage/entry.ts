// CloudRF Coverage Simulation — runs an /area calculation for a 199-ft tower
// at the candidate's lat/lon and returns a static PNG heatmap URL + stats.
// Docs: https://api.cloudrf.com/
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CLOUDRF_BASE = "https://api.cloudrf.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, height_ft = 199, radius_mi = 5, site_name = "SiteHawk Candidate" } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon are required numbers" }, { status: 400 });
    }

    const apiKey = Deno.env.get("CloudRF_API_KEY");
    if (!apiKey) return Response.json({ error: "CloudRF_API_KEY not configured" }, { status: 500 });

    // Convert ft → meters
    const txHeightM = Math.round(height_ft * 0.3048);
    const radiusKm = Math.round(radius_mi * 1.60934);

    // CloudRF /area request — sensible defaults for 4G LTE @ 700 MHz omni
    const payload = {
      site: site_name.substring(0, 60),
      network: "SiteHawk",
      transmitter: {
        lat, lon, alt: txHeightM, frq: 700, txw: 40, bwi: 10, powerUnit: "W"
      },
      receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: -100 },
      antenna: {
        txg: 12, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: 360, vbw: 30, fbr: 0,
        pol: "v"
      },
      model: {
        pm: 1, pe: 2, ked: 0, rel: 95, ter: 4, cli: 6
      },
      environment: { clm: 1, cll: 2, mat: 0 },
      output: {
        units: "m",
        col: "RAINBOW.dBm",
        out: 2,
        ber: 0,
        mod: 0,
        nf: -120,
        res: 30,
        rad: radiusKm
      }
    };

    const res = await fetch(`${CLOUDRF_BASE}/area`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "key": apiKey },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("CloudRF /area failed:", res.status, text);
      return Response.json({ error: `CloudRF API error: ${res.status}`, detail: text }, { status: 502 });
    }

    const data = await res.json();

    // CloudRF returns PNG_Mercator + bounds + key statistics
    return Response.json({
      success: true,
      site_name,
      height_ft,
      radius_mi,
      png_url: data.PNG_Mercator || data.PNG_WGS84 || null,
      kmz_url: data.kmz || null,
      bounds: data.bounds || null,
      area_covered_sq_km: data.area || null,
      max_range_km: data.coverage?.range || null,
      key_data: {
        center: { lat, lon },
        tx_height_m: txHeightM,
        frequency_mhz: 700,
        power_w: 40,
        antenna_gain_dbi: 12,
        receiver_sensitivity_dbm: -100,
      },
      raw_id: data.id || null,
    });
  } catch (error) {
    console.error("cloudRFCoverage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});