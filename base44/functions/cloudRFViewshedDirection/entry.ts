// cloudRFViewshedDirection — Section 5 directional RF viewshed via CloudRF /area.
// Runs a 90°-beam coverage simulation for ONE cardinal direction (N/S/E/W) at
// the Target A tower and returns a static heatmap PNG + geographic bounds the
// frontend overlays on a Mapbox satellite map. This replaces the fragile
// hand-drawn canvas cone with a real propagation render.
//
// Payload: { lat, lon, bearing, height_ft=199, radius_mi=1, frequency_mhz=700,
//            power_w=40, antenna_gain_dbi=16, hbw=90, site_name }
// Returns: { success, png_url, bounds:[[w,s],[e,n]] or {north,south,east,west},
//            area_covered_sq_km, max_range_km }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CLOUDRF_BASE = "https://api.cloudrf.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const {
      lat, lon, bearing = 0, height_ft = 199, radius_mi = 1,
      frequency_mhz = 700, power_w = 40, antenna_gain_dbi = 16, hbw = 90,
      site_name = "SiteHawk Viewshed",
    } = await req.json();

    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon are required numbers" }, { status: 400 });
    }

    const apiKey = Deno.env.get("CloudRF_API_KEY");
    if (!apiKey) return Response.json({ error: "CloudRF_API_KEY not configured" }, { status: 500 });

    const txHeightM = Math.round(height_ft * 0.3048);
    const radiusKm = Math.max(1, Math.round(radius_mi * 1.60934));

    // Directional beam: azimuth = the cardinal bearing, hbw = 90° wide so the
    // four directions (N/S/E/W) tile the full 360° around the tower.
    const payload = {
      site: site_name.substring(0, 60),
      network: "SiteHawk",
      transmitter: { lat, lon, alt: txHeightM, frq: frequency_mhz, txw: power_w, bwi: 10, powerUnit: "W" },
      receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: -100 },
      antenna: { txg: antenna_gain_dbi, txl: 0, ant: 1, azi: bearing, tlt: 0, hbw, vbw: 30, fbr: 0, pol: "v" },
      model: { pm: 1, pe: 2, ked: 0, rel: 95, ter: 4, cli: 6 },
      environment: { clm: 1, cll: 2, mat: 0 },
      output: { units: "m", col: "RAINBOW.dBm", out: 2, ber: 1, mod: 1, nf: -120, res: 20, rad: radiusKm },
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
    return Response.json({
      success: true,
      bearing,
      png_url: data.PNG_Mercator || data.PNG_WGS84 || null,
      bounds: data.bounds || null,
      area_covered_sq_km: data.area || null,
      max_range_km: data.coverage?.range || null,
      raw_id: data.id || null,
    });
  } catch (error) {
    console.error("cloudRFViewshedDirection error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});