// CloudRF Coverage Simulation — runs an /area calculation for a 199-ft tower
// at the candidate's lat/lon and returns a static PNG heatmap URL + stats.
// Docs: https://api.cloudrf.com/
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CLOUDRF_BASE = "https://api.cloudrf.com";

// Carrier presets — keep in sync with src/lib/carrierPresets.js
const CARRIER_PRESETS = {
  verizon:        { frequency_mhz: 700,  power_w: 40, antenna_gain_dbi: 16, hbw: 65 },
  verizon_cband:  { frequency_mhz: 3700, power_w: 20, antenna_gain_dbi: 24, hbw: 65 },
  att:            { frequency_mhz: 850,  power_w: 40, antenna_gain_dbi: 16, hbw: 65 },
  tmobile:        { frequency_mhz: 600,  power_w: 40, antenna_gain_dbi: 16, hbw: 65 },
  tmobile_2500:   { frequency_mhz: 2500, power_w: 30, antenna_gain_dbi: 20, hbw: 65 },
  generic:        { frequency_mhz: 700,  power_w: 40, antenna_gain_dbi: 12, hbw: 360 },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { lat, lon, height_ft = 199, radius_mi = 5, site_name = "SiteHawk Candidate", carrier = "verizon", frequency_mhz } = await req.json();
    if (typeof lat !== "number" || typeof lon !== "number") {
      return Response.json({ error: "lat and lon are required numbers" }, { status: 400 });
    }

    const apiKey = Deno.env.get("CloudRF_API_KEY");
    if (!apiKey) return Response.json({ error: "CloudRF_API_KEY not configured" }, { status: 500 });

    // Resolve carrier preset → CloudRF inputs. If frequency_mhz override is
    // provided, swap it into the preset so the Coverage Analysis page can drive
    // the simulation directly from its frequency dropdown.
    const basePreset = CARRIER_PRESETS[carrier] || CARRIER_PRESETS.verizon;
    const preset = typeof frequency_mhz === "number" && frequency_mhz > 0
      ? { ...basePreset, frequency_mhz }
      : basePreset;

    // Convert ft → meters
    const txHeightM = Math.round(height_ft * 0.3048);
    const radiusKm = Math.round(radius_mi * 1.60934);

    // CloudRF /area request — defaults tuned per carrier preset
    const payload = {
      site: site_name.substring(0, 60),
      network: "SiteHawk",
      transmitter: {
        lat, lon, alt: txHeightM, frq: preset.frequency_mhz, txw: preset.power_w, bwi: 10, powerUnit: "W"
      },
      receiver: { lat: 0, lon: 0, alt: 2, rxg: 2, rxs: -100 },
      antenna: {
        txg: preset.antenna_gain_dbi, txl: 0, ant: 1, azi: 0, tlt: 0, hbw: preset.hbw, vbw: 30, fbr: 0,
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
        ber: 1,
        mod: 1,
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
        carrier,
        frequency_mhz: preset.frequency_mhz,
        power_w: preset.power_w,
        antenna_gain_dbi: preset.antenna_gain_dbi,
        receiver_sensitivity_dbm: -100,
      },
      raw_id: data.id || null,
    });
  } catch (error) {
    console.error("cloudRFCoverage error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});